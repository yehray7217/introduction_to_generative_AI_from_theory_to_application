import { NextResponse } from "next/server";
import { addMemory, deleteMemory, readMemories } from "../../../lib/memory-store";

export async function GET() {
  const memories = await readMemories();
  return NextResponse.json({ memories });
}

export async function POST(req: Request) {
  const body = await req.json();
  const value = String(body.value ?? "").trim();
  const fallbackKey = value.slice(0, 32) || "memory";
  const key = String(body.key ?? fallbackKey).trim() || "memory";

  if (!value) {
    return NextResponse.json({ error: "Memory value is required." }, { status: 400 });
  }

  const memory = await addMemory({ key, value, source: "manual" });
  return NextResponse.json({ memory });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Memory id is required." }, { status: 400 });
  }

  const result = await deleteMemory(id);
  return NextResponse.json(result);
}
