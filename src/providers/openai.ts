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
