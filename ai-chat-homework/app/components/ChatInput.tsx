import type { ChangeEvent, KeyboardEvent } from "react";
import type { ImageAttachment } from "../../lib/types";

type ChatInputProps = {
  value: string;
  disabled: boolean;
  darkMode: boolean;
  attachments: ImageAttachment[];
  onChange: (value: string) => void;
  onSend: () => void;
  onAttachmentsChange: (attachments: ImageAttachment[]) => void;
};

async function fileToAttachment(file: File): Promise<ImageAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    dataUrl,
  };
}

export default function ChatInput({
  value,
  disabled,
  darkMode,
  attachments,
  onChange,
  onSend,
  onAttachmentsChange,
}: ChatInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !disabled && (value.trim() || attachments.length > 0)) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    const next = await Promise.all(files.slice(0, 4).map(fileToAttachment));
    onAttachmentsChange([...attachments, ...next].slice(0, 4));
    e.target.value = "";
  };

  return (
    <div className={`rounded-2xl border p-3 ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div key={`${attachment.name}-${index}`} className={`flex items-center gap-2 rounded-xl border px-2 py-1 text-xs ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}>
              <span className="max-w-40 truncate">🖼️ {attachment.name}</span>
              <button
                type="button"
                className="opacity-70 hover:opacity-100"
                onClick={() => onAttachmentsChange(attachments.filter((_, currentIndex) => currentIndex !== index))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label className={`cursor-pointer rounded-xl border px-3 py-3 text-sm transition ${darkMode ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-50"}`}>
          Image
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </label>
        <textarea
          aria-label="Chat input"
          value={value}
          rows={2}
          placeholder="Type a message. Shift+Enter for new line."
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`flex-1 resize-none rounded-xl border px-4 py-3 outline-none transition ${
            darkMode
              ? "border-gray-600 bg-gray-950 text-gray-100 placeholder:text-gray-400"
              : "border-gray-300 bg-white text-gray-900 placeholder:text-gray-500"
          }`}
        />
        <button
          type="button"
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          onClick={onSend}
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {disabled ? "Generating..." : "Send"}
        </button>
      </div>
    </div>
  );
}
