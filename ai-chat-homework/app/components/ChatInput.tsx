type ChatInputProps = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
};

export default function ChatInput({
  value,
  disabled,
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
        className="flex-1 rounded-xl border px-4 py-3 outline-none"
      />

      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={onSend}
        className={`rounded-xl px-5 py-3 font-medium text-white transition ${
          disabled || !value.trim()
            ? "cursor-not-allowed bg-gray-400"
            : "bg-black hover:bg-gray-800 active:scale-[0.98]"
        }`}
      >
        {disabled ? "Generating..." : "Send"}
      </button>
    </div>
  );
}