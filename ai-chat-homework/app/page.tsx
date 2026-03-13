"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import SettingsPanel from "./components/SettingsPanel";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const TARGET_RATIO = 0.3;

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
  const [maxTokens, setMaxTokens] = useState(300);
  const [streaming, setStreaming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);

  const scrollToBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const getMessageElements = () => {
    const container = chatContainerRef.current;
    if (!container) return [];

    return Array.from(
      container.querySelectorAll<HTMLElement>("[data-message-id]")
    );
  };

  const getCurrentMessageIndexByViewport = () => {
    const container = chatContainerRef.current;
    if (!container) return -1;

    const messageElements = getMessageElements();
    if (messageElements.length === 0) return -1;

    const containerRect = container.getBoundingClientRect();
    const targetY = containerRect.top + container.clientHeight * 0.31;

    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    messageElements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - targetY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  };

  const scrollMessageToTargetPosition = (targetIndex: number) => {
    const container = chatContainerRef.current;
    if (!container) return;

    const messageElements = getMessageElements();
    if (messageElements.length === 0) return;
    if (targetIndex < 0 || targetIndex >= messageElements.length) return;

    const targetEl = messageElements[targetIndex];
    const targetScrollTop =
      targetEl.offsetTop - container.clientHeight * TARGET_RATIO;

    isProgrammaticScrollRef.current = true;
    setCurrentMessageIndex(targetIndex);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });

    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 300);
  };

  const handleJumpPrevious = () => {
    if (currentMessageIndex <= 0) return;
    scrollMessageToTargetPosition(currentMessageIndex - 1);
  };

  const handleJumpNext = () => {
    const messageElements = getMessageElements();
    if (
      currentMessageIndex < 0 ||
      currentMessageIndex >= messageElements.length - 1
    ) {
      return;
    }

    scrollMessageToTargetPosition(currentMessageIndex + 1);
  };

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 80;

    if (isProgrammaticScrollRef.current) return;

    const index = getCurrentMessageIndexByViewport();
    if (index !== -1) {
      setCurrentMessageIndex(index);
    }
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && currentMessageIndex >= messages.length) {
      setCurrentMessageIndex(messages.length - 1);
    }
  }, [messages.length, currentMessageIndex]);

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
    ...messages.slice(-4),
    ...(input.trim()
      ? [{ role: "user" as const, content: input.trim() }]
      : []),
  ];

  return (
    <main
      className={`min-h-screen ${
        darkMode ? "bg-gray-950 text-gray-100" : "bg-gray-100 text-gray-900"
      }`}
    >
      <div className="mx-auto flex max-w-7xl gap-6 p-6">
        <section
          className={`relative flex flex-1 flex-col rounded-2xl p-4 shadow ${
            darkMode ? "bg-gray-900" : "bg-white"
          }`}
        >
          <h1 className="mb-4 text-2xl font-bold">My ChatGPT</h1>

          <div className="absolute right-4 top-4 flex gap-2">
            <button
              type="button"
              onClick={handleJumpPrevious}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm shadow transition ${
                darkMode
                  ? "border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700"
                  : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
              }`}
              aria-label="Jump to previous message"
              title="Previous message"
            >
              ↑
            </button>

            <button
              type="button"
              onClick={handleJumpNext}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm shadow transition ${
                darkMode
                  ? "border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700"
                  : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
              }`}
              aria-label="Jump to next message"
              title="Next message"
            >
              ↓
            </button>
          </div>

          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className={`mb-4 h-[70vh] overflow-y-auto rounded-xl border p-4 ${
              darkMode
                ? "border-gray-700 bg-gray-950"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                messageId={`message-${index}`}
                role={message.role}
                content={message.content}
                isCurrent={index === currentMessageIndex}
                darkMode={darkMode}
              />
            ))}
          </div>

          <ChatInput
            value={input}
            disabled={isGenerating}
            darkMode={darkMode}
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
          darkMode={darkMode}
          previewMessages={previewMessages}
          conversationSummary={conversationSummary}
          onModelChange={setModel}
          onSystemPromptChange={setSystemPrompt}
          onTemperatureChange={setTemperature}
          onTopPChange={setTopP}
          onMaxTokensChange={setMaxTokens}
          onStreamingChange={setStreaming}
          onDarkModeChange={setDarkMode}
        />
      </div>
    </main>
  );
}