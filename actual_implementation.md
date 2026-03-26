# Actual Implementation: Counsel of Models MCP Server

This document describes what was built, how it works, and where to find everything. It is intended to be read by an LLM that needs to understand, modify, or extend this project.

**Built**: March 26, 2026
**Built by**: Claude Opus 4.6 executing `agentic_implementation_guide_v2.md` phase-by-phase
**Repo**: https://github.com/russellmoss/Counsel_of_models_MCP
**Branch**: `master`
**Runtime**: Node.js v24.14.0, TypeScript 6.0.2, npm 11.9.0
**Platform**: Windows 11 (paths use Windows-native format in config, bash in Claude Code shell)

---

## What This Project Does

An MCP (Model Context Protocol) server that runs locally over stdio and exposes three tools to Claude Code:

| Tool | What it does |
|---|---|
| `ask_openai` | Sends a prompt to OpenAI's Responses API, returns the response |
| `ask_gemini` | Sends a prompt to Google Gemini with thinking enabled, returns the response |
| `ask_all` | Sends the same prompt to both providers in parallel, returns both responses |

Once registered with `claude mcp add --scope user`, these tools are available in every Claude Code session across all projects.

---

## File Structure

```
Counsel_of_models_mcp/
├── src/
│   ├── index.ts              # MCP server entry point, tool registrations
│   ├── config.ts             # Model defaults, resolveModel(), shouldFallback()
│   ├── smoke.ts              # Standalone smoke test script
│   └── providers/
│       ├── index.ts          # Re-exports askOpenAI, askGemini, ProviderResponse
│       ├── types.ts          # ProviderResponse interface
│       ├── openai.ts         # OpenAI client (Responses API)
│       └── gemini.ts         # Gemini client (@google/genai SDK)
├── dist/                     # Compiled JS output (gitignored)
├── .env                      # Local API keys (gitignored)
├── .env.example              # Placeholder keys for new users
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── QUICKSTART.md
└── agentic_implementation_guide_v2.md
```

---

## Key Dependencies (from package.json)

```json
{
  "dependencies": {
    "@google/genai": "^1.46.0",
    "@modelcontextprotocol/sdk": "^1.25.2",
    "dotenv": "^17.3.1",
    "openai": "^6.33.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "rimraf": "^6.1.3",
    "typescript": "^6.0.2"
  }
}
```

The project uses `"type": "module"` in package.json and all imports use `.js` extensions (TypeScript Node16 module resolution).

---

## How Each File Works

### `src/config.ts` — Model Configuration

Central config file. This is the only file that needs editing when models change.

**Interfaces:**

```typescript
export interface ModelConfig {
  id: string;        // Model ID sent to the API (e.g. "gpt-5.4")
  name: string;      // Human-readable name for responses
  description: string;
}

export interface ProviderConfig {
  default: ModelConfig;      // Used when no model specified
  fallback: ModelConfig;     // Used on transient errors
  available: ModelConfig[];  // All models the user can request
  apiKeyEnvVar: string;      // Env var name (e.g. "OPENAI_API_KEY")
}
```

**Current defaults:**

| Provider | Default | Fallback |
|---|---|---|
| OpenAI | `gpt-5.4` | `gpt-5.4-mini` |
| Gemini | `gemini-3.1-pro-preview` | `gemini-3-flash-preview` |

**`resolveModel(config, requestedModel?)`** — Returns the matching `ModelConfig` from the `available` list (by ID or case-insensitive name). If the requested model isn't in the list, it passes through as a custom model (the provider API validates it).

**`shouldFallback(error)`** — Returns `true` only for transient/availability errors. Returns `false` (no fallback) for auth errors, invalid model, bad request, permission, or quota errors. Uses this regex:

```typescript
const noFallbackPatterns =
  /api.?key|unauthorized|authentication|forbidden|invalid.*model|bad.?request|permission|quota/i;
return !noFallbackPatterns.test(message);
```

### `src/providers/types.ts` — Shared Response Type

```typescript
export interface ProviderResponse {
  text: string;          // The model's response text
  model: string;         // Model ID actually used
  provider: string;      // "openai" or "gemini"
  usedFallback: boolean; // true if fallback model was used
  error?: string;        // Error message (may coexist with text if fallback succeeded)
}
```

### `src/providers/openai.ts` — OpenAI Client

Uses the **Responses API** (`openai.responses.create`), not the legacy Chat Completions API.

```typescript
const response = await openai.responses.create({
  model: model.id,
  ...(systemPrompt ? { instructions: systemPrompt } : {}),
  input: prompt,
  ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
});

const text = response.output_text;
```

Key details:
- System prompts go in the `instructions` field (Responses API pattern)
- `reasoning.effort` is an optional parameter (`"low"`, `"medium"`, `"high"`) for latency/quality tuning
- Lazy-initializes the client singleton on first call
- Throws immediately if `OPENAI_API_KEY` env var is missing
- On transient errors: falls back to `gpt-5.4-mini` (unless already using the fallback model)
- On auth/config errors: returns the error directly, no fallback

### `src/providers/gemini.ts` — Gemini Client

Uses `@google/genai` SDK with native `systemInstruction` and `ThinkingLevel` enum.

**Deviation from the original guide:** The guide specified `thinkingLevel: "high"` (string), but the installed `@google/genai@1.46.0` SDK requires the `ThinkingLevel` enum. This was caught during Phase 4 compilation and fixed:

```typescript
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// ...

const response = await genai.models.generateContent({
  model: model.id,
  contents: prompt,
  config: {
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.HIGH,  // NOT the string "high"
    },
  },
});

const text = response.text;
```

The available `ThinkingLevel` enum values are:
```
THINKING_LEVEL_UNSPECIFIED, LOW, MEDIUM, HIGH, MINIMAL
```

Fallback behavior mirrors OpenAI: transient-only, gated by `shouldFallback()`.

### `src/index.ts` — MCP Server Entry Point

**Critical:** `import "dotenv/config"` is the very first import, before any provider code, so `.env` variables are available when clients initialize.

**Critical:** No `console.log` anywhere — `stdout` is reserved for MCP JSON-RPC. All diagnostics use `console.error` (writes to `stderr`).

Registers three tools with the MCP SDK:

```typescript
const server = new McpServer({
  name: "counsel-of-models",
  version: "1.0.0",
});
```

**Tool registration signature** (SDK v1.25.2 supports annotations):

```typescript
server.tool(
  "ask_openai",           // tool name
  `description...`,       // tool description (dynamic, includes model list)
  { /* zod schema */ },   // parameter schema
  {                       // MCP tool annotations
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  },
  async (params) => { /* handler */ }
);
```

All three tools include annotations (`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true`). This was not in the original guide — we tested SDK support and added them after confirming compilation.

**Tool parameters:**

| Tool | Parameters |
|---|---|
| `ask_openai` | `prompt` (required), `system_prompt`, `model`, `reasoning_effort` |
| `ask_gemini` | `prompt` (required), `system_prompt`, `model` |
| `ask_all` | `prompt` (required), `system_prompt`, `openai_model`, `gemini_model`, `openai_reasoning_effort` |

**`ask_all` dual-failure detection:**

```typescript
const [openaiResult, geminiResult] = await Promise.allSettled([
  askOpenAI(prompt, system_prompt, openai_model, openai_reasoning_effort),
  askGemini(prompt, system_prompt, gemini_model),
]);

const openaiFailed =
  openaiResult.status === "rejected" ||
  (openaiResult.status === "fulfilled" && !!openaiResult.value.error && !openaiResult.value.text);

const geminiFailed =
  geminiResult.status === "rejected" ||
  (geminiResult.status === "fulfilled" && !!geminiResult.value.error && !geminiResult.value.text);

// If BOTH failed, return { isError: true }
// If only one failed, still return the successful response
```

**Server startup:**

```typescript
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[counsel-mcp] Server running on stdio");
}
```

### `src/smoke.ts` — Provider Smoke Test

Standalone script that tests both providers with `"Reply with exactly: OK"`. Exits 0 if both pass, exits 1 if either fails. All output goes to `stderr` via `console.error`.

Run with: `npm run smoke` (which runs `node dist/smoke.js`)

### `src/providers/index.ts` — Barrel Export

```typescript
export { askOpenAI } from "./openai.js";
export { askGemini } from "./gemini.js";
export type { ProviderResponse } from "./types.js";
```

---

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node dist/index.js` | Run the MCP server directly |
| `dev` | `tsc --watch` | Watch mode for development |
| `clean` | `rimraf dist` | Delete build output |
| `rebuild` | `clean && build` | Full clean build |
| `smoke` | `node dist/smoke.js` | Test both providers |

---

## Registration

The server is registered globally in Claude Code (user scope) so it's available in all projects:

```bash
claude mcp add --scope user counsel-mcp -- node "C:/Users/russe/Documents/Counsel_of_models_mcp/dist/index.js"
```

This writes to `~/.claude.json`. After registration, new Claude Code sessions see the `counsel-mcp` server and its three tools.

---

## API Key Management

Keys are loaded via two mechanisms (in priority order):
1. Shell environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`)
2. `.env` file in the project root (loaded by `dotenv` at startup)

The `.env` file is gitignored. The `.env.example` file contains placeholders only.

---

## Deviations from the Original Guide

The original guide is `agentic_implementation_guide_v2.md`. These are the differences between what was planned and what was actually built:

| Area | Guide Said | What We Did | Why |
|---|---|---|---|
| Gemini thinkingLevel | `thinkingLevel: "high"` (string) | `thinkingLevel: ThinkingLevel.HIGH` (enum) | `@google/genai@1.46.0` requires the enum, not a string. TypeScript compilation error `TS2820` caught this. |
| MCP tool annotations | "Check if SDK supports them, skip if not" | Added to all three tools | SDK 1.25.2 supports `tool(name, desc, schema, annotations, cb)` signature. Confirmed by compilation. |
| TypeScript version | Expected 5.x | Got 6.0.2 | Latest available at build time. No compatibility issues. |
| Node.js version | Required 18+ | Got v24.14.0 | No issues. |
| npm version | Required 9+ | Got 11.9.0 | No issues. |
| MCP SDK pinning | Pin to exact 1.25.2 | `^1.25.2` in package.json | npm installed with caret range by default. Functionally equivalent since no 2.x exists yet. |
| Default branch | Guide assumed `main` | Pushed to `master` | Git defaulted to `master` on init. |
| API key setup | Shell profile as primary | `.env` file as primary | README was later rewritten to prefer `.env` for beginner friendliness. |
| Paths | Guide used WSL `/mnt/c/...` paths | Used Windows-native `C:/Users/...` paths | Built on Windows 11 with Git Bash, not WSL. |

---

## Verified Working (Integration Test Results)

All three tools tested in a live Claude Code session on March 26, 2026:

```
ask_openai (prompt: "Say hello and confirm which model you are. One sentence.")
→ "Hello, I'm ChatGPT, an AI language model from OpenAI."
   model: gpt-5.4

ask_gemini (prompt: "Say hello and confirm which model you are. One sentence.")
→ "Hello, I am Gemini, a large language model built by Google."
   model: gemini-3.1-pro-preview

ask_all (prompt: "Say hello and confirm which model you are. One sentence.")
→ OpenAI (gpt-5.4): "Hello, I'm ChatGPT, an AI language model from OpenAI."
→ Gemini (gemini-3.1-pro-preview): "Hello, I am Gemini, a large language model built by Google."
```

---

## How to Modify This Project

**Add a new provider:** Create `src/providers/newprovider.ts` following the same pattern as `openai.ts` or `gemini.ts`. Add a config block in `src/config.ts`. Register a new tool in `src/index.ts`. Re-export from `src/providers/index.ts`.

**Change default models:** Edit only `src/config.ts` — change the `default` and/or `fallback` fields in `OPENAI_CONFIG` or `GEMINI_CONFIG`. Rebuild and smoke test.

**Add parameters to a tool:** Add a new zod field in the tool's schema in `src/index.ts`, then pass it through to the provider function.

**Change fallback behavior:** Edit the `shouldFallback()` regex in `src/config.ts` to include or exclude additional error patterns.
