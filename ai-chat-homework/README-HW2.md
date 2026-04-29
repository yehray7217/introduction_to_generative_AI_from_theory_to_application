# HW2 - My Very Powerful Chatbot

This version extends HW1 into an agent-style chatbot with:

- Long-term memory
- Multimodal image input
- Automatic model routing
- Local tool use
- A simple MCP-style HTTP endpoint
- Tool call and routing logs for demo visibility

## Added Files

```txt
lib/
  memory-store.ts
  models.ts
  router.ts
  tools.ts
  types.ts

app/api/
  chat/route.ts
  memory/route.ts
  mcp/route.ts

data/
  memory.json
```

## Replaced Files

```txt
app/page.tsx
app/components/ChatInput.tsx
app/components/ChatMessage.tsx
app/components/SettingsPanel.tsx
.env.example
```

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

For Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```txt
NVIDIA_API_KEY=your_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

Optional model routing targets:

```txt
NVIDIA_GENERAL_MODEL=meta/llama-3.1-70b-instruct
NVIDIA_CODING_MODEL=openai/gpt-oss-120b
NVIDIA_VISION_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_FAST_MODEL=meta/llama-3.1-8b-instruct
```

## Demo Script

```txt
demo basic chat
  Open the app
  Ask: "Hi, introduce yourself"
  Show the chatbot responds normally

demo long-term memory
  Ask: "Remember that my name is Ray and I prefer concise answers."
  Show save_memory tool call
  Refresh the browser
  Ask: "What do you remember about me?"
  Show the memory is still available

demo multimodal
  Upload an image
  Ask: "What is in this image?"
  Show it routes to the vision model

demo auto routing
  Ask a coding/debugging question
  Show routing task type is coding
  Ask a normal question
  Show routing task type returns to general

demo tool use
  Ask: "Calculate 12345 * 6789"
  Show calculator tool call and answer

demo MCP
  Open the Settings panel MCP section
  Show tools from /api/mcp
  Mention that the chat route uses the same local tool layer

demo memory manager
  Add a memory manually from the Settings panel
  Delete a memory
  Ask the chatbot again to show memory changed
```

## Notes

- `data/memory.json` is suitable for local homework demo.
- For production deployment, replace it with SQLite, Supabase, Postgres, or another persistent database.
- This implementation uses an MCP-style HTTP gateway for demo clarity. It exposes tool and resource metadata through `/api/mcp` and can invoke tools through POST requests.
