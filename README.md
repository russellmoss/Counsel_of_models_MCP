# Counsel of Models MCP Server

**This project adds 3 extra AI tools to Claude Code so Claude can ask OpenAI and Gemini for second opinions.**

It works by running a small local server that Claude Code talks to behind the scenes. You set it up once, and then any Claude Code session can call `ask_openai`, `ask_gemini`, or `ask_all` as native tools.

> New to MCP? It stands for Model Context Protocol — it's how Claude Code connects to external tools. You don't need to understand the protocol to use this project.

### Prerequisites

| Requirement | How to check | Where to get it |
|---|---|---|
| Node.js 18+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| npm 9+ | `npm --version` | Comes with Node.js |
| Claude Code | `claude --version` | [claude.ai/code](https://claude.ai/code) |
| OpenAI API key | — | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Gemini API key | — | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

---

## 5-Minute Quick Start

Copy and paste these commands one group at a time.

**1. Clone, install, and build:**

```bash
git clone https://github.com/russellmoss/Counsel_of_models_MCP.git
cd Counsel_of_models_MCP
npm install
npm run build
```

**2. Add your API keys:**

```bash
cp .env.example .env
```

Open the new `.env` file in any text editor and replace the placeholder values with your real keys:

```
OPENAI_API_KEY=sk-your-actual-key-here
GEMINI_API_KEY=your-actual-key-here
```

Save the file. (This file is gitignored — your keys will never be committed.)

**3. Verify both providers work:**

```bash
npm run smoke
```

You should see output like:

```
=== Counsel of Models — Smoke Test ===

Testing OpenAI...
  ✅ OpenAI OK (model: gpt-5.4)
  Response: "OK"

Testing Gemini...
  ✅ Gemini OK (model: gemini-3.1-pro-preview)
  Response: "OK"

=== Results: 2 passed, 0 failed ===
```

If either provider fails, check [Common First-Run Problems](#common-first-run-problems) below.

**4. Register with Claude Code:**

```bash
claude mcp add --scope user counsel-mcp -- node "$(pwd)/dist/index.js"
```

**5. Start a new Claude Code session** (important — existing sessions don't pick up new servers), then try a demo prompt:

```
Use ask_openai to summarize what this repo does in one paragraph.
```

That's it. You're done.

---

## What Success Looks Like

- **Smoke test passes**: Both providers show a green checkmark and respond with "OK". This means your API keys are valid and the server can reach both providers.
- **Claude Code sees the server**: Run `claude mcp list` and look for `counsel-mcp: ... ✓ Connected`.
- **Tools work in Claude Code**: In a new session, ask Claude to use `ask_openai`, `ask_gemini`, or `ask_all` and you get responses back.

---

## Common First-Run Problems

### `claude: command not found`
Claude Code isn't installed or isn't on your PATH. Install it from [claude.ai/code](https://claude.ai/code). If you just installed it, restart your terminal.

### Smoke test says "Missing OPENAI_API_KEY" or "Missing GEMINI_API_KEY"
Your `.env` file is missing or the keys aren't set. Make sure you ran `cp .env.example .env` and edited it with your real keys.

### Smoke test says "429 quota exceeded"
Your API account has hit its usage limit. Check your billing:
- OpenAI: [platform.openai.com/settings/organization/billing](https://platform.openai.com/settings/organization/billing)
- Gemini: [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)

### "Cannot find module" errors at runtime
You forgot to build. Run `npm run build` in the project directory.

### Claude Code doesn't see `counsel-mcp` after registration
You need to start a **new** Claude Code session. Existing sessions don't pick up newly registered MCP servers. Run `claude mcp list` to confirm the server is registered.

### Smoke test says "model not found"
The model ID may have changed. Check the provider's docs for current model IDs and update `src/config.ts`. See the [Advanced](#advanced) section.

---

## Demo Prompts

After setup, open a **new** Claude Code session and try these:

1. **Ask OpenAI:**
   ```
   Use ask_openai to summarize what this repo does in one paragraph.
   ```

2. **Ask Gemini:**
   ```
   Use ask_gemini to critique this implementation plan.
   ```

3. **Ask both and compare:**
   ```
   Use ask_all to compare both answers about the pros and cons of microservices vs monoliths.
   ```

---

## What It Does

Exposes three tools to any Claude Code session:

| Tool | Description |
|------|-------------|
| `ask_openai` | Send a prompt to OpenAI (default: gpt-5.4) |
| `ask_gemini` | Send a prompt to Google Gemini (default: gemini-3.1-pro-preview with thinking enabled) |
| `ask_all` | Send to both in parallel, get combined responses |

---

## Advanced

### Shell profile environment variables

If you want your API keys available globally (not just in this project), add them to your shell profile instead of `.env`:

```bash
# Add to ~/.bashrc, ~/.zshrc, or ~/.profile
export OPENAI_API_KEY="sk-your-key-here"
export GEMINI_API_KEY="your-key-here"
```

Then reload: `source ~/.bashrc` (or `~/.zshrc`)

For Windows PowerShell (run as Administrator):
```powershell
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-your-key", "User")
[System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")
```

### Model overrides

Override the default model on any tool call:

- `"Use ask_openai with model gpt-5.4-pro to deeply analyze this build guide"` (slower, deeper reasoning)
- `"Use ask_openai with reasoning_effort high to review this architecture"` (more thorough without changing model)

### Available models

**OpenAI:**
- `gpt-5.4` — Best overall (default)
- `gpt-5.4-pro` — Deep reasoning (slower, opt-in)
- `gpt-5.4-mini` — Fast and cheap
- `gpt-5.4-nano` — Ultra fast

**Google Gemini:**
- `gemini-3.1-pro-preview` — Flagship reasoning (default, thinking enabled)
- `gemini-3-flash-preview` — Fast and efficient
- `gemini-3.1-flash-lite-preview` — Budget option

### Updating models

When new models launch, edit `src/config.ts` — it's the only file that needs to change. Then rebuild and verify:

```bash
npm run build
npm run smoke
```

### Architecture

- **Transport**: stdio (standard for Claude Code MCP servers)
- **OpenAI API**: Responses API (`responses.create`) with optional `reasoning.effort` control
- **Gemini API**: `@google/genai` with native `systemInstruction` and `thinkingLevel: "high"`
- **Fallback**: Only on transient errors — auth/config errors surface immediately
- **Keys**: Environment variables or `.env` file (loaded via dotenv)
- **MCP SDK**: Pinned to exact tested version (1.25.2)

---

## License

MIT
