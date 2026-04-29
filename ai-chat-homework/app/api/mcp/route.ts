import { NextResponse } from "next/server";
import { readMemories } from "../../../lib/memory-store";
import { runLocalTool, TOOL_DEFINITIONS } from "../../../lib/tools";

export async function GET() {
  const memories = await readMemories();

  return NextResponse.json({
    name: "hw2-local-mcp-server",
    description: "A small MCP-style HTTP gateway for the HW2 chatbot demo.",
    tools: TOOL_DEFINITIONS,
    resources: [
      {
        uri: "user://memory",
        name: "Long-term memory",
        description: "Persistent facts and preferences saved by the user.",
        itemCount: memories.length,
      },
      {
        uri: "app://chat-summary",
        name: "Conversation summary",
        description: "The short-term summary maintained by the chat route.",
      },
    ],
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const tool = String(body.tool ?? body.name ?? "");
  const input = body.arguments ?? body.input ?? {};

  if (!tool) {
    return NextResponse.json({ error: "Tool name is required." }, { status: 400 });
  }

  try {
    const output = await runLocalTool(tool, input);
    return NextResponse.json({ tool, input, output });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown MCP tool error." },
      { status: 400 }
    );
  }
}
