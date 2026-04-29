import { addMemory, readMemories, searchMemories } from "./memory-store";
import type { ToolCallLog } from "./types";

function safeEvaluateExpression(expression: string) {
  const normalized = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**");
  if (!/^[0-9+\-*/().%\s*]+$/.test(normalized)) {
    throw new Error("Expression contains unsupported characters.");
  }
  // This is intentionally restricted by the validation above.
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${normalized});`)();
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Expression did not produce a finite number.");
  }
  return result;
}

function extractExpression(text: string) {
  const match = text.replace(/,/g, "").match(/[0-9][0-9+\-*/().%^\s×÷]*[+\-*/%^×÷][0-9+\-*/().%^\s×÷]*[0-9]/);
  return match?.[0]?.trim() ?? "";
}

function extractExplicitMemory(text: string) {
  const patterns = [
    /remember that\s+(.+)/i,
    /save memory[:：]?\s*(.+)/i,
    /記住[:：]?\s*(.+)/,
    /幫我記住[:：]?\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return "";
}

function createMemoryKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "user_memory";
}

export async function runLocalTool(name: string, input: unknown): Promise<unknown> {
  if (name === "calculator") {
    const expression = typeof input === "object" && input && "expression" in input ? String((input as { expression: unknown }).expression) : String(input ?? "");
    return { expression, result: safeEvaluateExpression(expression) };
  }

  if (name === "get_current_time") {
    return {
      iso: new Date().toISOString(),
      locale: new Intl.DateTimeFormat("zh-TW", {
        dateStyle: "full",
        timeStyle: "medium",
        timeZone: "Asia/Taipei",
      }).format(new Date()),
      timeZone: "Asia/Taipei",
    };
  }

  if (name === "save_memory") {
    const value = typeof input === "object" && input && "value" in input ? String((input as { value: unknown }).value) : String(input ?? "");
    const key = typeof input === "object" && input && "key" in input ? String((input as { key: unknown }).key) : createMemoryKey(value);
    return addMemory({ key, value, source: "tool" });
  }

  if (name === "search_memory") {
    const query =
      typeof input === "object" && input && "query" in input
        ? String((input as { query: unknown }).query)
        : String(input ?? "");

    const lowerQuery = query.toLowerCase();

    const isGeneralMemoryQuestion =
      lowerQuery.includes("what do you remember") ||
      lowerQuery.includes("remember about me") ||
      lowerQuery.includes("about me") ||
      lowerQuery.includes("memory") ||
      lowerQuery.includes("你記得") ||
      lowerQuery.includes("記得我") ||
      lowerQuery.includes("關於我") ||
      lowerQuery.includes("記憶");

    if (isGeneralMemoryQuestion) {
      return readMemories();
    }

    return searchMemories(query, 8);
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function detectAndRunTools(text: string): Promise<ToolCallLog[]> {
  const calls: ToolCallLog[] = [];
  const lower = text.toLowerCase();

  const explicitMemory = extractExplicitMemory(text);
  if (explicitMemory) {
    const input = { key: createMemoryKey(explicitMemory), value: explicitMemory };
    const output = await runLocalTool("save_memory", input);
    calls.push({ name: "save_memory", input, output });
  }

  const asksMemory = lower.includes("what do you remember") || lower.includes("你記得") || lower.includes("memory");
  if (asksMemory) {
    const input = { query: text };
    const output = await runLocalTool("search_memory", input);
    calls.push({ name: "search_memory", input, output });
  }

  const expression = extractExpression(text);
  if (expression || lower.includes("calculate") || lower.includes("calculator") || lower.includes("計算")) {
    if (expression) {
      const input = { expression };
      try {
        const output = await runLocalTool("calculator", input);
        calls.push({ name: "calculator", input, output });
      } catch (error) {
        calls.push({ name: "calculator", input, output: { error: error instanceof Error ? error.message : "Unknown error" } });
      }
    }
  }

  if (lower.includes("time") || lower.includes("date") || lower.includes("today") || lower.includes("now") || lower.includes("幾點") || lower.includes("今天") || lower.includes("現在")) {
    const input = { timeZone: "Asia/Taipei" };
    const output = await runLocalTool("get_current_time", input);
    calls.push({ name: "get_current_time", input, output });
  }

  return calls;
}

export const TOOL_DEFINITIONS = [
  {
    name: "calculator",
    description: "Safely evaluate a simple arithmetic expression.",
    inputSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
  },
  {
    name: "get_current_time",
    description: "Return the current date and time in Asia/Taipei.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_memory",
    description: "Save a long-term user memory item.",
    inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["value"] },
  },
  {
    name: "search_memory",
    description: "Search saved long-term memory items.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];
