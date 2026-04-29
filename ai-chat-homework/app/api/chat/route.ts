import { NextResponse } from "next/server";
import { runLocalTool } from "../../../lib/tools";
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

function cleanMemoryValue(value: string): string {
  return value
    .replace(/^remember that\s+/i, "")
    .replace(/^please remember that\s+/i, "")
    .replace(/^note that\s+/i, "")
    .replace(/^save that\s+/i, "")
    .replace(/^store that\s+/i, "")
    .trim()
    .replace(/\.$/, "");
}

function formatMemoryRecall(memories: Array<{ value?: string; key?: string }>): string {
  const cleaned = memories
    .map((memory) => cleanMemoryValue(memory.value ?? memory.key ?? ""))
    .filter(Boolean);

  const nameMemory = cleaned.find((item) =>
    /my name is/i.test(item)
  );

  const conciseMemory = cleaned.find((item) =>
    /prefer concise answers/i.test(item)
  );

  const footballMemory = cleaned.find((item) =>
    /like playing football/i.test(item)
  );

  const parts: string[] = [];

  if (nameMemory) {
    const nameMatch = nameMemory.match(/my name is\s+([A-Za-z0-9_-]+)/i);
    if (nameMatch) {
      parts.push(`Your name is ${nameMatch[1]}`);
    } else {
      parts.push(nameMemory);
    }
  }

  if (conciseMemory) {
    parts.push("you prefer concise answers");
  }

  if (footballMemory) {
    parts.push("you like playing football");
  }

  const used = new Set([nameMemory, conciseMemory, footballMemory].filter(Boolean));

  for (const item of cleaned) {
    if (!used.has(item)) {
      parts.push(item);
    }
  }

  if (parts.length === 0) {
    return "I do not have any saved information about you yet.";
  }

  return parts.join(". ") + ".";
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
    const cleaned = cleanMemoryValue(output.value ?? "that information");

    return `Got it. I will remember that ${cleaned}.`;
  }

  const searchMemoryCall = toolCalls.find(
    (call) => call.name === "search_memory"
  );
  if (searchMemoryCall) {
    const output = searchMemoryCall.output as Array<{
      key?: string;
      value?: string;
    }>;

    if (!Array.isArray(output) || output.length === 0) {
      return "I do not know much about you yet.";
    }

    return formatMemoryRecall(output);
  }

  const timeCall = toolCalls.find((call) => call.name === "get_current_time");
  if (timeCall) {
    const output = timeCall.output as { locale?: string; timeZone?: string };
    return `Current time: ${output.locale ?? "unknown"}${output.timeZone ? ` (${output.timeZone})` : ""}`;
  }

  return null;
}

type ToolName =
  | "calculator"
  | "get_current_time"
  | "save_memory"
  | "search_memory"
  | "none";

type RoutingDecision = {
  taskType: "general" | "vision" | "coding" | "math" | "memory" | "tool";
  selectedModel: string;
  reason: string;
  shouldUseTool: boolean;
  toolName: ToolName;
  toolInput: Record<string, unknown>;
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

Return JSON only:
{
  "taskType": "general | vision | coding | math | memory | tool",
  "shouldUseTool": true,
  "toolName": "calculator | get_current_time | save_memory | search_memory | none",
  "toolInput": {},
  "reason": "short reason"
}

Rules:
- If hasImages is true, choose vision and toolName must be none.
- If the user asks to remember, save, note, or store a stable personal fact or preference, choose memory and toolName must be save_memory.
- If the user asks what you remember, who they are, whether you know them, or asks about their saved preferences, choose memory and toolName must be search_memory.
- If the user asks to calculate a numeric expression, choose math and toolName must be calculator.
- If the user asks for current time, current date, today, or now, choose tool and toolName must be get_current_time.
- If the user asks about code, debugging, TypeScript, JavaScript, React, Next.js, Python, CUDA, or software engineering, choose coding and toolName must be none.
- For normal conversation, explanation, writing, or summarization, choose general and toolName must be none.
- Do not answer the user. Only classify and plan.
- Do not use keyword substring matching. Understand the user's intent semantically.
- The word "know" is not a time request.

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
      shouldUseTool?: boolean;
      toolName?: ToolName;
      toolInput?: Record<string, unknown>;
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

    const allowedToolNames: ToolName[] = [
      "calculator",
      "get_current_time",
      "save_memory",
      "search_memory",
      "none",
    ];

    const taskType =
      parsed?.taskType && allowedTaskTypes.includes(parsed.taskType)
        ? parsed.taskType
        : fallbackRouting.taskType;

    const toolName =
      parsed?.toolName && allowedToolNames.includes(parsed.toolName)
        ? parsed.toolName
        : "none";

    const shouldUseTool = Boolean(parsed?.shouldUseTool) && toolName !== "none";

    return {
      taskType,
      selectedModel: modelMap[taskType],
      shouldUseTool,
      toolName,
      toolInput: parsed?.toolInput ?? {},
      reason: `Fast router model (${fastModel}) decision: ${
        parsed?.reason ?? fallbackRouting.reason
      }`,
    };
  } catch {
    return {
      ...fallbackRouting,
      shouldUseTool: false,
      toolName: "none",
      toolInput: {},
      reason: `Fast router failed. Fallback heuristic used: ${fallbackRouting.reason}`,
    };
  }
}

function normalizeToolInput(
  toolName: ToolName,
  toolInput: Record<string, unknown>,
  latestUserText: string
): Record<string, unknown> {
  if (toolName === "calculator") {
    return {
      expression:
        typeof toolInput.expression === "string" && toolInput.expression.trim()
          ? toolInput.expression.trim()
          : latestUserText,
    };
  }

  if (toolName === "get_current_time") {
    return {
      timeZone:
        typeof toolInput.timeZone === "string" && toolInput.timeZone.trim()
          ? toolInput.timeZone.trim()
          : "Asia/Taipei",
    };
  }

  if (toolName === "save_memory") {
    const value =
      typeof toolInput.value === "string" && toolInput.value.trim()
        ? toolInput.value.trim()
        : latestUserText;

    const key =
      typeof toolInput.key === "string" && toolInput.key.trim()
        ? toolInput.key.trim()
        : undefined;

    return key ? { key, value } : { value };
  }

  if (toolName === "search_memory") {
    return {
      query:
        typeof toolInput.query === "string" && toolInput.query.trim()
          ? toolInput.query.trim()
          : latestUserText,
    };
  }

  return {};
}

async function runPlannedToolCall(
  routing: RoutingDecision,
  latestUserText: string
): Promise<ToolCallLog[]> {
  if (!routing.shouldUseTool || routing.toolName === "none") {
    return [];
  }

  const input = normalizeToolInput(
    routing.toolName,
    routing.toolInput ?? {},
    latestUserText
  );

  try {
    const output = await runLocalTool(routing.toolName, input);

    return [
      {
        name: routing.toolName,
        input,
        output,
      },
    ];
  } catch (error) {
    return [
      {
        name: routing.toolName,
        input,
        output: {
          error: error instanceof Error ? error.message : "Unknown tool error",
        },
      },
    ];
  }
}

function streamLocalToolReply({
  reply,
  summary,
  routing,
  toolCalls,
}: {
  reply: string;
  summary: string;
  routing: RoutingDecision;
  toolCalls: ToolCallLog[];
}) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "routing", routing })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "toolCalls", toolCalls })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "token", token: reply })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "summary", summary })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
      );

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

  const heuristicDecision: RoutingDecision = {
    taskType: heuristicRouting.taskType,
    selectedModel: heuristicRouting.selectedModel,
    reason: heuristicRouting.reason,
    shouldUseTool: false,
    toolName: "none",
    toolInput: {},
  };

  const routing: RoutingDecision =
    images.length > 0
      ? {
          taskType: "vision",
          selectedModel:
            process.env.NVIDIA_VISION_MODEL ??
            "meta/llama-3.2-11b-vision-instruct",
          reason:
            "Image attachment detected, so the request is routed directly to a vision-capable model.",
          shouldUseTool: false,
          toolName: "none",
          toolInput: {},
        }
      : autoRouting
        ? await routeWithFastModel({
            baseUrl,
            apiKey,
            text: latestUserText,
            hasImages: images.length > 0,
            preferredModel,
            fallbackRouting: heuristicDecision,
          })
        : heuristicDecision;

  const memories = await readMemories();
  const longTermMemoryText = formatMemoryForPrompt(memories.slice(0, 20));
  const toolCalls = await runPlannedToolCall(routing, latestUserText);

  const localToolReply = getLocalToolReply(toolCalls);
  if (localToolReply && images.length === 0) {
    if (streaming) {
      return streamLocalToolReply({
        reply: localToolReply,
        summary,
        routing,
        toolCalls,
      });
    }

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
