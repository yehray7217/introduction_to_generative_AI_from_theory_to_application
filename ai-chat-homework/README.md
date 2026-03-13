# AI Chat Homework

A ChatGPT-like web application built with Next.js and TypeScript.

This project supports:
- LLM model selection
- Custom system prompt
- Adjustable API parameters
- Streaming response
- Short-term conversation memory
- Light / dark mode
- Advanced request preview and conversation summary preview

## Features

### 1. Model Selection
Users can choose different LLM models from the settings panel.

### 2. Custom System Prompt
Users can define the system prompt to control assistant behavior.

### 3. Adjustable API Parameters
The following common API parameters are supported:
- `temperature`
- `top_p`
- `max_tokens`
- `streaming`

### 4. Streaming Response
When streaming is enabled, the assistant response is displayed incrementally.

### 5. Short-Term Conversation Memory
This project uses a summary-based short-term memory design:
- keep a conversation summary
- keep recent dialogue turns
- use both summary and recent dialogue for the next response

### 6. Dark Mode
A dark mode toggle is provided in the settings panel.

### 7. Advanced Panel
The advanced section shows:
- request JSON preview
- current conversation summary

---

## Tech Stack

- [Next.js](https://nextjs.org)
- TypeScript
- React
- Tailwind CSS
- `react-markdown`
- `remark-gfm`

---

## Project Structure

```bash
app/
  api/
    chat/
      route.ts
  components/
    ChatInput.tsx
    ChatMessage.tsx
    SettingsPanel.tsx
  page.tsx
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment variables

Create a file named `.env.local` in the project root.

You can copy from `.env.example`:

```bash
cp .env.example .env.local
```

For Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Then edit `.env.local` and fill in your own API key:

```env
NVIDIA_API_KEY=your_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

This project uses the following environment variables:

- `NVIDIA_API_KEY`  
  Your NVIDIA API key

- `NVIDIA_BASE_URL`  
  NVIDIA API base URL

- `NVIDIA_MODEL`  
  Default model name

### Example

```env
NVIDIA_API_KEY=your_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

---

## Security Notes

- Do **not** upload `.env.local` to GitHub
- Do **not** hardcode API keys in source code
- Do **not** use `NEXT_PUBLIC_` for private API keys
- If an API key has ever been exposed, revoke it and generate a new one

Recommended `.gitignore` entries:

```gitignore
.env
.env.local
.env.*.local
```

---

## Usage

### Chat
Type a message in the input box and press `Send` or `Enter`.

### Streaming
Enable `Streaming` in the settings panel to receive incremental output.

### Model Selection
Choose a model from the dropdown menu in the settings panel.

### Advanced Panel
Expand the `進階` section to inspect:
- the request JSON body sent to the model
- the current conversation summary used as memory

---

## Notes

- Some models may behave differently depending on their output format
- This project is currently designed for models that return standard text content
- Model availability depends on NVIDIA API access and permissions

---

## Demo Requirements Coverage

This project covers the following homework requirements:

- [x] Select LLM model
- [x] Customize system prompt
- [x] Customize common API parameters
- [x] Streaming
- [x] Short-term conversation memory

---

## Future Improvements

Possible future extensions:
- multiple chat sessions
- persistent chat history
- better error handling UI
- more supported models
- export conversation

---

## License

This project is for course homework / educational use.