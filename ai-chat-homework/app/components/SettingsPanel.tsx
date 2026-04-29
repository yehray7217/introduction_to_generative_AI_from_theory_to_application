import { useEffect, useMemo, useState } from "react";
import type { MemoryItem, RoutingInfo, ToolCallLog } from "../../lib/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  modelName?: string;
};

type SettingsPanelProps = {
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  streaming: boolean;
  autoRouting: boolean;
  darkMode: boolean;
  previewMessages: Message[];
  conversationSummary: string;
  lastRouting?: RoutingInfo;
  lastToolCalls: ToolCallLog[];
  memories: MemoryItem[];
  onModelChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onTemperatureChange: (value: number) => void;
  onTopPChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
  onStreamingChange: (value: boolean) => void;
  onAutoRoutingChange: (value: boolean) => void;
  onDarkModeChange: (value: boolean) => void;
  onMemoryRefresh: () => void;
  onMemoryDelete: (id: string) => void;
};

const MODEL_OPTIONS = [
  "meta/llama-3.1-70b-instruct",
  "openai/gpt-oss-120b",
  "meta/llama-3.2-11b-vision-instruct",
  "meta/llama-3.1-8b-instruct",
  "microsoft/phi-3-small-128k-instruct",
  "moonshotai/kimi-k2-instruct-0905",
];

export default function SettingsPanel({
  model,
  systemPrompt,
  temperature,
  topP,
  maxTokens,
  streaming,
  autoRouting,
  darkMode,
  previewMessages,
  conversationSummary,
  lastRouting,
  lastToolCalls,
  memories,
  onModelChange,
  onSystemPromptChange,
  onTemperatureChange,
  onTopPChange,
  onMaxTokensChange,
  onStreamingChange,
  onAutoRoutingChange,
  onDarkModeChange,
  onMemoryRefresh,
  onMemoryDelete,
}: SettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMemory, setShowMemory] = useState(true);
  const [newMemory, setNewMemory] = useState("");
  const [mcpInfo, setMcpInfo] = useState<{ tools?: Array<{ name: string }>; resources?: Array<{ uri: string }> } | null>(null);

  const previewBody = useMemo(
    () => ({
      model,
      autoRouting,
      messages: [{ role: "system", content: systemPrompt }, ...previewMessages],
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: streaming,
    }),
    [autoRouting, maxTokens, model, previewMessages, streaming, systemPrompt, temperature, topP]
  );

  useEffect(() => {
    fetch("/api/mcp")
      .then((res) => res.json())
      .then(setMcpInfo)
      .catch(() => setMcpInfo(null));
  }, []);

  const addMemory = async () => {
    const value = newMemory.trim();
    if (!value) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    setNewMemory("");
    onMemoryRefresh();
  };

  return (
    <aside className={`w-full shrink-0 overflow-y-auto border-l p-4 lg:w-[380px] ${darkMode ? "border-gray-800 bg-gray-950 text-gray-100" : "border-gray-200 bg-gray-50 text-gray-900"}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Settings</h2>
        <button
          type="button"
          onClick={() => onDarkModeChange(!darkMode)}
          className={`rounded-full border px-3 py-1 text-sm transition ${darkMode ? "border-gray-600 bg-gray-800 hover:bg-gray-700" : "border-gray-300 bg-gray-100 hover:bg-gray-200"}`}
        >
          {darkMode ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>

      <div className="mb-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-sm">
        <div className="font-semibold">HW2 Agent Features</div>
        <div className="mt-1 text-xs opacity-80">Long-term memory · Multimodal · Auto routing · Tools · MCP-style endpoint</div>
      </div>

      <div className="mb-4">
        <label htmlFor="model" className="mb-2 block text-sm font-medium">Default Model</label>
        <select
          id="model"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className={`w-full rounded-xl border px-3 py-2 ${darkMode ? "border-gray-700 bg-gray-800 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`}
        >
          {MODEL_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
        <span>
          <span className="font-medium">Auto routing</span>
          <span className="block text-xs opacity-70">Automatically choose vision/coding/fast/default models.</span>
        </span>
        <input type="checkbox" checked={autoRouting} onChange={(e) => onAutoRoutingChange(e.target.checked)} />
      </div>

      {lastRouting && (
        <div className={`mb-4 rounded-2xl border p-3 text-xs ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
          <div className="mb-1 font-semibold">Last routing decision</div>
          <div>Task: {lastRouting.taskType}</div>
          <div>Model: {lastRouting.selectedModel}</div>
          <div className="mt-1 opacity-80">{lastRouting.reason}</div>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="system-prompt" className="mb-2 block text-sm font-medium">System Prompt</label>
        <textarea
          id="system-prompt"
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          className={`min-h-[120px] w-full rounded-xl border px-3 py-2 ${darkMode ? "border-gray-700 bg-gray-800 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`}
          placeholder="You are a helpful assistant."
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="text-sm font-medium">
          Temperature
          <input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => onTemperatureChange(Number(e.target.value))} className={`mt-1 w-full rounded-xl border px-3 py-2 ${darkMode ? "border-gray-700 bg-gray-800 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`} />
        </label>
        <label className="text-sm font-medium">
          Top P
          <input type="number" step="0.1" min="0" max="1" value={topP} onChange={(e) => onTopPChange(Number(e.target.value))} className={`mt-1 w-full rounded-xl border px-3 py-2 ${darkMode ? "border-gray-700 bg-gray-800 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`} />
        </label>
        <label className="text-sm font-medium">
          Max Tokens
          <input type="number" min="1" max="4096" value={maxTokens} onChange={(e) => onMaxTokensChange(Number(e.target.value))} className={`mt-1 w-full rounded-xl border px-3 py-2 ${darkMode ? "border-gray-700 bg-gray-800 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`} />
        </label>
      </div>

      <div className="my-4 flex items-center gap-2">
        <input id="streaming" type="checkbox" checked={streaming} onChange={(e) => onStreamingChange(e.target.checked)} />
        <label htmlFor="streaming" className="text-sm font-medium">Enable Streaming</label>
      </div>

      <section className={`mb-4 rounded-2xl border p-3 ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
        <button type="button" className="flex w-full items-center justify-between font-semibold" onClick={() => setShowMemory((prev) => !prev)}>
          <span>Long-term memory</span>
          <span>{showMemory ? "▲" : "▼"}</span>
        </button>
        {showMemory && (
          <div className="mt-3">
            <div className="mb-2 flex gap-2">
              <input
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                placeholder="Add memory manually"
                className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-gray-700 bg-gray-950 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`}
              />
              <button type="button" onClick={addMemory} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Add</button>
            </div>
            <button type="button" onClick={onMemoryRefresh} className="mb-2 text-xs underline opacity-80">Refresh memory</button>
            <div className="max-h-48 space-y-2 overflow-auto">
              {memories.length === 0 && <div className="text-sm opacity-60">No saved memory yet.</div>}
              {memories.map((memory) => (
                <div key={memory.id} className={`rounded-xl border p-2 text-xs ${darkMode ? "border-gray-800 bg-gray-950" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-semibold">{memory.key}</div>
                    <button type="button" onClick={() => onMemoryDelete(memory.id)} className="opacity-60 hover:opacity-100">Delete</button>
                  </div>
                  <div className="mt-1 opacity-80">{memory.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={`mb-4 rounded-2xl border p-3 ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
        <div className="font-semibold">MCP-style tools</div>
        <div className="mt-1 text-xs opacity-70">Endpoint: <code>/api/mcp</code></div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(mcpInfo?.tools ?? []).map((tool) => (
            <span key={tool.name} className="rounded-full bg-blue-500/10 px-2 py-1 text-xs">{tool.name}</span>
          ))}
        </div>
        {lastToolCalls.length > 0 && (
          <pre className={`mt-3 max-h-36 overflow-auto rounded-xl p-2 text-xs ${darkMode ? "bg-gray-950" : "bg-gray-100"}`}>
            {JSON.stringify(lastToolCalls, null, 2)}
          </pre>
        )}
      </section>

      <div className={`border-t pt-4 ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium ${darkMode ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-50"}`}
        >
          Advanced {showAdvanced ? "▲" : "▼"}
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <label htmlFor="request-preview" className="block text-sm font-medium">Request JSON Preview</label>
            <textarea
              id="request-preview"
              readOnly
              value={JSON.stringify(previewBody, null, 2)}
              className={`h-52 w-full rounded-xl border px-3 py-2 font-mono text-xs ${darkMode ? "border-gray-700 bg-gray-950 text-gray-100" : "border-gray-300 bg-gray-50 text-gray-900"}`}
            />
            <label htmlFor="summary-preview" className="block text-sm font-medium">Short-term Conversation Summary</label>
            <textarea
              id="summary-preview"
              readOnly
              value={conversationSummary || "(empty)"}
              className={`h-32 w-full rounded-xl border px-3 py-2 font-mono text-xs ${darkMode ? "border-gray-700 bg-gray-950 text-gray-100" : "border-gray-300 bg-gray-50 text-gray-900"}`}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
