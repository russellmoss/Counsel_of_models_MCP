# Quick Start Guide

Get up and running in 5 minutes. No prior MCP knowledge required.

---

## What You Need

- **Node.js 18+** — check with `node --version` ([download](https://nodejs.org/))
- **Claude Code** — check with `claude --version` ([download](https://claude.ai/code))
- **OpenAI API key** — get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini API key** — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## Step 1: Install

**Option A — npm (recommended):**

```bash
npm install -g counsel-of-models-mcp
```

**Option B — clone the repo:**

```bash
git clone https://github.com/russellmoss/Counsel_of_models_MCP.git
cd Counsel_of_models_MCP
npm install
npm run build
```

## Step 2: Run the setup wizard (recommended)

```bash
# If you cloned the repo:
npm run setup

# If you installed via npm:
counsel-mcp-setup
```

The wizard walks you through everything: API keys, provider testing, Claude Code registration, and project setup. If you prefer manual steps, continue with the steps below.

## Step 3: Add your API keys (manual alternative)

**If you cloned the repo:**

```bash
cp .env.example .env
```

Open `.env` in any text editor. Replace the placeholder values with your real keys.

**If you installed via npm**, export the keys in your shell profile:

```bash
# Add to ~/.bashrc, ~/.zshrc, or ~/.profile
export OPENAI_API_KEY="sk-your-key-here"
export GEMINI_API_KEY="your-key-here"
```

> **Tip**: Either `GEMINI_API_KEY` or `GOOGLE_API_KEY` works — set whichever you prefer.

## Step 4: Test that it works

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

## Step 5: Register with Claude Code

**If you installed via npm:**

```bash
claude mcp add --scope user counsel-mcp -- counsel-mcp
```

**If you cloned the repo:**

```bash
claude mcp add --scope user counsel-mcp -- node "$(pwd)/dist/index.js"
```

Verify:

```bash
claude mcp list
```

Look for `counsel-mcp` with `✓ Connected`.

## Step 6: Try it out

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

## Step 7: Set up your first project workflow (optional)

The tools are globally available now. To get the full cross-validation workflow in a specific project:

```bash
cd /path/to/your/project
mkdir -p .claude/commands

# Find the templates:
# npm install: look in $(npm root -g)/counsel-of-models-mcp/examples/claude-commands/
# Clone: look in examples/claude-commands/

cp /path/to/examples/claude-commands/counsel.md .claude/commands/counsel.md
cp /path/to/examples/claude-commands/refine.md .claude/commands/refine.md
```

Start a new Claude Code session in your project and run `/counsel`.

For tailored commands, also copy `setup-counsel.md` and run `/setup-counsel`.

See [README.md](README.md#using-it-in-your-projects) for the full explanation.

---

## Something not working?

| Problem | Fix |
|---|---|
| `claude: command not found` | Install Claude Code from [claude.ai/code](https://claude.ai/code), then restart your terminal |
| "Missing OPENAI_API_KEY" | Run `cp .env.example .env` and add your real keys (clone), or export in shell profile (npm) |
| "Missing Gemini API key" | Either `GEMINI_API_KEY` or `GOOGLE_API_KEY` works — set one of them |
| "429 quota exceeded" | Your API account hit its limit — check billing at [OpenAI](https://platform.openai.com/settings/organization/billing) or [Google](https://ai.google.dev/gemini-api/docs/rate-limits) |
| "Cannot find module" | You forgot to build — run `npm run build` |
| Claude doesn't see the tools | Start a **new** Claude Code session after registering |

---

For model overrides, architecture details, and other advanced options, see [README.md](README.md).
