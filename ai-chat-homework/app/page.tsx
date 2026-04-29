"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import SettingsPanel from "./components/SettingsPanel";
import type { ImageAttachment, MemoryItem, RoutingInfo, ToolCallLog } from "../lib/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  modelName?: string;
  attachments?: ImageAttachment[];
  routing?: RoutingInfo;
  toolCalls?: ToolCallLog[];
};

const TARGET_RATIO = 0.3;

export default function HomePage() {
  const [model, setModel] = useState("openai/gpt-oss-120b");
  // const [model, setModel] = useState("meta/llama-3.1-70b-instruct");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a powerful HW2 chatbot. You can use long-term memory, image understanding, auto routing, and local MCP-style tools. Answer clearly and mention tool results when tools are used."
  );
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(500);
  const [streaming, setStreaming] = useState(false);
  const [autoRouting, setAutoRouting] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [conversationSummary, setConversationSummary] = useState("");
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [lastRouting, setLastRouting] = useState<RoutingInfo | undefined>();
  const [lastToolCalls, setLastToolCalls] = useState<ToolCallLog[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I am your HW2 AI assistant. I support long-term memory, image input, automatic model routing, local tools, and a simple MCP-style endpoint.",
      modelName: "HW2 Agent",
    },
  ]);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);

  const refreshMemories = async () => {
    const response = await fetch("/api/memory");
    const data = await response.json();
    setMemories(data.memories ?? []);
  };

  const deleteMemory = async (id: string) => {
    await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refreshMemories();
  };

  useEffect(() => {
    refreshMemories();
  }, []);

  const scrollToBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const getMessageElements = () => {
    const container = chatContainerRef.current;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"));
  };

  const getCurrentMessageIndex = () => {
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
    const targetScrollTop = targetEl.offsetTop - container.clientHeight * TARGET_RATIO;

    isProgrammaticScrollRef.current = true;
    setCurrentMessageIndex(targetIndex);
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });

    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 300);
  };

  const handleJumpPrevious = () => {
    const currentIndex = currentMessageIndex;
    if (currentIndex <= 0) return;
    scrollMessageToTargetPosition(currentIndex - 1);
  };

  const handleJumpNext = () => {
    const messageElements = getMessageElements();
    const currentIndex = currentMessageIndex;
    if (currentIndex < 0 || currentIndex >= messageElements.length - 1) return;
    scrollMessageToTargetPosition(currentIndex + 1);
  };

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;

    if (isProgrammaticScrollRef.current) return;

    const index = getCurrentMessageIndex();
    if (index !== -1) setCurrentMessageIndex(index);
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && currentMessageIndex >= messages.length) {
      setCurrentMessageIndex(messages.length - 1);
    }
  }, [messages.length, currentMessageIndex]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && attachments.length === 0) || isGenerating) return;

    setIsGenerating(true);
    const currentAttachments = attachments;
    const userMessage: Message = {
      role: "user",
      content: trimmedInput || "Please analyze the attached image.",
      attachments: currentAttachments,
    };
    const updatedMessages = [...messages, userMessage];
    const recentMessages = updatedMessages.slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages(updatedMessages);
    setInput("");
    setAttachments([]);

    try {
      if (!streaming) {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: conversationSummary,
            recentMessages,
            images: currentAttachments,
            model,
            systemPrompt,
            temperature,
            topP,
            maxTokens,
            streaming: false,
            autoRouting,
          }),
        });

        const data = await response.json();
        setLastRouting(data.routing);
        setLastToolCalls(data.toolCalls ?? []);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply,
            modelName: data.selectedModel ?? model,
            routing: data.routing,
            toolCalls: data.toolCalls ?? [],
          },
        ]);
        setConversationSummary((prev) => data.summary?.trim() || prev);
        refreshMemories();
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "", modelName: "Routing..." }]);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: conversationSummary,
          recentMessages,
          images: currentAttachments,
          model,
          systemPrompt,
          temperature,
          topP,
          maxTokens,
          streaming: true,
          autoRouting,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let done = false;
      let accumulated = "";
      let buffer = "";
      let streamingRouting: RoutingInfo | undefined;
      let streamingToolCalls: ToolCallLog[] = [];

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

              if (parsed.type === "routing") {
                streamingRouting = parsed.routing;
                setLastRouting(parsed.routing);
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    modelName: parsed.routing?.selectedModel ?? model,
                    routing: parsed.routing,
                  };
                  return next;
                });
              }

              if (parsed.type === "toolCalls") {
                streamingToolCalls = parsed.toolCalls ?? [];
                setLastToolCalls(streamingToolCalls);
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    toolCalls: streamingToolCalls,
                  };
                  return next;
                });
              }

              if (parsed.type === "token") {
                accumulated += parsed.token;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                    modelName: streamingRouting?.selectedModel ?? next[next.length - 1].modelName ?? model,
                    routing: streamingRouting,
                    toolCalls: streamingToolCalls,
                  };
                  return next;
                });
              }

              if (parsed.type === "summary") {
                setConversationSummary((prev) => parsed.summary?.trim() || prev);
              }
            } catch {
              // Ignore malformed local SSE events.
            }
          }
        }
      }

      refreshMemories();
    } finally {
      setIsGenerating(false);
    }
  };

  const previewMessages = [
    ...messages.slice(-4).map((message) => ({ role: message.role, content: message.content })),
    ...(input.trim() ? [{ role: "user" as const, content: input.trim() }] : []),
  ];

  return (
    <main className={`flex h-screen ${darkMode ? "bg-gray-950 text-gray-100" : "bg-white text-gray-900"}`}>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className={`border-b px-6 py-4 ${darkMode ? "border-gray-800" : "border-gray-200"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">My Very Powerful Chatbot</h1>
              <p className="text-sm opacity-70">HW2: long-term memory, multimodal input, model routing, tools, and MCP-style integration</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleJumpPrevious}
                className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-50"}`}
              >
                ↑ Prev
              </button>
              <button
                type="button"
                onClick={handleJumpNext}
                className={`rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-50"}`}
              >
                ↓ Next
              </button>
            </div>
          </div>
        </header>

        <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-4">
          {messages.map((message, index) => (
            <ChatMessage
              key={`${message.role}-${index}`}
              messageId={`message-${index}`}
              role={message.role}
              content={message.content}
              modelName={message.modelName}
              attachments={message.attachments}
              routing={message.routing}
              toolCalls={message.toolCalls}
              isCurrent={index === currentMessageIndex}
              darkMode={darkMode}
            />
          ))}
        </div>

        <footer className={`border-t p-4 ${darkMode ? "border-gray-800" : "border-gray-200"}`}>
          <ChatInput
            value={input}
            disabled={isGenerating}
            darkMode={darkMode}
            attachments={attachments}
            onChange={setInput}
            onSend={handleSend}
            onAttachmentsChange={setAttachments}
          />
        </footer>
      </section>

      <SettingsPanel
        model={model}
        systemPrompt={systemPrompt}
        temperature={temperature}
        topP={topP}
        maxTokens={maxTokens}
        streaming={streaming}
        autoRouting={autoRouting}
        darkMode={darkMode}
        previewMessages={previewMessages}
        conversationSummary={conversationSummary}
        lastRouting={lastRouting}
        lastToolCalls={lastToolCalls}
        memories={memories}
        onModelChange={setModel}
        onSystemPromptChange={setSystemPrompt}
        onTemperatureChange={setTemperature}
        onTopPChange={setTopP}
        onMaxTokensChange={setMaxTokens}
        onStreamingChange={setStreaming}
        onAutoRoutingChange={setAutoRouting}
        onDarkModeChange={setDarkMode}
        onMemoryRefresh={refreshMemories}
        onMemoryDelete={deleteMemory}
      />
    </main>
  );
}
