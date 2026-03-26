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
  {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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
  {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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
  {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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
