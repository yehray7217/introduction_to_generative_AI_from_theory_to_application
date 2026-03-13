import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`mb-3 rounded-xl p-3 ${
        isUser ? "bg-blue-100" : "bg-gray-200"
      }`}
    >
      <p className="mb-2 text-sm font-semibold">
        {isUser ? "User" : "Assistant"}
      </p>

      <div className="prose prose-sm max-w-none break-words">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}