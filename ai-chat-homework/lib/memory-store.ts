import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { MemoryItem } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(MEMORY_FILE, "utf8");
  } catch {
    await writeFile(MEMORY_FILE, "[]", "utf8");
  }
}

export async function readMemories(): Promise<MemoryItem[]> {
  await ensureStore();
  const raw = await readFile(MEMORY_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeMemories(memories: MemoryItem[]) {
  await ensureStore();
  await writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), "utf8");
}

export async function addMemory({
  key,
  value,
  source = "explicit",
}: {
  key: string;
  value: string;
  source?: MemoryItem["source"];
}) {
  const memories = await readMemories();
  const now = new Date().toISOString();
  const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 64) || "memory";
  const existing = memories.find((item) => item.key === normalizedKey);

  if (existing) {
    existing.value = value.trim();
    existing.updatedAt = now;
    await writeMemories(memories);
    return existing;
  }

  const item: MemoryItem = {
    id: createId(),
    key: normalizedKey,
    value: value.trim(),
    source,
    createdAt: now,
    updatedAt: now,
  };
  memories.unshift(item);
  await writeMemories(memories);
  return item;
}

export async function deleteMemory(id: string) {
  const memories = await readMemories();
  const next = memories.filter((item) => item.id !== id);
  await writeMemories(next);
  return { deleted: memories.length !== next.length };
}

export async function searchMemories(query: string, limit = 5) {
  const memories = await readMemories();
  const lowerQuery = query.toLowerCase();

  if (!lowerQuery.trim()) {
    return memories.slice(0, limit);
  }

  return memories
    .map((item) => {
      const haystack = `${item.key} ${item.value}`.toLowerCase();
      const score = haystack.includes(lowerQuery) ? 2 : lowerQuery.split(/\s+/).filter((token) => haystack.includes(token)).length;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function formatMemoryForPrompt(memories: MemoryItem[]) {
  if (memories.length === 0) return "(empty)";
  return memories.map((item) => `- ${item.key}: ${item.value}`).join("\n");
}
