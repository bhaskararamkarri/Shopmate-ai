import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredProviders,
  getProviderName,
  getProviderPriority,
  isAIConfigured,
  isProviderConfigured,
  resolveChatModel,
  resolveModelId,
} from "@/lib/agent/provider";

function setEnv(overrides: Record<string, string | undefined>) {
  const keys = [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "CEREBRAS_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "SHOPMATE_AI_PROVIDER",
    "SHOPMATE_AI_PROVIDERS",
    "SHOPMATE_AI_MODEL",
    "SHOPMATE_AI_MODEL_GOOGLE",
    "SHOPMATE_AI_MODEL_CEREBRAS",
    "SHOPMATE_AI_MODEL_GROQ",
    "SHOPMATE_AI_MODEL_OPENROUTER",
    "SHOPMATE_OLLAMA_URL",
  ];
  for (const key of keys) {
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
}

describe("provider configuration", () => {
  afterEach(() => {
    setEnv({});
    vi.restoreAllMocks();
  });

  it("reports unconfigured when no key is present", () => {
    setEnv({});
    expect(isAIConfigured()).toBe(false);
    expect(resolveChatModel()).toBeNull();
    expect(getConfiguredProviders()).toEqual([]);
  });

  it("treats a whitespace-only key as unconfigured", () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: "   " });
    expect(isAIConfigured()).toBe(false);
    expect(resolveChatModel()).toBeNull();
  });

  it("accepts the AI SDK default Google key", () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: "test-key" });
    expect(isAIConfigured()).toBe(true);
    expect(getProviderName()).toBe("google");
    expect(resolveModelId()).toBe("gemini-3.8-flash");
  });

  it("also accepts a GEMINI_API_KEY alias", () => {
    setEnv({ GEMINI_API_KEY: "test-key" });
    expect(isAIConfigured()).toBe(true);
    expect(getProviderName()).toBe("google");
  });

  it("honors a model override", () => {
    setEnv({
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
      SHOPMATE_AI_MODEL: "gemini-3.6-flash",
    });
    expect(resolveModelId()).toBe("gemini-3.6-flash");
  });

  it("honors provider-specific model overrides", () => {
    setEnv({
      CEREBRAS_API_KEY: "test-cerebras",
      SHOPMATE_AI_MODEL_CEREBRAS: "llama-3.3-70b-custom",
    });
    expect(resolveModelId("cerebras")).toBe("llama-3.3-70b-custom");
  });

  it("switches to ollama when explicitly selected", () => {
    setEnv({ SHOPMATE_AI_PROVIDER: "ollama" });
    expect(getProviderName()).toBe("ollama");
    expect(isAIConfigured()).toBe(true);
    expect(resolveModelId()).toBe("gemma3:4b");
  });

  it("honors an ollama model override", () => {
    setEnv({
      SHOPMATE_AI_PROVIDER: "ollama",
      SHOPMATE_AI_MODEL: "llama3.2:3b",
    });
    expect(resolveModelId()).toBe("llama3.2:3b");
  });

  it("falls back to google for unknown provider values", () => {
    setEnv({
      SHOPMATE_AI_PROVIDER: "mystery",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    });
    expect(getProviderName()).toBe("google");
  });

  it("builds a google model when configured", () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: "test-key" });
    const model = resolveChatModel();
    expect(model).not.toBeNull();
    expect((model as { modelId?: string }).modelId).toBe("gemini-3.8-flash");
  });

  it("builds an ollama model against the local endpoint", () => {
    setEnv({
      SHOPMATE_AI_PROVIDER: "ollama",
      SHOPMATE_OLLAMA_URL: "http://127.0.0.1:11434/v1",
    });
    const model = resolveChatModel();
    expect(model).not.toBeNull();
    expect((model as { provider?: string }).provider).toContain("ollama");
  });

  it("switches to groq when explicitly selected", () => {
    setEnv({ SHOPMATE_AI_PROVIDER: "groq" });
    expect(getProviderName()).toBe("groq");
    expect(isAIConfigured()).toBe(false);
    expect(resolveModelId()).toBe("openai/gpt-oss-120b");
  });

  it("does not accept a Google key when groq is selected", () => {
    setEnv({
      SHOPMATE_AI_PROVIDER: "groq",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
      GEMINI_API_KEY: "test-key",
    });
    expect(isAIConfigured()).toBe(false);
    expect(resolveChatModel()).toBeNull();
  });

  it("builds a groq model when configured with GROQ_API_KEY", () => {
    setEnv({ SHOPMATE_AI_PROVIDER: "groq", GROQ_API_KEY: "test-key" });
    expect(isAIConfigured()).toBe(true);
    const model = resolveChatModel();
    expect(model).not.toBeNull();
    expect((model as { provider?: string }).provider).toContain("groq");
    expect((model as { modelId?: string }).modelId).toBe("openai/gpt-oss-120b");
  });

  it("treats a whitespace-only Groq key as unconfigured", () => {
    setEnv({ SHOPMATE_AI_PROVIDER: "groq", GROQ_API_KEY: "   " });
    expect(isAIConfigured()).toBe(false);
    expect(resolveChatModel()).toBeNull();
  });

  it("configures Cerebras when CEREBRAS_API_KEY is provided", () => {
    setEnv({ CEREBRAS_API_KEY: "cerebras-key-123" });
    expect(isProviderConfigured("cerebras")).toBe(true);
    const candidates = getConfiguredProviders();
    expect(candidates.some((c) => c.name === "cerebras")).toBe(true);
    const cerebrasCandidate = candidates.find((c) => c.name === "cerebras")!;
    expect(cerebrasCandidate.modelId).toBe("llama-3.3-70b");
    const model = cerebrasCandidate.createModel();
    expect(model).toBeDefined();
  });

  it("configures OpenRouter when OPENROUTER_API_KEY is provided", () => {
    setEnv({ OPENROUTER_API_KEY: "openrouter-key-123" });
    expect(isProviderConfigured("openrouter")).toBe(true);
    const candidates = getConfiguredProviders();
    expect(candidates.some((c) => c.name === "openrouter")).toBe(true);
    const orCandidate = candidates.find((c) => c.name === "openrouter")!;
    expect(orCandidate.modelId).toBe("openrouter/free");
  });

  it("resolves multi-provider fallback order according to default priority", () => {
    setEnv({
      GOOGLE_GENERATIVE_AI_API_KEY: "gemini-key",
      CEREBRAS_API_KEY: "cerebras-key",
      GROQ_API_KEY: "groq-key",
      OPENROUTER_API_KEY: "openrouter-key",
    });
    const candidates = getConfiguredProviders();
    expect(candidates.map((c) => c.name)).toEqual([
      "google",
      "cerebras",
      "groq",
      "openrouter",
    ]);
  });

  it("skips unconfigured providers in the fallback chain", () => {
    setEnv({
      // No Gemini or Cerebras key
      GROQ_API_KEY: "groq-key",
      OPENROUTER_API_KEY: "openrouter-key",
    });
    const candidates = getConfiguredProviders();
    expect(candidates.map((c) => c.name)).toEqual(["groq", "openrouter"]);
  });

  it("honors custom provider ordering via SHOPMATE_AI_PROVIDERS", () => {
    setEnv({
      GOOGLE_GENERATIVE_AI_API_KEY: "gemini-key",
      CEREBRAS_API_KEY: "cerebras-key",
      GROQ_API_KEY: "groq-key",
      SHOPMATE_AI_PROVIDERS: "groq,cerebras,google",
    });
    expect(getProviderPriority()).toEqual(["groq", "cerebras", "google"]);
    const candidates = getConfiguredProviders();
    expect(candidates.map((c) => c.name)).toEqual(["groq", "cerebras", "google"]);
  });
});
