import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getProviderName,
  isAIConfigured,
  resolveChatModel,
  resolveModelId,
} from "@/lib/agent/provider";

function setEnv(overrides: Record<string, string | undefined>) {
  const keys = [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "SHOPMATE_AI_PROVIDER",
    "SHOPMATE_AI_MODEL",
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

  it("switches to ollama when explicitly selected", () => {
    setEnv({ SHOPMATE_AI_PROVIDER: "ollama" });
    expect(getProviderName()).toBe("ollama");
    // Ollama needs no API key: configured by provider choice alone.
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
});
