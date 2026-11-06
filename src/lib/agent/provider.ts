/**
 * ShopMate AI — AI provider abstraction (Phase 4).
 *
 * Resolves the chat model from environment configuration so the shopping
 * logic never depends on a specific vendor. Three providers:
 *
 * - `groq` — Groq's OpenAI-compatible API (primary cloud provider). The key
 *   lives in `GROQ_API_KEY` (server-side only, never logged) and every
 *   request is bounded by a timeout.
 * - `google` — Gemini via `@ai-sdk/google`. The key lives in
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

export type AIProviderName = "google" | "groq" | "ollama";

/** Default chat model per provider (all free to run). */
export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  google: "gemini-3.8-flash",
  groq: "openai/gpt-oss-120b",
  ollama: "gemma3:4b",
};

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1";

/** Outbound Groq request timeout: env-overridable, clamped to a safe range. */
const DEFAULT_GROQ_TIMEOUT_MS = 15_000;
const MIN_GROQ_TIMEOUT_MS = 3_000;
const MAX_GROQ_TIMEOUT_MS = 60_000;

function groqTimeoutMs(): number {
  const raw = process.env.SHOPMATE_AI_TIMEOUT_MS;
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_GROQ_TIMEOUT_MS;
  return Math.min(
    Math.max(Math.round(parsed), MIN_GROQ_TIMEOUT_MS),
    MAX_GROQ_TIMEOUT_MS,
  );
}

/**
 * Fetch wrapper bounding every Groq request with a timeout. Combines the
 * SDK's own abort signal (when present) with the timeout so either can fire.
 */
/**
 * Groq's OpenAI-compatible API rejects `reasoning_content` on incoming
 * assistant messages ("messages.N: for role:assistant property
 * 'reasoning_content' is unsupported", HTTP 400) while its reasoning models
 * (e.g. openai/gpt-oss-120b) return reasoning that the AI SDK stores and
 * re-sends on the next tool-loop step. Removes exactly that unsupported
 * field from outgoing chat-completion request bodies; tool calls, tool
 * results, ids and ordering are untouched. Non-JSON bodies and bodies
 * without a messages array pass through unchanged.
 */
export function stripGroqUnsupportedRequestFields(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { messages?: unknown }).messages)
  ) {
    return body;
  }
  const messages = (parsed as { messages: Record<string, unknown>[] }).messages;
  let changed = false;
  for (const message of messages) {
    if (
      typeof message === "object" &&
      message !== null &&
      message.role === "assistant" &&
      "reasoning_content" in message
    ) {
      delete message.reasoning_content;
      changed = true;
    }
  }
  return changed ? JSON.stringify(parsed) : body;
}

/**
 * Builds the Groq transport: strips fields Groq rejects on incoming messages
 * and bounds every request with a timeout. `underlying` is the fetch
 * implementation to call through to (the global fetch in production; tests
 * inject a capturing fetch here and still get the same transformations).
 */
function createGroqFetch(underlying: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(groqTimeoutMs());
    const upstream = init?.signal;
    const signal = upstream
      ? AbortSignal.any([upstream, timeoutSignal])
      : timeoutSignal;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    let body = init?.body;
    if (typeof body === "string" && url.includes("/chat/completions")) {
      body = stripGroqUnsupportedRequestFields(body);
    }
    return underlying(input, { ...init, body, signal });
  };
}

/**
 * Builds the Groq chat model. Split out from `resolveChatModel` so tests can
 * inject a capturing fetch and exercise the real provider serialization.
 */
export function createGroqModel(
  apiKey: string,
  options?: { modelId?: string; fetch?: typeof fetch },
): LanguageModel {
  const groq = createOpenAICompatible({
    name: "groq",
    baseURL: DEFAULT_GROQ_URL,
    apiKey,
    fetch: createGroqFetch(options?.fetch),
  });
  return groq(options?.modelId ?? resolveModelId());
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** The selected provider: `SHOPMATE_AI_PROVIDER`, defaulting to google. */
export function getProviderName(): AIProviderName {
  const selected = readEnv("SHOPMATE_AI_PROVIDER");
  if (selected === "groq") return "groq";
  if (selected === "ollama") return "ollama";
  return "google";
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
  const provider = getProviderName();
  if (provider === "ollama") return true;
  if (provider === "groq") return Boolean(readEnv("GROQ_API_KEY"));
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

  if (provider === "groq") {
    const apiKey = readEnv("GROQ_API_KEY");
    if (!apiKey) return null;
    return createGroqModel(apiKey, { modelId });
  }

  const apiKey = readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GEMINI_API_KEY");
  if (!apiKey) return null;

  const google = createGoogle({ apiKey });
  return google(modelId);
}
