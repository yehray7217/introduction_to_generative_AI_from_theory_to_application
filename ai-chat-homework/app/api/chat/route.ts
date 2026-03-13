import { NextResponse } from "next/server";

type Message = {
  role: "user" | "assistant";
  content: string;
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
  messages: Array<{ role: string; content: string }>;
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

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  const body = await req.json();

  const summary: string = body.summary ?? "";
  const recentMessages: Message[] = body.recentMessages ?? [];
  const model = body.model ?? process.env.NVIDIA_MODEL ?? "openai/gpt-oss-120b";
  const systemPrompt = body.systemPrompt ?? "You are a helpful assistant.";
  const temperature = body.temperature ?? 0.7;
  const topP = body.topP ?? 1;
  const maxTokens = body.maxTokens ?? 500;
  const streaming = body.streaming ?? false;

  const apiKey = process.env.NVIDIA_API_KEY ?? "";
  const baseUrl = process.env.NVIDIA_BASE_URL ?? "";

  const updatedSummary = await callNvidiaChat({
    baseUrl,
    apiKey,
    model,
    temperature: 0.3,
    topP: 1,
    maxTokens: 200,
    messages: [
      {
        role: "system",
        content:
          "You are a conversation memory summarizer. Update the conversation summary. Keep it concise, factual, and useful for future turns. Return only the updated summary.",
      },
      {
        role: "user",
        content: `Previous summary:\n${summary || "(empty)"}`,
      },
      {
        role: "user",
        content: `Recent dialogue:\n${JSON.stringify(recentMessages, null, 2)}`,
      },
    ],
  });

  const finalMessages = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "system",
      content: `Conversation summary:\n${updatedSummary || "(empty)"}`,
    },
    ...recentMessages,
  ];

  if (!streaming) {
    const reply = await callNvidiaChat({
      baseUrl,
      apiKey,
      model,
      temperature,
      topP,
      maxTokens,
      messages: finalMessages,
    });

    return NextResponse.json({
      reply,
      summary: updatedSummary,
    });
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: finalMessages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body?.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      if (!reader) {
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
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "token", token })}\n\n`
                )
              );
            }
          } catch {}
        }
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "summary",
            summary: updatedSummary,
          })}\n\n`
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