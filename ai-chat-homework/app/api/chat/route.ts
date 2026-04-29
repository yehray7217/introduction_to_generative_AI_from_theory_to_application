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
  const preferredModel = body.model ?? process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct";
  const systemPrompt = body.systemPrompt ?? "You are a helpful assistant.";
  const temperature = body.temperature ?? 0.7;
  const topP = body.topP ?? 1;
  const maxTokens = body.maxTokens ?? 500;
  const streaming = body.streaming ?? false;
  const autoRouting = body.autoRouting ?? true;
  const apiKey = process.env.NVIDIA_API_KEY ?? "";
  const baseUrl = process.env.NVIDIA_BASE_URL ?? "";
  const latestUserText = [...recentMessages].reverse().find((message) => message.role === "user")?.content ?? "";

  if (!apiKey || !baseUrl) {
    return missingConfigResponse();
  }

  const routing = routeRequest({
    text: latestUserText,
    images,
    preferredModel,
    autoRouting,
  });

  const memories = await readMemories();
  const longTermMemoryText = formatMemoryForPrompt(memories.slice(0, 20));
  const toolCalls = await detectAndRunTools(latestUserText);

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
