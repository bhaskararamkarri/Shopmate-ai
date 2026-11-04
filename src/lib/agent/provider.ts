/**
 * ShopMate AI — AI provider abstraction (Phase 4).
 *
 * Resolves the chat model from environment configuration so the shopping
 * logic never depends on a specific vendor. Two providers:
 *
 * - `google` — Gemini via `@ai-sdk/google` (default). The key lives in
 *   `GOOGLE_GENERATIVE_AI_API_KEY` (the AI SDK default) or `GEMINI_API_KEY`
 *   as an alias; it is read here once and never logged.
 * - `ollama` — any local OpenAI-compatible server via `@ai-sdk/openai-compatible`,
 *   a development fallback that needs no cloud key.
 *
 * No network calls happen here: this module only builds model instances.
 */
import { createGoogle } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AIProviderName = "google" | "ollama";

/** Default chat model per provider (both free to run). */
export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  google: "gemini-3.8-flash",
  ollama: "gemma3:4b",
};

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/v1";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** The selected provider: `SHOPMATE_AI_PROVIDER`, defaulting to google. */
export function getProviderName(): AIProviderName {
  return readEnv("SHOPMATE_AI_PROVIDER") === "ollama" ? "ollama" : "google";
}

/** The configured model id for the selected provider. */
export function resolveModelId(): string {
  const override = readEnv("SHOPMATE_AI_MODEL");
  if (override) return override;
  return DEFAULT_MODELS[getProviderName()];
}

/**
 * True when the selected provider can be constructed. Google needs an API
 * key (server-side only); Ollama needs nothing beyond the local server.
 */
export function isAIConfigured(): boolean {
  if (getProviderName() === "ollama") return true;
  return Boolean(
    readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GEMINI_API_KEY"),
  );
}

/**
 * Builds the chat model for the selected provider, or null when the
 * configuration is incomplete. Callers treat null as "AI unavailable" and
 * fall back to the deterministic keyword path.
 */
export function resolveChatModel(): LanguageModel | null {
  const provider = getProviderName();
  const modelId = resolveModelId();

  if (provider === "ollama") {
    const ollama = createOpenAICompatible({
      name: "ollama",
      baseURL: readEnv("SHOPMATE_OLLAMA_URL") ?? DEFAULT_OLLAMA_URL,
    });
    return ollama(modelId);
  }

  const apiKey = readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GEMINI_API_KEY");
  if (!apiKey) return null;

  const google = createGoogle({ apiKey });
  return google(modelId);
}
