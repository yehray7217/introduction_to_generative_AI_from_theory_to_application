import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type SettingsPanelProps = {
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  streaming: boolean;
  previewMessages: Message[];
  conversationSummary: string;
  onModelChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onTemperatureChange: (value: number) => void;
  onTopPChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
  onStreamingChange: (value: boolean) => void;
};

export default function SettingsPanel({
  model,
  systemPrompt,
  temperature,
  topP,
  maxTokens,
  streaming,
  previewMessages,
  conversationSummary,
  onModelChange,
  onSystemPromptChange,
  onTemperatureChange,
  onTopPChange,
  onMaxTokensChange,
  onStreamingChange,
}: SettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const previewBody = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...previewMessages,
    ],
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: streaming,
  };

  return (
    <aside className="sticky top-6 h-[calc(100vh-3rem)] w-80 overflow-y-auto rounded-2xl bg-white p-4 shadow">
      <h2 className="mb-4 text-lg font-bold">Settings</h2>

      <div className="mb-4">
        <label htmlFor="model" className="mb-2 block text-sm font-medium">
          Model
        </label>
        <select
          id="model"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
        >
          <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
        </select>
      </div>

      <div className="mb-4">
        <label
          htmlFor="system-prompt"
          className="mb-2 block text-sm font-medium"
        >
          System Prompt
        </label>
        <textarea
          id="system-prompt"
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          className="min-h-[120px] w-full rounded-xl border px-3 py-2"
          placeholder="You are a helpful assistant."
        />
      </div>

      <div className="mb-4">
        <label htmlFor="temperature" className="mb-2 block text-sm font-medium">
          Temperature
        </label>
        <input
          id="temperature"
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={temperature}
          onChange={(e) => onTemperatureChange(Number(e.target.value))}
          className="w-full rounded-xl border px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="top-p" className="mb-2 block text-sm font-medium">
          Top P
        </label>
        <input
          id="top-p"
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={topP}
          onChange={(e) => onTopPChange(Number(e.target.value))}
          className="w-full rounded-xl border px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="max-tokens" className="mb-2 block text-sm font-medium">
          Max Tokens
        </label>
        <input
          id="max-tokens"
          type="number"
          min="1"
          max="4096"
          value={maxTokens}
          onChange={(e) => onMaxTokensChange(Number(e.target.value))}
          className="w-full rounded-xl border px-3 py-2"
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          id="streaming"
          type="checkbox"
          checked={streaming}
          onChange={(e) => onStreamingChange(e.target.checked)}
        />
        <label htmlFor="streaming" className="text-sm font-medium">
          Enable Streaming
        </label>
      </div>

      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="w-full rounded-xl border px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
        >
          進階 {showAdvanced ? "▲" : "▼"}
        </button>

        {showAdvanced && (
          <div className="mt-3">
            <label
              htmlFor="request-preview"
              className="mb-2 block text-sm font-medium"
            >
              Request JSON Preview
            </label>
            <textarea
              id="request-preview"
              readOnly
              value={JSON.stringify(previewBody, null, 2)}
              className="h-72 w-full rounded-xl border bg-gray-50 px-3 py-2 font-mono text-xs"
            />

            <div className="mt-3">
              <label
                htmlFor="summary-preview"
                className="mb-2 block text-sm font-medium"
              >
                Conversation Summary
              </label>
              <textarea
                id="summary-preview"
                readOnly
                value={conversationSummary || "(empty)"}
                className="h-40 w-full rounded-xl border bg-gray-50 px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}