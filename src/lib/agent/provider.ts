/**
 * ShopMate AI — Multi-Provider Abstraction & Candidate Resolution (Phase 8).
 *
 * Resolves chat models from environment configuration across:
 * 1. `google` — Gemini via `@ai-sdk/google` (primary cloud provider).
 *    Key: `GOOGLE_GENERATIVE_AI_API_KEY` (AI SDK default) or `GEMINI_API_KEY`.
 * 2. `cerebras` — Cerebras Inference via `@ai-sdk/cerebras` (ultra-fast secondary).
 *    Key: `CEREBRAS_API_KEY`.
 * 3. `groq` — Groq via `@ai-sdk/openai-compatible` (tertiary provider).
 *    Key: `GROQ_API_KEY`.
 * 4. `openrouter` — OpenRouter via `@ai-sdk/openai-compatible` (optional fallback).
 *    Key: `OPENROUTER_API_KEY`.
 * 5. `ollama` — Local OpenAI-compatible server (development fallback).
 *
 * Keys live strictly server-side and are never logged or exposed.
 */
import { createGoogle } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AIProviderName = "google" | "cerebras" | "groq" | "openrouter" | "ollama";

/** Default chat model per provider. Verified current active models. */
export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  google: "gemini-3.8-flash",
  cerebras: "gpt-oss-120b",
  groq: "openai/gpt-oss-120b",
  openrouter: "openrouter/free",
  ollama: "gemma3:4b",
};

/** Default automatic fallback priority chain. */
export const DEFAULT_PRIORITY: AIProviderName[] = [
  "google",
  "cerebras",
  "groq",
  "openrouter",
  "ollama",
];

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_CEREBRAS_URL = "https://api.cerebras.ai/v1";
const DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1";
const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1";

/** Default outbound request timeout per provider in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 60_000;

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/**
 * Outbound provider timeout: env-overridable (per provider or global), clamped safely.
 */
export function aiTimeoutMs(provider?: AIProviderName): number {
  const specificKey = provider
    ? `SHOPMATE_AI_TIMEOUT_${provider.toUpperCase()}_MS`
    : undefined;
  const raw =
    (specificKey ? readEnv(specificKey) : undefined) ??
    readEnv("SHOPMATE_AI_TIMEOUT_MS");
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

/**
 * Sanitizes OpenAI-compatible chat completion request bodies by stripping
 * non-standard fields that providers like Cerebras and Groq reject on multi-step turns
 * (such as `reasoning_content` injected into assistant history messages by the AI SDK).
 *
 * Preserves all legitimate tool_calls, arguments, tool results, message order, and conversation context.
 */
export function sanitizeOpenAICompatibleRequestBody(body: string): string {
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

/** Backward compatibility alias for Groq tests */
export const stripGroqUnsupportedRequestFields = sanitizeOpenAICompatibleRequestBody;

export function createOpenAICompatibleFetch(provider: AIProviderName, underlying: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(aiTimeoutMs(provider));
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
      body = sanitizeOpenAICompatibleRequestBody(body);
    }
    return underlying(input, { ...init, body, signal });
  };
}

function createGroqFetch(underlying: typeof fetch = fetch): typeof fetch {
  return createOpenAICompatibleFetch("groq", underlying);
}

function createTimeoutFetch(provider: AIProviderName, underlying: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(aiTimeoutMs(provider));
    const upstream = init?.signal;
    const signal = upstream
      ? AbortSignal.any([upstream, timeoutSignal])
      : timeoutSignal;
    return underlying(input, { ...init, signal });
  };
}

/** Builds the Google Gemini chat model. */
export function createGoogleModel(
  apiKey: string,
  options?: { modelId?: string; fetch?: typeof fetch },
): LanguageModel {
  const google = createGoogle({
    apiKey,
    fetch: createTimeoutFetch("google", options?.fetch ?? fetch),
  });
  return google(options?.modelId ?? resolveModelId("google"));
}

/** Builds the Cerebras Inference model. */
export function createCerebrasModel(
  apiKey: string,
  options?: { modelId?: string; fetch?: typeof fetch },
): LanguageModel {
  const cerebras = createOpenAICompatible({
    name: "cerebras",
    baseURL: DEFAULT_CEREBRAS_URL,
    apiKey,
    fetch: createOpenAICompatibleFetch("cerebras", options?.fetch),
  });
  return cerebras(options?.modelId ?? resolveModelId("cerebras"));
}

/** Builds the Groq chat model. */
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
  return groq(options?.modelId ?? resolveModelId("groq"));
}

/** Builds the OpenRouter chat model. */
export function createOpenRouterModel(
  apiKey: string,
  options?: { modelId?: string; fetch?: typeof fetch },
): LanguageModel {
  const openrouter = createOpenAICompatible({
    name: "openrouter",
    baseURL: DEFAULT_OPENROUTER_URL,
    apiKey,
    headers: {
      "HTTP-Referer": "https://shopmate-ai.com",
      "X-Title": "ShopMate AI",
    },
    fetch: createOpenAICompatibleFetch("openrouter", options?.fetch),
  });
  return openrouter(options?.modelId ?? resolveModelId("openrouter"));
}

/** Builds the local Ollama model. */
export function createOllamaModel(
  options?: { modelId?: string; baseURL?: string; fetch?: typeof fetch },
): LanguageModel {
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: options?.baseURL ?? readEnv("SHOPMATE_OLLAMA_URL") ?? DEFAULT_OLLAMA_URL,
    fetch: createTimeoutFetch("ollama", options?.fetch ?? fetch),
  });
  return ollama(options?.modelId ?? resolveModelId("ollama"));
}

/** Returns the configured model id for a specific provider. */
export function resolveModelId(provider: AIProviderName = getProviderName()): string {
  const specificKey = `SHOPMATE_AI_MODEL_${provider.toUpperCase()}`;
  const specificOverride = readEnv(specificKey);
  if (specificOverride) return specificOverride;

  const genericOverride = readEnv("SHOPMATE_AI_MODEL");
  if (genericOverride) {
    // Prevent cross-provider model mismatches (e.g. Groq openai/ models passed to Google)
    if (
      provider === "google" &&
      (genericOverride.startsWith("openai/") || genericOverride.includes("llama"))
    ) {
      return DEFAULT_MODELS.google;
    }
    if (provider === "groq" && genericOverride.startsWith("gemini-")) {
      return DEFAULT_MODELS.groq;
    }
    if (
      provider === "cerebras" &&
      (genericOverride.startsWith("gemini-") || genericOverride.startsWith("openai/"))
    ) {
      return DEFAULT_MODELS.cerebras;
    }
    if (
      provider === "openrouter" &&
      (genericOverride.startsWith("openai/") || genericOverride.startsWith("gemini-"))
    ) {
      return DEFAULT_MODELS.openrouter;
    }
    return genericOverride;
  }
  return DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.google;
}

/** Returns whether a specific provider has valid credentials/configuration. */
export function isProviderConfigured(provider: AIProviderName): boolean {
  if (provider === "ollama") {
    // Only configured if explicitly requested or local url set
    return (
      readEnv("SHOPMATE_AI_PROVIDER") === "ollama" ||
      Boolean(readEnv("SHOPMATE_OLLAMA_URL"))
    );
  }
  if (provider === "google") {
    return Boolean(
      readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GEMINI_API_KEY"),
    );
  }
  if (provider === "cerebras") {
    return Boolean(readEnv("CEREBRAS_API_KEY"));
  }
  if (provider === "groq") {
    return Boolean(readEnv("GROQ_API_KEY"));
  }
  if (provider === "openrouter") {
    return Boolean(readEnv("OPENROUTER_API_KEY"));
  }
  return false;
}

/** Resolves ordered provider priority based on environment configuration. */
export function getProviderPriority(): AIProviderName[] {
  const customList = readEnv("SHOPMATE_AI_PROVIDERS");
  if (customList) {
    const parsed = customList
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is AIProviderName =>
        ["google", "cerebras", "groq", "openrouter", "ollama"].includes(s),
      );
    if (parsed.length > 0) return parsed;
  }

  const single = readEnv("SHOPMATE_AI_PROVIDER");
  if (single) {
    const valid: AIProviderName = (
      ["google", "cerebras", "groq", "openrouter", "ollama"] as AIProviderName[]
    ).includes(single as AIProviderName)
      ? (single as AIProviderName)
      : "google";
    const others = DEFAULT_PRIORITY.filter((p) => p !== valid);
    return [valid, ...others];
  }

  return DEFAULT_PRIORITY;
}

/** The selected primary provider name. */
export function getProviderName(): AIProviderName {
  const single = readEnv("SHOPMATE_AI_PROVIDER");
  if (single) {
    if (
      (["google", "cerebras", "groq", "openrouter", "ollama"] as AIProviderName[]).includes(
        single as AIProviderName,
      )
    ) {
      return single as AIProviderName;
    }
    return "google";
  }
  const priority = getProviderPriority();
  return priority[0] ?? "google";
}

export interface ProviderCandidate {
  name: AIProviderName;
  modelId: string;
  createModel: () => LanguageModel;
  timeoutMs: number;
}

/** Returns the list of all currently configured and ready-to-run provider candidates. */
export function getConfiguredProviders(options?: {
  fetch?: typeof fetch;
}): ProviderCandidate[] {
  const single = readEnv("SHOPMATE_AI_PROVIDER");
  const priority = getProviderPriority();
  const candidates: ProviderCandidate[] = [];

  for (const name of priority) {
    // If a user explicitly pinned a single provider (legacy SHOPMATE_AI_PROVIDER),
    // we prioritize that provider; if they pinned it alone without SHOPMATE_AI_PROVIDERS,
    // only that provider is configured if they want strict single-provider behavior.
    if (single && !readEnv("SHOPMATE_AI_PROVIDERS") && name !== single) {
      // Legacy behavior: when SHOPMATE_AI_PROVIDER is set, only that provider is active
      continue;
    }

    if (!isProviderConfigured(name)) continue;
    const modelId = resolveModelId(name);
    const timeoutMs = aiTimeoutMs(name);

    if (name === "google") {
      const apiKey =
        readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GEMINI_API_KEY");
      if (apiKey) {
        candidates.push({
          name: "google",
          modelId,
          createModel: () => createGoogleModel(apiKey, { modelId, fetch: options?.fetch }),
          timeoutMs,
        });
      }
    } else if (name === "cerebras") {
      const apiKey = readEnv("CEREBRAS_API_KEY");
      if (apiKey) {
        candidates.push({
          name: "cerebras",
          modelId,
          createModel: () =>
            createCerebrasModel(apiKey, { modelId, fetch: options?.fetch }),
          timeoutMs,
        });
      }
    } else if (name === "groq") {
      const apiKey = readEnv("GROQ_API_KEY");
      if (apiKey) {
        candidates.push({
          name: "groq",
          modelId,
          createModel: () =>
            createGroqModel(apiKey, { modelId, fetch: options?.fetch }),
          timeoutMs,
        });
      }
    } else if (name === "openrouter") {
      const apiKey = readEnv("OPENROUTER_API_KEY");
      if (apiKey) {
        candidates.push({
          name: "openrouter",
          modelId,
          createModel: () =>
            createOpenRouterModel(apiKey, { modelId, fetch: options?.fetch }),
          timeoutMs,
        });
      }
    } else if (name === "ollama") {
      candidates.push({
        name: "ollama",
        modelId,
        createModel: () =>
          createOllamaModel({ modelId, fetch: options?.fetch }),
        timeoutMs,
      });
    }
  }

  return candidates;
}

/**
 * True when at least one candidate provider has valid configuration.
 */
export function isAIConfigured(): boolean {
  const single = readEnv("SHOPMATE_AI_PROVIDER");
  if (single && !readEnv("SHOPMATE_AI_PROVIDERS")) {
    const valid = (
      ["google", "cerebras", "groq", "openrouter", "ollama"] as AIProviderName[]
    ).includes(single as AIProviderName)
      ? (single as AIProviderName)
      : "google";
    return isProviderConfigured(valid);
  }
  return getConfiguredProviders().length > 0;
}

/**
 * Builds the chat model for the primary configured provider, or null when
 * no provider is ready.
 */
export function resolveChatModel(): LanguageModel | null {
  const configured = getConfiguredProviders();
  if (configured.length === 0) return null;
  return configured[0].createModel();
}
