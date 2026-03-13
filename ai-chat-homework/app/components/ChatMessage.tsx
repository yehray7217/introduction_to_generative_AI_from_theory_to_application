import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  messageId: string;
  isCurrent?: boolean;
  darkMode: boolean;
};

export default function ChatMessage({
  role,
  content,
  messageId,
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
      ? "shadow-[0_0_0_3px_rgba(96,165,250,0.35),0_10px_25px_rgba(0,0,0,0.35)]"
      : "shadow-[0_0_0_3px_rgba(59,130,246,0.25),0_10px_25px_rgba(0,0,0,0.12)]"
    : "";

  return (
    <div
      data-message-id={messageId}
      className={`mb-3 rounded-xl p-3 transition-shadow ${baseStyle} ${currentStyle}`}
    >
      <p className="mb-2 text-sm font-semibold">
        {isUser ? "User" : "Assistant"}
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