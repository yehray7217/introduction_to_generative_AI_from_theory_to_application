import { NextResponse } from "next/server";
import { detectAndRunTools } from "../../../lib/tools";
import { formatMemoryForPrompt, readMemories } from "../../../lib/memory-store";
import { routeRequest } from "../../../lib/router";
import type { ChatMessage, ImageAttachment, ToolCallLog } from "../../../lib/types";

type ModelContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: ModelContent;
};

async function callNvidiaChat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature,
  topP,
  maxTokens = 500,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  temperature: number;
  topP: number;
  maxTokens?: number;
}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function buildSummaryMessages(summary: string, recentMessages: ChatMessage[]): ModelMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a conversation memory summarizer. Update the short-term conversation summary. Keep it concise, factual, and useful for future turns. Return only the updated summary.",
    },
    { role: "user", content: `Previous summary:\n${summary || "(empty)"}` },
    { role: "user", content: `Recent dialogue:\n${JSON.stringify(recentMessages, null, 2)}` },
  ];
}

function buildUserContentWithImages(text: string, images: ImageAttachment[]): ModelContent {
  if (images.length === 0) return text;

  return [
    { type: "text", text: text || "Please analyze the attached image." },
    ...images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: image.dataUrl },
    })),
  ];
}

function buildFinalMessages({
  systemPrompt,
  longTermMemoryText,
  updatedSummary,
  toolCalls,
  recentMessages,
  images,
}: {
  systemPrompt: string;
  longTermMemoryText: string;
  updatedSummary: string;
  toolCalls: ToolCallLog[];
  recentMessages: ChatMessage[];
  images: ImageAttachment[];
}): ModelMessage[] {
  const finalMessages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `
  Available local MCP-style tools are strictly limited to:
  1. calculator(expression): evaluate simple arithmetic expressions.
  2. get_current_time(): get the current date and time in Asia/Taipei.
  3. save_memory(key, value): save a long-term memory item.
  4. search_memory(query): search saved long-term memory items.
      `.trim(),
    },
    {
      role: "system",
      content: `Short-term conversation summary:\n${updatedSummary || "(empty)"}`,
    },
    {
      role: "system",
      content: `Long-term memory:\n${longTermMemoryText}`,
    },
  ];

  if (toolCalls.length > 0) {
    finalMessages.push({
      role: "system",
      content: `Tool results from the local MCP-style tool layer:\n${JSON.stringify(toolCalls, null, 2)}\nUse these tool results when answering. Do not pretend you calculated them mentally.`,
    });
  }

  recentMessages.forEach((message, index) => {
    const isLastUserMessage = index === recentMessages.length - 1 && message.role === "user";
    finalMessages.push({
      role: message.role,
      content: isLastUserMessage ? buildUserContentWithImages(message.content, images) : message.content,
    });
  });

  return finalMessages;
}

function getLocalToolReply(toolCalls: ToolCallLog[]): string | null {
  const calculatorCall = toolCalls.find((call) => call.name === "calculator");
  if (calculatorCall) {
    const output = calculatorCall.output as { expression?: string; result?: number; error?: string };

    if (output.error) {
      return `Calculator error: ${output.error}`;
    }

    return `${output.expression} = ${output.result}`;
  }

  const saveMemoryCall = toolCalls.find((call) => call.name === "save_memory");
  if (saveMemoryCall) {
    const output = saveMemoryCall.output as { value?: string };
    return `Saved to long-term memory: ${output.value ?? "memory item"}`;
  }

  const searchMemoryCall = toolCalls.find((call) => call.name === "search_memory");
  if (searchMemoryCall) {
    const output = searchMemoryCall.output as Array<{ key?: string; value?: string }>;

    if (!Array.isArray(output) || output.length === 0) {
      return "I do not have any saved long-term memory about you yet.";
    }

    const memories = output
      .map((memory) => `- ${memory.value ?? memory.key ?? "memory item"}`)
      .join("\n");

    return `From my long-term memory, I remember:\n${memories}`;
  }

  const timeCall = toolCalls.find((call) => call.name === "get_current_time");
  if (timeCall) {
    const output = timeCall.output as { locale?: string; timeZone?: string };
    return `Current time: ${output.locale ?? "unknown"}${output.timeZone ? ` (${output.timeZone})` : ""}`;
  }

  return null;
}

type RoutingDecision = {
  taskType:
    | "general"
    | "vision"
    | "coding"
    | "math"
    | "memory"
    | "tool";
  selectedModel: string;
  reason: string;
};

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function routeWithFastModel({
  baseUrl,
  apiKey,
  text,
  hasImages,
  preferredModel,
  fallbackRouting,
}: {
  baseUrl: string;
  apiKey: string;
  text: string;
  hasImages: boolean;
  preferredModel: string;
  fallbackRouting: RoutingDecision;
}): Promise<RoutingDecision> {
  const fastModel = process.env.NVIDIA_FAST_MODEL ?? "meta/llama-3.1-8b-instruct";

  const modelMap = {
    general: process.env.NVIDIA_GENERAL_MODEL ?? process.env.NVIDIA_MODEL ?? preferredModel,
    coding: process.env.NVIDIA_CODING_MODEL ?? process.env.NVIDIA_MODEL ?? preferredModel,
    vision: process.env.NVIDIA_VISION_MODEL ?? "meta/llama-3.2-11b-vision-instruct",
    math: process.env.NVIDIA_FAST_MODEL ?? fastModel,
    memory: process.env.NVIDIA_FAST_MODEL ?? fastModel,
    tool: process.env.NVIDIA_FAST_MODEL ?? fastModel,
  };

  try {
    const routerReply = await callNvidiaChat({
      baseUrl,
      apiKey,
      model: fastModel,
      temperature: 0,
      topP: 1,
      maxTokens: 180,
      messages: [
        {
          role: "system",
          content: `
You are a strict routing classifier for a chatbot.

Your task is to classify the user's request into exactly one taskType.

Available task types:
- general: normal conversation, explanation, writing, summarization, brainstorming
- vision: understanding or analyzing an attached image, such as describing an image, identifying objects, OCR, or answering questions about an uploaded image
- coding: programming, debugging, software engineering, code explanation
- math: arithmetic, formula-based calculation, numeric computation
- memory: saving or retrieving long-term user memory, preferences, or personal facts
- tool: requests that clearly require a local tool such as current time

Return JSON only in this format:
{
  "taskType": "general | vision | coding | math | memory | tool",
  "reason": "short reason"
}

Important classification rules:
1. If the user is ASKING ABOUT the content of an uploaded image, choose "vision".
2. If an image is attached and the user asks "what is in this image?", "describe this image", "read the text in this image", or similar, choose "vision".
3. Do NOT choose "general" for image creation requests.
4. Use "general" only for normal text conversation when none of the above categories fit.
5. If the user asks to remember something or asks what you remember, choose "memory".
6. If the user asks to calculate a numeric expression, choose "math".
7. If the user asks about code or debugging, choose "coding".
8. If the user asks for current time or another clear local tool action, choose "tool".

Examples:
- "What is in this image?" + hasImages=true => vision
- "Describe this uploaded photo." + hasImages=true => vision
- "Help me debug this TypeScript error." => coding
- "Calculate 12345 * 6789." => math
- "Remember that my name is Ray." => memory
- "What do you remember about me?" => memory
- "What time is it now?" => tool
- "Introduce yourself briefly." => general

You must output JSON only. Do not answer the user.
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            userMessage: text,
            hasImages,
          }),
        },
      ],
    });

    const parsed = extractJsonObject(routerReply) as {
      taskType?: RoutingDecision["taskType"];
      reason?: string;
    } | null;

    const allowedTaskTypes: RoutingDecision["taskType"][] = [
      "general",
      "vision",
      "coding",
      "math",
      "memory",
      "tool",
    ];

    const taskType =
      parsed?.taskType && allowedTaskTypes.includes(parsed.taskType)
        ? parsed.taskType
        : fallbackRouting.taskType;

    return {
      taskType,
      selectedModel: modelMap[taskType],
      reason: `Fast router model (${fastModel}) decision: ${
        parsed?.reason ?? fallbackRouting.reason
      }`,
    };
  } catch {
    return {
      ...fallbackRouting,
      reason: `Fast router failed. Fallback heuristic used: ${fallbackRouting.reason}`,
    };
  }
}

function missingConfigResponse() {
  return NextResponse.json(
    {
      reply:
        "Missing NVIDIA_API_KEY or NVIDIA_BASE_URL. Please check your .env.local file before sending model requests.",
      summary: "",
      toolCalls: [],
    },
    { status: 500 }
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const summary: string = body.summary ?? "";
  const recentMessages: ChatMessage[] = body.recentMessages ?? [];
  const images: ImageAttachment[] = body.images ?? [];
  const systemPrompt = body.systemPrompt ?? "You are a helpful assistant.";
  const temperature = body.temperature ?? 0.7;
  const topP = body.topP ?? 1;
  const maxTokens = body.maxTokens ?? 500;
  const streaming = body.streaming ?? false;
  const autoRouting = body.autoRouting ?? true;

  const fallbackModel = "meta/llama-3.1-70b-instruct";

  // When auto routing is enabled, prefer server-side env model.
  // When auto routing is disabled, respect the model selected in the UI.
  const preferredModel = autoRouting
    ? process.env.NVIDIA_MODEL ?? body.model ?? fallbackModel
    : body.model ?? process.env.NVIDIA_MODEL ?? fallbackModel;
  const apiKey = process.env.NVIDIA_API_KEY ?? "";
  const baseUrl = process.env.NVIDIA_BASE_URL ?? "";
  const latestUserText = [...recentMessages].reverse().find((message) => message.role === "user")?.content ?? "";

  if (!apiKey || !baseUrl) {
    return missingConfigResponse();
  }

  const heuristicRouting = routeRequest({
    text: latestUserText,
    images,
    preferredModel,
    autoRouting,
  });

  const routing = autoRouting
    ? await routeWithFastModel({
        baseUrl,
        apiKey,
        text: latestUserText,
        hasImages: images.length > 0,
        preferredModel,
        fallbackRouting: heuristicRouting,
      })
    : heuristicRouting;

  const memories = await readMemories();
  const longTermMemoryText = formatMemoryForPrompt(memories.slice(0, 20));
  const toolCalls = await detectAndRunTools(latestUserText);

  const localToolReply = getLocalToolReply(toolCalls);
  if (localToolReply && images.length === 0) {
    return NextResponse.json({
      reply: localToolReply,
      summary,
      routing,
      selectedModel: routing.selectedModel,
      toolCalls,
    });
  }

  let updatedSummary = summary;
  try {
    updatedSummary = await callNvidiaChat({
      baseUrl,
      apiKey,
      model: preferredModel,
      temperature: 0.3,
      topP: 1,
      maxTokens: 200,
      messages: buildSummaryMessages(summary, recentMessages),
    });
  } catch {
    updatedSummary = summary;
  }

  const finalMessages = buildFinalMessages({
    systemPrompt,
    longTermMemoryText,
    updatedSummary,
    toolCalls,
    recentMessages,
    images,
  });

  if (!streaming) {
    try {
      const reply = await callNvidiaChat({
        baseUrl,
        apiKey,
        model: routing.selectedModel,
        temperature,
        topP,
        maxTokens,
        messages: finalMessages,
      });

      return NextResponse.json({
        reply,
        summary: updatedSummary,
        routing,
        selectedModel: routing.selectedModel,
        toolCalls,
      });
    } catch (error) {
      return NextResponse.json(
        {
          reply: error instanceof Error ? error.message : "Unknown model request error.",
          summary: updatedSummary,
          routing,
          selectedModel: routing.selectedModel,
          toolCalls,
        },
        { status: 500 }
      );
    }
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: routing.selectedModel,
      messages: finalMessages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  const upstreamErrorText = upstream.ok ? "" : await upstream.text().catch(() => "Unable to read upstream error.");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.ok ? upstream.body?.getReader() : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "routing", routing })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "toolCalls", toolCalls })}\n\n`));

      if (!upstream.ok || !reader) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "token", token: `NVIDIA API error ${upstream.status}: ${upstreamErrorText}` })}\n\n`
          )
        );
        controller.close();
        return;
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const jsonText = trimmed.slice(5).trim();
          if (jsonText === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonText);
            const token = parsed.choices?.[0]?.delta?.content ?? "";
            if (token) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", token })}\n\n`));
            }
          } catch {
            // Ignore malformed upstream SSE chunks.
          }
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "summary", summary: updatedSummary })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
