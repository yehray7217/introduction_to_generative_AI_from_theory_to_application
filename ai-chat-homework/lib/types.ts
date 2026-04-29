export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ImageAttachment = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export type MemoryItem = {
  id: string;
  key: string;
  value: string;
  source: "explicit" | "tool" | "manual" | "inferred";
  createdAt: string;
  updatedAt: string;
};

export type ToolCallLog = {
  name: string;
  input: unknown;
  output: unknown;
};

export type TaskType = "general" | "vision" | "coding" | "math" | "memory" | "tool";

export type RoutingInfo = {
  taskType: TaskType;
  selectedModel: string;
  reason: string;
};
