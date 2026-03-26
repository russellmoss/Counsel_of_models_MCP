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
