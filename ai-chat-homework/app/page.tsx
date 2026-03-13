"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import SettingsPanel from "./components/SettingsPanel";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I am your AI assistant." },
  ]);
  const [conversationSummary, setConversationSummary] = useState("");

  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(500);
  const [streaming, setStreaming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const scrollToBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isGenerating) return;

    setIsGenerating(true);

    const userMessage: Message = {
      role: "user",
      content: trimmedInput,
    };

    const updatedMessages = [...messages, userMessage];
    const recentMessages = updatedMessages.slice(-4);

    setMessages(updatedMessages);
    setInput("");

    try {
      if (!streaming) {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: conversationSummary,
            recentMessages,
            model,
            systemPrompt,
            temperature,
            topP,
            maxTokens,
            streaming: false,
          }),
        });

        const data = await response.json();

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
        setConversationSummary((prev) => data.summary?.trim() || prev);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: conversationSummary,
          recentMessages,
          model,
          systemPrompt,
          temperature,
          topP,
          maxTokens,
          streaming: true,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let done = false;
      let accumulated = "";
      let buffer = "";

      while (!done) {
        const result = await reader.read();
        done = result.done;

        if (result.value) {
          buffer += decoder.decode(result.value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data:")) continue;

            const jsonText = line.slice(5).trim();

            try {
              const parsed = JSON.parse(jsonText);

              if (parsed.type === "token") {
                accumulated += parsed.token;

                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                  };
                  return next;
                });
              }

              if (parsed.type === "summary") {
                setConversationSummary((prev) => parsed.summary?.trim() || prev);
              }
            } catch {}
          }
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const previewMessages = [
    ...messages.slice(-6),
    ...(input.trim()
      ? [{ role: "user" as const, content: input.trim() }]
      : []),
  ];

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900">
      <div className="mx-auto flex max-w-7xl gap-6 p-6">
        <section className="flex flex-1 flex-col rounded-2xl bg-white p-4 shadow">
          <h1 className="mb-4 text-2xl font-bold">My ChatGPT</h1>

          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="mb-4 h-[70vh] overflow-y-auto rounded-xl border bg-gray-50 p-4"
          >
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
              />
            ))}
          </div>

          <ChatInput
            value={input}
            disabled={isGenerating}
            onChange={setInput}
            onSend={handleSend}
          />
        </section>

        <SettingsPanel
          model={model}
          systemPrompt={systemPrompt}
          temperature={temperature}
          topP={topP}
          maxTokens={maxTokens}
          streaming={streaming}
          previewMessages={previewMessages}
          conversationSummary={conversationSummary}
          onModelChange={setModel}
          onSystemPromptChange={setSystemPrompt}
          onTemperatureChange={setTemperature}
          onTopPChange={setTopP}
          onMaxTokensChange={setMaxTokens}
          onStreamingChange={setStreaming}
        />
      </div>
    </main>
  );
}