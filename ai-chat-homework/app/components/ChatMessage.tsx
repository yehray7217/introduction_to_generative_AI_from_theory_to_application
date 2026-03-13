import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  messageId: string;
  modelName?: string;
  isCurrent?: boolean;
  darkMode: boolean;
};

export default function ChatMessage({
  role,
  content,
  messageId,
  modelName,
  isCurrent = false,
  darkMode,
}: ChatMessageProps) {
  const isUser = role === "user";

  const baseStyle = darkMode
    ? isUser
      ? "bg-blue-950 text-blue-50"
      : "bg-gray-800 text-gray-100"
    : isUser
    ? "bg-blue-100 text-gray-900"
    : "bg-gray-200 text-gray-900";

  const currentStyle = isCurrent
    ? darkMode
      ? "ring-2 ring-blue-400/70 shadow-[0_10px_25px_rgba(0,0,0,0.35)]"
      : "ring-2 ring-blue-500/50 shadow-[0_10px_25px_rgba(0,0,0,0.18)]"
    : "";

  return (
    <div
      data-message-id={messageId}
      className={`mb-3 rounded-xl p-3 transition-shadow ${baseStyle} ${currentStyle}`}
    >
      <p className="mb-2 text-sm font-semibold">
        {isUser ? "User" : modelName || "Assistant"}
      </p>

      <div
        className={`prose prose-sm max-w-none break-words ${
          darkMode ? "prose-invert" : ""
        }`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}