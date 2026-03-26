# Quick Start Guide

Get up and running in 5 minutes. No prior MCP knowledge required.

---

## What You Need

- **Node.js 18+** — check with `node --version` ([download](https://nodejs.org/))
- **Claude Code** — check with `claude --version` ([download](https://claude.ai/code))
- **OpenAI API key** — get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini API key** — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## Step 1: Clone and build

```bash
git clone https://github.com/russellmoss/Counsel_of_models_MCP.git
cd Counsel_of_models_MCP
npm install
npm run build
```

## Step 2: Add your API keys

```bash
cp .env.example .env
```

Open `.env` in any text editor. Replace the placeholder values with your real keys:

```
OPENAI_API_KEY=sk-your-actual-key-here
GEMINI_API_KEY=your-actual-key-here
```

Save the file.

## Step 3: Test that it works

```bash
npm run smoke
```

You should see two green checkmarks:

```
Testing OpenAI...
  ✅ OpenAI OK (model: gpt-5.4)

Testing Gemini...
  ✅ Gemini OK (model: gemini-3.1-pro-preview)

=== Results: 2 passed, 0 failed ===
```

## Step 4: Register with Claude Code

```bash
claude mcp add --scope user counsel-mcp -- node "$(pwd)/dist/index.js"
```

Verify it registered:

```bash
claude mcp list
```

Look for `counsel-mcp` in the list with a `✓ Connected` status.

## Step 5: Try it out

**Start a new Claude Code session** (this is required — existing sessions don't see newly added servers).

Then type any of these prompts:

```
Use ask_openai to summarize what this repo does in one paragraph.
```

```
Use ask_gemini to critique this implementation plan.
```

```
Use ask_all to compare both answers about the pros and cons of microservices vs monoliths.
```

---

## Something not working?

| Problem | Fix |
|---|---|
| `claude: command not found` | Install Claude Code from [claude.ai/code](https://claude.ai/code), then restart your terminal |
| "Missing OPENAI_API_KEY" | Run `cp .env.example .env` and add your real keys |
| "429 quota exceeded" | Your API account hit its limit — check billing at [OpenAI](https://platform.openai.com/settings/organization/billing) or [Google](https://ai.google.dev/gemini-api/docs/rate-limits) |
| "Cannot find module" | You forgot to build — run `npm run build` |
| Claude doesn't see the tools | Start a **new** Claude Code session after registering |

---

For model overrides, architecture details, and other advanced options, see [README.md](README.md).
