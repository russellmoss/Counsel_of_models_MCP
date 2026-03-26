import { GoogleGenAI, ThinkingLevel } from "@google/genai";
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
          thinkingLevel: ThinkingLevel.HIGH,
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
