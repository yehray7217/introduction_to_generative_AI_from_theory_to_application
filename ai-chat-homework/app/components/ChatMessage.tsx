import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ImageAttachment, RoutingInfo, ToolCallLog } from "../../lib/types";

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  messageId: string;
  modelName?: string;
  isCurrent?: boolean;
  darkMode: boolean;
  attachments?: ImageAttachment[];
  routing?: RoutingInfo;
  toolCalls?: ToolCallLog[];
};

export default function ChatMessage({
  role,
  content,
  messageId,
  modelName,
  isCurrent = false,
  darkMode,
  attachments = [],
  routing,
  toolCalls = [],
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
      className={`mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 transition ${baseStyle} ${currentStyle}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold opacity-80">
          <span>{isUser ? "User" : modelName || "Assistant"}</span>
          {routing && (
            <span className="rounded-full bg-black/10 px-2 py-0.5 dark:bg-white/10">
              routed: {routing.taskType}
            </span>
          )}
          {toolCalls.length > 0 && (
            <span className="rounded-full bg-black/10 px-2 py-0.5 dark:bg-white/10">
              {toolCalls.length} tool call{toolCalls.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {attachments.map((attachment) => (
              <div key={`${attachment.name}-${attachment.size}`} className="overflow-hidden rounded-xl border border-white/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.dataUrl} alt={attachment.name} className="h-32 w-full object-cover" />
                <div className="truncate px-2 py-1 text-[11px] opacity-75">{attachment.name}</div>
              </div>
            ))}
          </div>
        )}

        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || (isUser ? "" : "...")}</ReactMarkdown>
        </div>

        {routing && (
          <div className={`mt-3 rounded-xl p-2 text-xs ${darkMode ? "bg-gray-950/60" : "bg-white/60"}`}>
            <div className="font-semibold">Routing</div>
            <div>Model: {routing.selectedModel}</div>
            <div>Reason: {routing.reason}</div>
          </div>
        )}

        {toolCalls.length > 0 && (
          <details className={`mt-3 rounded-xl p-2 text-xs ${darkMode ? "bg-gray-950/60" : "bg-white/60"}`}>
            <summary className="cursor-pointer font-semibold">Tool calls</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(toolCalls, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
