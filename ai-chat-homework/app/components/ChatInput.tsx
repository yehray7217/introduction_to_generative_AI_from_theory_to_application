type ChatInputProps = {
  value: string;
  disabled: boolean;
  darkMode: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
};

export default function ChatInput({
  value,
  disabled,
  darkMode,
  onChange,
  onSend,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !disabled && value.trim()) {
      onSend();
    }
  };

  return (
    <div className="flex gap-3">
      <label htmlFor="chat-input" className="sr-only">
        Chat input
      </label>

      <input
        id="chat-input"
        type="text"
        placeholder="Type your message..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`flex-1 rounded-xl border px-4 py-3 outline-none transition ${
          darkMode
            ? "border-gray-600 bg-gray-900 text-gray-100 placeholder:text-gray-400"
            : "border-gray-300 bg-white text-gray-900 placeholder:text-gray-500"
        }`}
      />

      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={onSend}
        className={`rounded-xl px-5 py-3 font-medium transition ${
          disabled || !value.trim()
            ? darkMode
              ? "cursor-not-allowed bg-gray-600 text-gray-200"
              : "cursor-not-allowed bg-gray-400 text-white"
            : darkMode
            ? "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]"
            : "bg-black text-white hover:bg-gray-800 active:scale-[0.98]"
        }`}
      >
        {disabled ? "Generating..." : "Send"}
      </button>
    </div>
  );
}