# Agentic Implementation Guide: Counsel of Models MCP Server

## Reference
This guide builds a lightweight MCP server that exposes `ask_openai`, `ask_gemini`, and `ask_all` tools so Claude Code agents can call external LLMs natively from any project. It is designed to be registered globally and reused across all projects.

This guide was cross-validated by GPT-5.4 and Gemini 3.1 Pro before execution. Corrections applied:
- Gemini model IDs updated to include `-preview` suffix per current Google docs
- Gemini thinking switched from `thinkingBudget` to `thinkingLevel` (Gemini 3+ standard)
- Gemini system prompts use native `systemInstruction` instead of string concatenation
- OpenAI switched from Chat Completions to Responses API per current SDK guidance
- OpenAI default changed to `gpt-5.4` (reliable, fast) with `gpt-5.4-pro` as explicit opt-in
- OpenAI `reasoning.effort` exposed as optional parameter for latency/quality tuning
- Fallback logic gated to transient errors only (won't mask auth/config mistakes)
- `ask_all` dual-failure detection added
- `dotenv` added for local testing context
- MCP SDK pinned to exact tested version (1.25.2), not caret range
- MCP tool annotations included (readOnlyHint, openWorldHint) if SDK supports them
- Smoke test script added before MCP registration
- API key setup moved earlier in phase order
- Preview ID volatility warning added to Gemini config comments

**Project Directory**: `C:\Users\russe\Documents\Counsel_of_models_mcp`
**Remote**: `https://github.com/russellmoss/Counsel_of_models_MCP`
**Runtime**: Node.js (TypeScript)
**Transport**: stdio (standard for Claude Code MCP servers)

## Feature Summary

| Tool | Purpose | Default Model | Fallback |
|------|---------|---------------|----------|
| `ask_openai` | Send prompt to OpenAI, get response | `gpt-5.4` | `gpt-5.4-mini` |
| `ask_gemini` | Send prompt to Google Gemini, get response | `gemini-3.1-pro-preview` | `gemini-3-flash-preview` |
| `ask_all` | Send prompt to both in parallel, get combined responses | Both defaults above | Both fallbacks |

## Architecture Rules

- API keys are read from environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`), never hardcoded
- `dotenv` is loaded at startup so a local `.env` file works for testing, while shell profile vars work for global Claude Code usage
- Model defaults are defined in a single config object so they can be updated in one place
- The server uses stdio transport — `stdout` is reserved for MCP JSON-RPC. ALL diagnostic logging uses `console.error` (writes to `stderr`). Never use `console.log` anywhere.
- All tools accept an optional `model` parameter to override the default
- `ask_all` runs both providers in parallel with `Promise.allSettled` so one failure doesn't block the other
- Fallback only triggers on transient/availability errors, not on auth or validation failures
- Every response includes the model name that was actually used
- OpenAI uses the Responses API (`responses.create`), not the legacy Chat Completions API
- OpenAI `reasoning.effort` is exposed as an optional parameter for latency/quality tuning
- Gemini uses native `systemInstruction` and `thinkingLevel` (not string concatenation or `thinkingBudget`)

## Pre-Flight Checklist

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
node --version
# Expected: v18+ (required for MCP SDK)
npm --version
# Expected: v9+
```

If pre-existing files are in the directory, note them but do not delete anything. The `.git` directory should already exist from the remote init.

---

# PHASE 1: Project Initialization

## Context
Set up the Node.js TypeScript project with all required dependencies. This phase creates the project structure, installs packages, and configures TypeScript compilation.

## Step 1.1: Initialize npm and install dependencies

**Claude Code prompt**: "Initialize the npm project and install all required dependencies for an MCP server that calls OpenAI and Google Gemini APIs. Pin the MCP SDK to a known stable version."

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp

# Initialize npm project
npm init -y

# Install production dependencies — pin MCP SDK to exact tested version
# IMPORTANT: Use the exact version below. MCP SDK v2 is pre-alpha on main.
# If 1.25.2 is unavailable, run: npm view @modelcontextprotocol/sdk versions --json
# and pick the latest 1.x release, then update this line.
npm install @modelcontextprotocol/sdk@1.25.2 @google/genai openai zod dotenv

# Install dev dependencies
npm install -D typescript @types/node rimraf
```

## Step 1.2: Create TypeScript configuration

**Claude Code prompt**: "Create the tsconfig.json for a Node.js TypeScript project targeting ES2022 with strict mode enabled."

**File**: `tsconfig.json`
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
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Step 1.3: Update package.json with scripts and metadata

**Claude Code prompt**: "Update package.json with build/start scripts, set type to module, set the bin entry point, and add the project description. Use rimraf for cross-platform clean."

Update `package.json` to include these fields (merge with existing, don't replace):
```json
{
  "name": "counsel-of-models-mcp",
  "version": "1.0.0",
  "description": "MCP server that exposes OpenAI and Google Gemini as tools for Claude Code agents",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "counsel-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "clean": "rimraf dist",
    "rebuild": "npm run clean && npm run build",
    "smoke": "node dist/smoke.js"
  },
  "keywords": ["mcp", "openai", "gemini", "llm", "claude-code"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/russellmoss/Counsel_of_models_MCP.git"
  }
}
```

## Step 1.4: Create project directory structure and support files

**Claude Code prompt**: "Create the src directory, src/providers directory, and the .gitignore and .env.example files."

```bash
mkdir -p src/providers
```

**File**: `.gitignore`
```
node_modules/
dist/
.env
*.js.map
```

**File**: `.env.example`
```
# Get your OpenAI API key from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-key-here

# Get your Google Gemini API key from https://aistudio.google.com/apikey
GEMINI_API_KEY=your-key-here
```

## PHASE 1 — VALIDATION GATE

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
cat package.json | grep '"type"'
# Expected: "type": "module"
ls src/providers/
# Expected: directory exists (empty is fine)
ls node_modules/@modelcontextprotocol/sdk
# Expected: directory exists
ls node_modules/openai
# Expected: directory exists
ls node_modules/@google/genai
# Expected: directory exists
ls node_modules/dotenv
# Expected: directory exists
npx tsc --version
# Expected: Version 5.x.x
```

**Expected**: All dependencies installed, TypeScript available, directory structure in place.

**STOP AND REPORT**: Tell the user:
- "Phase 1 complete: project initialized with all dependencies."
- "Node.js TypeScript project configured with MCP SDK (pinned 1.25.2), OpenAI, Google GenAI, dotenv, and zod."
- "Ready to proceed to Phase 2?"

---

# PHASE 2: Model Configuration Module

## Context
Create the configuration module that defines default models, manages model selection, and provides a single place to update model versions. This is the file you update when new models launch — everything else reads from it.

## Step 2.1: Create the model configuration file

**Claude Code prompt**: "Create src/config.ts with model defaults for OpenAI and Gemini. Default to gpt-5.4 for OpenAI (gpt-5.4-pro is opt-in for hard problems). Default to gemini-3.1-pro-preview for Gemini. All Gemini IDs must include the -preview suffix. Include a shouldFallback function that only falls back on transient errors, not auth or config failures."

**File**: `src/config.ts`
```typescript
/**
 * Model Configuration
 *
 * UPDATE THIS FILE when new models launch.
 * This is the ONLY file that needs to change when providers release new models.
 *
 * Last updated: March 2026
 * - OpenAI: gpt-5.4 family (pro, standard, mini, nano)
 * - Google: gemini-3.1 family (pro-preview, flash-preview, flash-lite-preview)
 *
 * Note on OpenAI model choice:
 *   gpt-5.4 is the default — best overall, reliable, fast.
 *   gpt-5.4-pro is for deep reasoning / hard problems but can take minutes
 *   and may timeout in synchronous MCP tool calls. Use it as an explicit override.
 *
 * Note on Gemini model IDs:
 *   All Gemini 3.x models currently require the -preview suffix.
 *   Remove the suffix when Google promotes them to GA.
 *   IMPORTANT: Preview IDs are more volatile than GA IDs. Google may
 *   rename or retire them with short notice. If Gemini calls start
 *   failing with "model not found," check https://ai.google.dev/gemini-api/docs/models
 *   for current IDs and update this file.
 */

export interface ModelConfig {
  /** Model ID to send to the provider API */
  id: string;
  /** Human-readable name for responses */
  name: string;
  /** Brief description of the model's strengths */
  description: string;
}

export interface ProviderConfig {
  /** Default model — used when no model is specified */
  default: ModelConfig;
  /** Fallback model — used if default fails on a transient error */
  fallback: ModelConfig;
  /** All available models for this provider */
  available: ModelConfig[];
  /** Environment variable name for the API key */
  apiKeyEnvVar: string;
}

export const OPENAI_CONFIG: ProviderConfig = {
  default: {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description: "Best overall model. Strong coding, reasoning, and tool use.",
  },
  fallback: {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    description: "Cheaper, faster, still strong for most tasks.",
  },
  available: [
    {
      id: "gpt-5.4-pro",
      name: "GPT-5.4 Pro",
      description: "Deep reasoning, complex agents. Slower — may timeout on long tasks.",
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      description: "Best overall balance (default)",
    },
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      description: "Cheaper, faster, still strong",
    },
    {
      id: "gpt-5.4-nano",
      name: "GPT-5.4 Nano",
      description: "Ultra fast and cheap for simple tasks",
    },
  ],
  apiKeyEnvVar: "OPENAI_API_KEY",
};

export const GEMINI_CONFIG: ProviderConfig = {
  default: {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    description: "Flagship model for complex reasoning, agentic workflows, and deep context.",
  },
  fallback: {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    description: "Fast responses with strong 3-series performance.",
  },
  available: [
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      description: "Complex reasoning, agentic workflows (default)",
    },
    {
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      description: "Fast and cost-effective",
    },
    {
      id: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash-Lite Preview",
      description: "Ultra-fast, budget option",
    },
  ],
  apiKeyEnvVar: "GEMINI_API_KEY",
};

/**
 * Resolve which model to use.
 * If the caller specifies a model, use it. Otherwise use the default.
 */
export function resolveModel(
  config: ProviderConfig,
  requestedModel?: string
): ModelConfig {
  if (!requestedModel) {
    return config.default;
  }

  const found = config.available.find(
    (m) =>
      m.id === requestedModel ||
      m.name.toLowerCase() === requestedModel.toLowerCase()
  );

  if (found) {
    return found;
  }

  // If the requested model isn't in our list, pass it through anyway
  // (the provider API will validate it)
  return {
    id: requestedModel,
    name: requestedModel,
    description: "Custom model specified by caller",
  };
}

/**
 * Determine whether a provider error should trigger fallback.
 * Only fall back on transient/availability errors.
 * Do NOT fall back on auth errors, invalid model, or bad request — those
 * indicate config problems that the user needs to fix.
 */
export function shouldFallback(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error);
  const noFallbackPatterns =
    /api.?key|unauthorized|authentication|forbidden|invalid.*model|bad.?request|permission|quota/i;
  return !noFallbackPatterns.test(message);
}
```

## PHASE 2 — VALIDATION GATE

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
npx tsc --noEmit
# Expected: no errors
```

**Expected**: Clean TypeScript compilation with no errors.

**STOP AND REPORT**: Tell the user:
- "Phase 2 complete: model configuration module created."
- "Default models: gpt-5.4 (OpenAI) and gemini-3.1-pro-preview (Gemini)."
- "gpt-5.4-pro is available as an explicit override for hard problems."
- "Fallback logic will only trigger on transient errors, not auth/config mistakes."
- "To update models in the future, edit only src/config.ts."
- "Ready to proceed to Phase 3?"

---

# PHASE 3: API Key Configuration

## Context
Set up API keys BEFORE building provider clients so we can smoke-test them immediately. Keys are stored in two places: the shell profile (for global Claude Code usage across all projects) and a local `.env` file (for testing during this build session without restarting the terminal).

## Step 3.1: Check shell and identify profile file

**Claude Code prompt**: "Check which shell the user is running and identify the correct profile file."

```bash
echo $SHELL
# This tells you which profile to edit:
# /bin/bash  → edit ~/.bashrc
# /bin/zsh   → edit ~/.zshrc
```

## ⏸️ STOP — USER ACTION REQUIRED

**You need to do TWO things. This takes 2 minutes.**

### Part A: Add keys to your shell profile (for global use across all projects)

1. Open your WSL terminal
2. Run: `nano ~/.bashrc` (or `~/.zshrc` if using zsh)
3. Scroll to the bottom of the file
4. Add these two lines (paste your actual keys):

```bash
export OPENAI_API_KEY="sk-your-actual-openai-key-here"
export GEMINI_API_KEY="your-actual-gemini-key-here"
```

5. Save: `Ctrl+O`, then `Enter`, then `Ctrl+X` to exit
6. Reload: `source ~/.bashrc` (or `source ~/.zshrc`)

### Part B: Create a local .env file (for testing in this build session)

1. In the project directory, create a `.env` file:

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
nano .env
```

2. Add the same two lines:

```
OPENAI_API_KEY=sk-your-actual-openai-key-here
GEMINI_API_KEY=your-actual-gemini-key-here
```

3. Save and exit.

### Where to get the keys if you don't have them:

- **OpenAI**: https://platform.openai.com/api-keys → Create new secret key
- **Google Gemini**: https://aistudio.google.com/apikey → Create API key

### For PowerShell (if you also want keys available outside WSL):

1. Open PowerShell as Administrator
2. Run:
```powershell
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-your-key", "User")
[System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")
```
3. Restart any open terminals

## PHASE 3 — VALIDATION GATE

```bash
# Verify keys are accessible (from env OR from .env file)
[ -n "$OPENAI_API_KEY" ] && echo "✅ OPENAI_API_KEY is set in shell" || echo "⚠️ OPENAI_API_KEY not in shell (will use .env)"
[ -n "$GEMINI_API_KEY" ] && echo "✅ GEMINI_API_KEY is set in shell" || echo "⚠️ GEMINI_API_KEY not in shell (will use .env)"

# Verify .env file exists in project
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
[ -f .env ] && echo "✅ .env file exists" || echo "❌ .env file missing — create it"

# Verify keys are NOT in any tracked source files
grep -r "sk-" src/ .env* --include="*.ts" --include="*.js" --include="*.env" 2>/dev/null | grep -v ".env.example" | grep -v ".env" | grep -v node_modules
# Expected: no output (no keys in source files)

# Verify .gitignore excludes .env
grep "^\.env$" .gitignore
# Expected: .env
```

**Expected**: At least one key source available (shell env OR .env file). No keys in source code. .env excluded from git.

**STOP AND REPORT**: Tell the user:
- "Phase 3 complete: API keys configured."
- "Keys available via [shell profile / .env file / both]."
- "Keys are NOT in any tracked source files — safe to push publicly."
- "Ready to proceed to Phase 4?"

---

# PHASE 4: Provider Clients

## Context
Create the OpenAI and Gemini client wrappers. Each client handles authentication, sends the prompt, and returns a standardized response format. Error handling includes automatic fallback to the secondary model on transient errors only.

Key design decisions applied from cross-validation:
- OpenAI uses the **Responses API** (`responses.create`), not legacy Chat Completions
- Gemini uses **native `systemInstruction`** in the config, not string concatenation
- Gemini uses **`thinkingLevel: "high"`**, not `thinkingBudget: -1` (Gemini 3+ standard)
- Fallback is **gated by `shouldFallback()`** — auth/config errors are NOT retried

## Step 4.1: Create the shared response type

**Claude Code prompt**: "Create src/providers/types.ts with the shared ProviderResponse interface."

**File**: `src/providers/types.ts`
```typescript
export interface ProviderResponse {
  /** The model's response text */
  text: string;
  /** The model ID that was actually used */
  model: string;
  /** Provider name: "openai" or "gemini" */
  provider: string;
  /** Whether a fallback model was used instead of the requested one */
  usedFallback: boolean;
  /** Error message if something went wrong (may still have text if fallback succeeded) */
  error?: string;
}
```

## Step 4.2: Create the OpenAI client

**Claude Code prompt**: "Create src/providers/openai.ts using the OpenAI Responses API (responses.create), not Chat Completions. Use the `instructions` field for system prompts. Gate fallback on shouldFallback()."

**File**: `src/providers/openai.ts`
```typescript
import OpenAI from "openai";
import { OPENAI_CONFIG, resolveModel, shouldFallback } from "../config.js";
import type { ProviderResponse } from "./types.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env[OPENAI_CONFIG.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(
        `Missing ${OPENAI_CONFIG.apiKeyEnvVar} environment variable. ` +
          `Set it in your shell profile (~/.bashrc or ~/.zshrc) or in a .env file.`
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function askOpenAI(
  prompt: string,
  systemPrompt?: string,
  requestedModel?: string,
  reasoningEffort?: "low" | "medium" | "high"
): Promise<ProviderResponse> {
  const model = resolveModel(OPENAI_CONFIG, requestedModel);

  try {
    const openai = getClient();
    const response = await openai.responses.create({
      model: model.id,
      ...(systemPrompt ? { instructions: systemPrompt } : {}),
      input: prompt,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    });

    const text = response.output_text;
    if (!text) {
      throw new Error("Empty response from OpenAI");
    }

    return {
      text,
      model: model.id,
      provider: "openai",
      usedFallback: false,
    };
  } catch (error) {
    // Only fall back on transient errors, and only if using the default model
    if (
      model.id !== OPENAI_CONFIG.fallback.id &&
      shouldFallback(error)
    ) {
      console.error(
        `[counsel-mcp] OpenAI ${model.id} failed (transient), falling back to ${OPENAI_CONFIG.fallback.id}:`,
        error instanceof Error ? error.message : error
      );

      try {
        const openai = getClient();
        const response = await openai.responses.create({
          model: OPENAI_CONFIG.fallback.id,
          ...(systemPrompt ? { instructions: systemPrompt } : {}),
          input: prompt,
          ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        });

        const text = response.output_text;
        if (!text) {
          throw new Error("Empty response from OpenAI fallback");
        }

        return {
          text,
          model: OPENAI_CONFIG.fallback.id,
          provider: "openai",
          usedFallback: true,
          error: `Primary model ${model.id} failed, used fallback ${OPENAI_CONFIG.fallback.id}`,
        };
      } catch (fallbackError) {
        return {
          text: "",
          model: OPENAI_CONFIG.fallback.id,
          provider: "openai",
          usedFallback: true,
          error: `Both ${model.id} and fallback ${OPENAI_CONFIG.fallback.id} failed: ${
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError)
          }`,
        };
      }
    }

    // Non-transient error (auth, invalid model, etc.) — surface directly, no fallback
    return {
      text: "",
      model: model.id,
      provider: "openai",
      usedFallback: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

## Step 4.3: Create the Gemini client

**Claude Code prompt**: "Create src/providers/gemini.ts using the @google/genai SDK. Use native systemInstruction in the config object (not string concatenation). Use thinkingLevel 'high' instead of thinkingBudget. Gate fallback on shouldFallback()."

**File**: `src/providers/gemini.ts`
```typescript
import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG, resolveModel, shouldFallback } from "../config.js";
import type { ProviderResponse } from "./types.js";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env[GEMINI_CONFIG.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(
        `Missing ${GEMINI_CONFIG.apiKeyEnvVar} environment variable. ` +
          `Set it in your shell profile (~/.bashrc or ~/.zshrc) or in a .env file.`
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function askGemini(
  prompt: string,
  systemPrompt?: string,
  requestedModel?: string
): Promise<ProviderResponse> {
  const model = resolveModel(GEMINI_CONFIG, requestedModel);

  try {
    const genai = getClient();
    const response = await genai.models.generateContent({
      model: model.id,
      contents: prompt,
      config: {
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        thinkingConfig: {
          thinkingLevel: "high",
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    return {
      text,
      model: model.id,
      provider: "gemini",
      usedFallback: false,
    };
  } catch (error) {
    // Only fall back on transient errors, and only if using the default model
    if (
      model.id !== GEMINI_CONFIG.fallback.id &&
      shouldFallback(error)
    ) {
      console.error(
        `[counsel-mcp] Gemini ${model.id} failed (transient), falling back to ${GEMINI_CONFIG.fallback.id}:`,
        error instanceof Error ? error.message : error
      );

      try {
        const genai = getClient();
        const response = await genai.models.generateContent({
          model: GEMINI_CONFIG.fallback.id,
          contents: prompt,
          config: {
            ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error("Empty response from Gemini fallback");
        }

        return {
          text,
          model: GEMINI_CONFIG.fallback.id,
          provider: "gemini",
          usedFallback: true,
          error: `Primary model ${model.id} failed, used fallback ${GEMINI_CONFIG.fallback.id}`,
        };
      } catch (fallbackError) {
        return {
          text: "",
          model: GEMINI_CONFIG.fallback.id,
          provider: "gemini",
          usedFallback: true,
          error: `Both ${model.id} and fallback ${GEMINI_CONFIG.fallback.id} failed: ${
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError)
          }`,
        };
      }
    }

    // Non-transient error — surface directly, no fallback
    return {
      text: "",
      model: model.id,
      provider: "gemini",
      usedFallback: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

## Step 4.4: Create the provider index file

**Claude Code prompt**: "Create src/providers/index.ts that re-exports both provider clients and the shared ProviderResponse type."

**File**: `src/providers/index.ts`
```typescript
export { askOpenAI } from "./openai.js";
export { askGemini } from "./gemini.js";
export type { ProviderResponse } from "./types.js";
```

## PHASE 4 — VALIDATION GATE

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
npx tsc --noEmit
# Expected: no errors
```

**Expected**: Clean compilation. Both provider clients created with gated fallback logic.

**STOP AND REPORT**: Tell the user:
- "Phase 4 complete: OpenAI (Responses API) and Gemini (native systemInstruction + thinkingLevel) provider clients created."
- "Fallback is gated — only triggers on transient errors, not auth/config problems."
- "Ready to proceed to Phase 5?"

---

# PHASE 5: MCP Server Core

## Context
Create the MCP server entry point that registers three tools (`ask_openai`, `ask_gemini`, `ask_all`) and handles stdio transport. This is the main file that Claude Code will communicate with.

CRITICAL: `dotenv/config` is imported at the very top so environment variables from `.env` are available before any provider client initializes. Never use `console.log` anywhere in this file or any imported module — stdout is reserved for MCP JSON-RPC protocol.

## Step 5.1: Create the MCP server

**Claude Code prompt**: "Create src/index.ts — the MCP server entry point. Import dotenv/config at the very top. Register three tools: ask_openai, ask_gemini, ask_all. The ask_all tool must detect when both providers fail and return isError: true. NEVER use console.log — only console.error for diagnostics."

**File**: `src/index.ts`
```typescript
#!/usr/bin/env node

// Load .env FIRST — before any provider code runs
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { askOpenAI, askGemini } from "./providers/index.js";
import { OPENAI_CONFIG, GEMINI_CONFIG } from "./config.js";

const server = new McpServer({
  name: "counsel-of-models",
  version: "1.0.0",
});

// --- Tool: ask_openai ---
server.tool(
  "ask_openai",
  `Send a prompt to OpenAI and get a response. Default model: ${OPENAI_CONFIG.default.id} (${OPENAI_CONFIG.default.description}). For harder reasoning tasks, override with model: "gpt-5.4-pro" (slower, may take minutes). Available models: ${OPENAI_CONFIG.available.map((m) => m.id).join(", ")}`,
  {
    prompt: z.string().describe("The prompt to send to OpenAI"),
    system_prompt: z
      .string()
      .optional()
      .describe("Optional system prompt to set the context/role for the model"),
    model: z
      .string()
      .optional()
      .describe(
        `Model to use. Defaults to ${OPENAI_CONFIG.default.id}. Use "gpt-5.4-pro" for deep reasoning (slower). Options: ${OPENAI_CONFIG.available.map((m) => m.id).join(", ")}`
      ),
    reasoning_effort: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe(
        'Controls how much reasoning effort the model spends. "high" = more thorough but slower/costlier. Default: model decides. Particularly useful with gpt-5.4 and gpt-5.4-pro.'
      ),
  },
  async ({ prompt, system_prompt, model, reasoning_effort }) => {
    const response = await askOpenAI(prompt, system_prompt, model, reasoning_effort);

    if (response.error && !response.text) {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR from OpenAI (${response.model}): ${response.error}`,
          },
        ],
        isError: true,
      };
    }

    let header = `**OpenAI Response** (model: ${response.model})`;
    if (response.usedFallback) {
      header += `\n⚠️ Used fallback model: ${response.error}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `${header}\n\n---\n\n${response.text}`,
        },
      ],
    };
  }
);

// --- Tool: ask_gemini ---
server.tool(
  "ask_gemini",
  `Send a prompt to Google Gemini and get a response. Default model: ${GEMINI_CONFIG.default.id} (${GEMINI_CONFIG.default.description}). Thinking is enabled at "high" level by default. Available models: ${GEMINI_CONFIG.available.map((m) => m.id).join(", ")}`,
  {
    prompt: z.string().describe("The prompt to send to Gemini"),
    system_prompt: z
      .string()
      .optional()
      .describe("Optional system prompt to set the context/role for the model"),
    model: z
      .string()
      .optional()
      .describe(
        `Model to use. Defaults to ${GEMINI_CONFIG.default.id}. Options: ${GEMINI_CONFIG.available.map((m) => m.id).join(", ")}`
      ),
  },
  async ({ prompt, system_prompt, model }) => {
    const response = await askGemini(prompt, system_prompt, model);

    if (response.error && !response.text) {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR from Gemini (${response.model}): ${response.error}`,
          },
        ],
        isError: true,
      };
    }

    let header = `**Gemini Response** (model: ${response.model})`;
    if (response.usedFallback) {
      header += `\n⚠️ Used fallback model: ${response.error}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `${header}\n\n---\n\n${response.text}`,
        },
      ],
    };
  }
);

// --- Tool: ask_all ---
server.tool(
  "ask_all",
  `Send the same prompt to BOTH OpenAI (${OPENAI_CONFIG.default.id}) and Gemini (${GEMINI_CONFIG.default.id}) in parallel. Returns both responses for comparison and cross-validation. If one provider fails, the other's response is still returned. If both fail, returns an error. Ideal for the /counsel workflow.`,
  {
    prompt: z.string().describe("The prompt to send to both providers"),
    system_prompt: z
      .string()
      .optional()
      .describe("Optional system prompt applied to both providers"),
    openai_model: z
      .string()
      .optional()
      .describe(`OpenAI model override. Default: ${OPENAI_CONFIG.default.id}`),
    gemini_model: z
      .string()
      .optional()
      .describe(`Gemini model override. Default: ${GEMINI_CONFIG.default.id}`),
    openai_reasoning_effort: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe('OpenAI reasoning effort override. "high" = more thorough analysis.'),
  },
  async ({ prompt, system_prompt, openai_model, gemini_model, openai_reasoning_effort }) => {
    const [openaiResult, geminiResult] = await Promise.allSettled([
      askOpenAI(prompt, system_prompt, openai_model, openai_reasoning_effort),
      askGemini(prompt, system_prompt, gemini_model),
    ]);

    // Detect individual failures
    const openaiFailed =
      openaiResult.status === "rejected" ||
      (openaiResult.status === "fulfilled" &&
        !!openaiResult.value.error &&
        !openaiResult.value.text);

    const geminiFailed =
      geminiResult.status === "rejected" ||
      (geminiResult.status === "fulfilled" &&
        !!geminiResult.value.error &&
        !geminiResult.value.text);

    // If BOTH failed, return MCP error
    if (openaiFailed && geminiFailed) {
      const openaiError =
        openaiResult.status === "fulfilled"
          ? openaiResult.value.error
          : String(openaiResult.reason);
      const geminiError =
        geminiResult.status === "fulfilled"
          ? geminiResult.value.error
          : String(geminiResult.reason);

      return {
        content: [
          {
            type: "text" as const,
            text: `Both providers failed.\n\nOpenAI: ${openaiError}\n\nGemini: ${geminiError}`,
          },
        ],
        isError: true,
      };
    }

    // Build response sections
    const sections: string[] = [];

    // OpenAI section
    if (openaiResult.status === "fulfilled") {
      const r = openaiResult.value;
      let header = `## OpenAI Response (model: ${r.model})`;
      if (r.usedFallback) header += `\n⚠️ ${r.error}`;
      if (r.error && !r.text) header += `\n❌ ${r.error}`;
      sections.push(`${header}\n\n${r.text || "No response"}`);
    } else {
      sections.push(
        `## OpenAI Response\n\n❌ FAILED: ${openaiResult.reason}`
      );
    }

    // Gemini section
    if (geminiResult.status === "fulfilled") {
      const r = geminiResult.value;
      let header = `## Gemini Response (model: ${r.model})`;
      if (r.usedFallback) header += `\n⚠️ ${r.error}`;
      if (r.error && !r.text) header += `\n❌ ${r.error}`;
      sections.push(`${header}\n\n${r.text || "No response"}`);
    } else {
      sections.push(
        `## Gemini Response\n\n❌ FAILED: ${geminiResult.reason}`
      );
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `# Counsel of Models — Parallel Response\n\n${sections.join("\n\n---\n\n")}`,
        },
      ],
    };
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // IMPORTANT: console.error only — stdout is reserved for MCP JSON-RPC
  console.error("[counsel-mcp] Server running on stdio");
}

main().catch((error) => {
  console.error("[counsel-mcp] Fatal error:", error);
  process.exit(1);
});
```

## Step 5.2: Add MCP tool annotations (if SDK supports them)

**Claude Code prompt**: "Check if the installed MCP SDK version supports tool annotations. If the McpServer.tool() method accepts an annotations object (with readOnlyHint, openWorldHint, etc.), refactor the three tool registrations to include them. If the SDK version doesn't support annotations in the tool() method signature, skip this step — it's a polish item, not a blocker."

The annotations to add if supported:
```typescript
// All three tools should have these annotations:
// annotations: {
//   readOnlyHint: true,      // these tools don't modify anything locally
//   destructiveHint: false,  // no destructive side effects
//   openWorldHint: true,     // makes network calls to external APIs
// }
```

**How to check**: Run `npx tsc --noEmit` after adding annotations to one tool. If it compiles, add to all three. If it errors on the annotations property, remove them and move on. The tools work fine without annotations — they just make the server more polished and discoverable by MCP clients.

## PHASE 5 — VALIDATION GATE

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
npx tsc --noEmit
echo $?
# Expected: 0 (no errors)

# Build and verify output
npm run build
ls dist/
# Expected: index.js, config.js, providers/ directory with openai.js, gemini.js, types.js, index.js

# Verify the shebang is present
head -1 dist/index.js
# Expected: #!/usr/bin/env node

# Verify no console.log anywhere in source
grep -rn "console\.log" src/
# Expected: no output (only console.error should exist)
```

**Expected**: Clean build with all files in `dist/`. Zero TypeScript errors. No `console.log` in source.

**STOP AND REPORT**: Tell the user:
- "Phase 5 complete: MCP server built with 3 tools (ask_openai, ask_gemini, ask_all)."
- "Build output in dist/ — zero TypeScript errors."
- "dotenv loaded at startup for .env support."
- "ask_all has explicit dual-failure detection."
- "Ready to proceed to Phase 6?"

---

# PHASE 6: Smoke Test

## Context
Before registering with Claude Code, verify that both providers actually work. This catches auth errors, wrong model IDs, and SDK issues immediately rather than discovering them during MCP registration.

## Step 6.1: Create the smoke test script

**Claude Code prompt**: "Create src/smoke.ts — a standalone script that tests both providers with a simple prompt. It should import dotenv/config, call both askOpenAI and askGemini, and report success or failure with the model used."

**File**: `src/smoke.ts`
```typescript
#!/usr/bin/env node

import "dotenv/config";
import { askOpenAI } from "./providers/openai.js";
import { askGemini } from "./providers/gemini.js";

const TEST_PROMPT = "Reply with exactly: OK";

async function smoke() {
  console.error("=== Counsel of Models — Smoke Test ===\n");

  let passed = 0;
  let failed = 0;

  // Test OpenAI
  console.error("Testing OpenAI...");
  try {
    const openaiResult = await askOpenAI(TEST_PROMPT);
    if (openaiResult.text) {
      console.error(`  ✅ OpenAI OK (model: ${openaiResult.model})`);
      console.error(`  Response: "${openaiResult.text.trim().substring(0, 50)}"`);
      passed++;
    } else {
      console.error(`  ❌ OpenAI returned empty response`);
      if (openaiResult.error) console.error(`  Error: ${openaiResult.error}`);
      failed++;
    }
  } catch (error) {
    console.error(
      `  ❌ OpenAI threw: ${error instanceof Error ? error.message : String(error)}`
    );
    failed++;
  }

  console.error("");

  // Test Gemini
  console.error("Testing Gemini...");
  try {
    const geminiResult = await askGemini(TEST_PROMPT);
    if (geminiResult.text) {
      console.error(`  ✅ Gemini OK (model: ${geminiResult.model})`);
      console.error(`  Response: "${geminiResult.text.trim().substring(0, 50)}"`);
      passed++;
    } else {
      console.error(`  ❌ Gemini returned empty response`);
      if (geminiResult.error) console.error(`  Error: ${geminiResult.error}`);
      failed++;
    }
  } catch (error) {
    console.error(
      `  ❌ Gemini threw: ${error instanceof Error ? error.message : String(error)}`
    );
    failed++;
  }

  console.error(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error(
      "\n⚠️  Fix the failing provider(s) before proceeding to MCP registration."
    );
    console.error("   Common fixes:");
    console.error("   - Check API key in .env or shell profile");
    console.error("   - Verify model IDs in src/config.ts");
    console.error("   - Check provider status pages for outages");
    process.exit(1);
  }

  console.error("\n🎉 Both providers working. Safe to register with Claude Code.");
  process.exit(0);
}

smoke();
```

## Step 6.2: Build and run the smoke test

**Claude Code prompt**: "Build the project and run the smoke test to verify both providers work."

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
npm run build
npm run smoke
```

## PHASE 6 — VALIDATION GATE

```bash
npm run smoke
# Expected output:
# === Counsel of Models — Smoke Test ===
#
# Testing OpenAI...
#   ✅ OpenAI OK (model: gpt-5.4)
#   Response: "OK"
#
# Testing Gemini...
#   ✅ Gemini OK (model: gemini-3.1-pro-preview)
#   Response: "OK"
#
# === Results: 2 passed, 0 failed ===
#
# 🎉 Both providers working. Safe to register with Claude Code.
```

**Expected**: Both providers respond successfully. Exit code 0.

**If a provider fails**: DO NOT proceed. Check the error message, fix the issue (usually an API key or model ID problem), rebuild, and re-run the smoke test.

**STOP AND REPORT**: Tell the user:
- "Phase 6 complete: smoke test passed — both providers confirmed working."
- "OpenAI responded with model: [model name]"
- "Gemini responded with model: [model name]"
- "Ready to proceed to Phase 7?"

---

# PHASE 7: README and Documentation

## Context
Create the README for the public GitHub repo.

## Step 7.1: Create README.md

**Claude Code prompt**: "Create README.md for the Counsel of Models MCP server repo."

**File**: `README.md`
```markdown
# Counsel of Models MCP Server

An MCP (Model Context Protocol) server that lets Claude Code agents call OpenAI and Google Gemini models natively. Built for cross-validation workflows where you want multiple AI perspectives on the same problem.

## What It Does

Exposes three tools to any Claude Code session:

| Tool | Description |
|------|-------------|
| `ask_openai` | Send a prompt to OpenAI (default: gpt-5.4) |
| `ask_gemini` | Send a prompt to Google Gemini (default: gemini-3.1-pro-preview with thinking enabled) |
| `ask_all` | Send to both in parallel, get combined responses |

## Setup

### 1. Clone and build

```bash
git clone https://github.com/russellmoss/Counsel_of_models_MCP.git
cd Counsel_of_models_MCP
npm install
npm run build
```

### 2. Set your API keys

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.profile`):

```bash
export OPENAI_API_KEY="sk-your-key-here"
export GEMINI_API_KEY="your-key-here"
```

Then reload: `source ~/.bashrc` (or `~/.zshrc`)

Alternatively, create a `.env` file in the project root (it's gitignored):
```
OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=your-key-here
```

### 3. Verify providers work

```bash
npm run smoke
```

### 4. Register with Claude Code

```bash
claude mcp add --scope user counsel-mcp -- node /full/path/to/Counsel_of_models_MCP/dist/index.js
```

### 5. Verify

```bash
claude mcp list
# Should show: counsel-mcp
```

## Usage in Claude Code

Once registered, Claude Code agents can call the tools directly:

- "Use ask_openai to review this code for security issues"
- "Use ask_all to get both GPT and Gemini's opinion on this architecture"
- "Use ask_gemini to challenge the business logic assumptions in this document"

For harder reasoning tasks, override the OpenAI model:
- "Use ask_openai with model gpt-5.4-pro to deeply analyze this build guide"

For more thorough analysis without changing models, set reasoning effort:
- "Use ask_openai with reasoning_effort high to review this architecture"

## Updating Models

When new models launch, edit `src/config.ts` and rebuild:

```bash
npm run build
npm run smoke  # verify new models work
```

## Available Models

### OpenAI
- `gpt-5.4` — Best overall (default)
- `gpt-5.4-pro` — Deep reasoning (slower, opt-in)
- `gpt-5.4-mini` — Fast and cheap
- `gpt-5.4-nano` — Ultra fast

### Google Gemini
- `gemini-3.1-pro-preview` — Flagship reasoning (default, thinking enabled)
- `gemini-3-flash-preview` — Fast and efficient
- `gemini-3.1-flash-lite-preview` — Budget option

## Architecture

- **Transport**: stdio (standard for Claude Code MCP servers)
- **OpenAI API**: Responses API (`responses.create`) with optional `reasoning.effort` control
- **Gemini API**: `@google/genai` with native `systemInstruction` and `thinkingLevel: "high"`
- **Fallback**: Only on transient errors — auth/config errors surface immediately
- **Keys**: Environment variables or `.env` file (loaded via dotenv)
- **MCP SDK**: Pinned to exact tested version (1.25.2)

## License

MIT
```

## PHASE 7 — VALIDATION GATE

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp
# Verify all expected files exist
ls README.md .gitignore .env.example tsconfig.json package.json
ls src/index.ts src/config.ts src/smoke.ts
ls src/providers/openai.ts src/providers/gemini.ts src/providers/types.ts src/providers/index.ts
ls dist/index.js dist/config.js dist/smoke.js
# Expected: all files exist

# Final clean build
npm run rebuild
echo $?
# Expected: 0
```

**STOP AND REPORT**: Tell the user:
- "Phase 7 complete: README and docs created."
- "Ready to proceed to Phase 8?"

---

# PHASE 8: Register MCP Server with Claude Code and Integration Test

## Context
Register the built MCP server globally in Claude Code so it's available from any project directory. Then run an integration test.

## Step 8.1: Register the server

**Claude Code prompt**: "Register the counsel-mcp server with Claude Code at user scope."

```bash
# Get the absolute path to the built entry point
COUNSEL_PATH="/mnt/c/Users/russe/Documents/Counsel_of_models_mcp/dist/index.js"

# Register globally (--scope user makes it available in all projects)
claude mcp add --scope user counsel-mcp -- node "$COUNSEL_PATH"

# Verify registration
claude mcp list
```

## Step 8.2: Integration test

**Claude Code prompt**: "Start a new Claude Code session and test all three tools with simple prompts."

This step requires starting a **new** Claude Code session (the current one won't see the newly registered MCP server). Tell the user:

> **To test, start a new Claude Code session and run these three commands one at a time:**
>
> 1. `Use the ask_openai tool with prompt: "Say hello and confirm which model you are. One sentence."`
> 2. `Use the ask_gemini tool with prompt: "Say hello and confirm which model you are. One sentence."`
> 3. `Use the ask_all tool with prompt: "Say hello and confirm which model you are. One sentence."`

## PHASE 8 — VALIDATION GATE

All three tools should return responses. Verify:
- `ask_openai` returns a response mentioning a GPT model
- `ask_gemini` returns a response mentioning a Gemini model
- `ask_all` returns BOTH responses in a single combined output
- No authentication errors
- No timeout errors

```bash
claude mcp list | grep counsel-mcp
# Expected: counsel-mcp listed
```

**STOP AND REPORT**: Tell the user:
- "Phase 8 complete: MCP server registered and integration-tested."
- "All three tools working: ask_openai, ask_gemini, ask_all."
- "The server is available in every Claude Code session across all projects."
- "Ready to proceed to Phase 9?"

---

# PHASE 9: Git Commit and Push

## Context
Commit the working project to the remote repository.

## Step 9.1: Stage and commit

**Claude Code prompt**: "Stage all files, commit, and push to the remote. Verify no secrets are included."

```bash
cd /mnt/c/Users/russe/Documents/Counsel_of_models_mcp

# Verify .gitignore is correct
cat .gitignore

# Stage everything
git add -A

# Verify what's being committed — MUST NOT include .env, dist/, node_modules/
git status

# Double-check no secrets leaked into tracked files
git diff --cached | grep -i "sk-" | grep -v ".env.example" | grep -v "your-key"
# Expected: no output

# Commit
git commit -m "Initial build: Counsel of Models MCP server

- MCP server with ask_openai, ask_gemini, ask_all tools
- OpenAI: Responses API, default gpt-5.4, gpt-5.4-pro opt-in
- Gemini: native systemInstruction, thinkingLevel high, default gemini-3.1-pro-preview
- Smart fallback: only on transient errors, not auth/config
- Dual-failure detection in ask_all
- Smoke test script for provider verification
- dotenv for local .env + shell profile for global keys
- Cross-validated by GPT-5.4 and Gemini 3.1 Pro before build"

# Push
git push origin main
```

## PHASE 9 — VALIDATION GATE

```bash
# Verify the push succeeded
git log --oneline -1

# Verify no sensitive data was pushed
git show --stat HEAD | grep -i env
# Expected: only .env.example, NOT .env

# Verify the remote is correct
git remote -v
# Expected: https://github.com/russellmoss/Counsel_of_models_MCP
```

**STOP AND REPORT**: Tell the user:
- "Phase 9 complete: project pushed to GitHub."
- "Public repo at https://github.com/russellmoss/Counsel_of_models_MCP"
- "No API keys or secrets in the repo."
- "The MCP server is fully built, smoke-tested, registered, and deployed."
- "Next step: create `/counsel` and `/refine` slash commands in the Savvy dashboard repo to use these tools."

---

# Troubleshooting Appendix

## Common Issues

### "Missing OPENAI_API_KEY environment variable"
Two possible sources — check both:
1. Shell profile: Run `echo $OPENAI_API_KEY` — if empty, run `source ~/.bashrc`
2. .env file: Check the project root for a `.env` file with the key

### Claude Code doesn't see the counsel-mcp server
Run `claude mcp list` to verify. If missing, re-register:
```bash
claude mcp add --scope user counsel-mcp -- node /mnt/c/Users/russe/Documents/Counsel_of_models_mcp/dist/index.js
```
Then start a **new** Claude Code session — existing sessions don't pick up new MCP servers.

### "Cannot find module" errors at runtime
TypeScript hasn't been compiled. Run `npm run build` in the project directory.

### Authentication error (401/403) — no fallback triggered
This is intentional. Auth errors mean your API key is wrong or expired. The server does NOT fall back on auth errors because that would mask the real problem. Fix the key in your `.env` or shell profile.

### Model not found error
The model ID in `src/config.ts` may be outdated. Check the provider's docs for current model IDs:
- OpenAI: https://platform.openai.com/docs/models
- Gemini: https://ai.google.dev/gemini-api/docs/models

### Timeout on ask_all or ask_gemini
Reasoning models with thinking enabled can take 30-60+ seconds. This is normal for deep reasoning tasks. If timeouts are frequent:
- For Gemini: reduce `thinkingLevel` from `"high"` to `"medium"` in `src/providers/gemini.ts`
- For OpenAI: avoid `gpt-5.4-pro` default (already changed to opt-in)
- Consider splitting large prompts into smaller, focused questions

### Fallback triggered unexpectedly
Check the `[counsel-mcp]` log lines in stderr. The server logs why fallback was triggered. If it's a transient error (rate limit, server overload), fallback is working correctly. If it's a config error that slipped through the `shouldFallback` filter, update the regex in `src/config.ts`.

## File Map

```
Counsel_of_models_mcp/
├── src/
│   ├── index.ts          # MCP server entry point, tool definitions
│   ├── config.ts         # Model defaults — EDIT THIS to update models
│   ├── smoke.ts          # Provider smoke test script
│   └── providers/
│       ├── index.ts      # Re-exports
│       ├── types.ts      # Shared ProviderResponse interface
│       ├── openai.ts     # OpenAI client (Responses API)
│       └── gemini.ts     # Gemini client (native systemInstruction + thinkingLevel)
├── dist/                 # Compiled JS (gitignored)
├── .env                  # Local API keys (gitignored, you create this)
├── .env.example          # Shows required env vars (no actual keys)
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```
