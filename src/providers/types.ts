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
