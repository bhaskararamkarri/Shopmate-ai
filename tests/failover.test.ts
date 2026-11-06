import { describe, expect, it, vi } from "vitest";
import {
  AllProvidersFailedError,
  executeWithFailover,
  extractErrorStatus,
  extractRetryAfterSec,
  isFailoverEligibleError,
} from "@/lib/agent/failover";
import type { ProviderCandidate } from "@/lib/agent/provider";
import type { LanguageModel } from "ai";

interface HttpError extends Error {
  statusCode?: number;
}

function statusError(message: string, statusCode: number): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  return err;
}

function makeCandidate(
  name: "google" | "cerebras" | "groq" | "openrouter",
  modelId: string,
): ProviderCandidate {
  return {
    name,
    modelId,
    createModel: () => ({} as unknown as LanguageModel),
    timeoutMs: 15_000,
  };
}

describe("failover error classification", () => {
  it("identifies HTTP 429 as failover-eligible", () => {
    expect(isFailoverEligibleError({ statusCode: 429 })).toBe(true);
    expect(isFailoverEligibleError({ status: 429 })).toBe(true);
    expect(isFailoverEligibleError({ response: { status: 429 } })).toBe(true);
  });

  it("identifies HTTP 5xx errors as failover-eligible", () => {
    expect(isFailoverEligibleError({ statusCode: 500 })).toBe(true);
    expect(isFailoverEligibleError({ statusCode: 502 })).toBe(true);
    expect(isFailoverEligibleError({ statusCode: 503 })).toBe(true);
    expect(isFailoverEligibleError({ statusCode: 504 })).toBe(true);
  });

  it("identifies timeouts and aborts as failover-eligible", () => {
    const timeoutErr = new Error("Request timed out");
    timeoutErr.name = "TimeoutError";
    expect(isFailoverEligibleError(timeoutErr)).toBe(true);

    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    expect(isFailoverEligibleError(abortErr)).toBe(true);
  });

  it("identifies quota and high-demand messages as failover-eligible", () => {
    expect(
      isFailoverEligibleError(
        new Error(
          "This model is currently experiencing high demand. Please try again later.",
        ),
      ),
    ).toBe(true);
    expect(
      isFailoverEligibleError(
        new Error(
          "You exceeded your current quota, please check your plan and billing details.",
        ),
      ),
    ).toBe(true);
    expect(
      isFailoverEligibleError(
        new Error(
          "Rate limit reached for model openai/gpt-oss-120b in organization",
        ),
      ),
    ).toBe(true);
  });

  it("rejects non-transient errors (does not failover)", () => {
    expect(isFailoverEligibleError({ statusCode: 400 })).toBe(false);
    expect(
      isFailoverEligibleError(new TypeError("Cannot read properties of undefined")),
    ).toBe(false);
    expect(
      isFailoverEligibleError(new Error("Invalid parameter value for search")),
    ).toBe(false);
  });

  it("extracts status and retry-after correctly", () => {
    const errWithHeader = {
      statusCode: 429,
      headers: { "retry-after": "12" },
    };
    expect(extractErrorStatus(errWithHeader)).toBe(429);
    expect(extractRetryAfterSec(errWithHeader)).toBe(12);
  });
});

describe("executeWithFailover", () => {
  it("succeeds on primary provider without calling secondary", async () => {
    const candidates = [
      makeCandidate("google", "gemini-3.8-flash"),
      makeCandidate("cerebras", "llama-3.3-70b"),
    ];

    const runner = vi.fn().mockImplementation(async (c: ProviderCandidate) => {
      return `result from ${c.name}`;
    });

    const output = await executeWithFailover(candidates, runner);

    expect(output.result).toBe("result from google");
    expect(output.provider).toBe("google");
    expect(output.model).toBe("gemini-3.8-flash");
    expect(output.attempts.length).toBe(1);
    expect(output.attempts[0].succeeded).toBe(true);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("fails over from google (429) to cerebras", async () => {
    const candidates = [
      makeCandidate("google", "gemini-3.8-flash"),
      makeCandidate("cerebras", "llama-3.3-70b"),
    ];

    const runner = vi.fn().mockImplementation(async (c: ProviderCandidate) => {
      if (c.name === "google") {
        throw statusError("Rate limit exceeded", 429);
      }
      return `result from ${c.name}`;
    });

    const output = await executeWithFailover(candidates, runner);

    expect(output.result).toBe("result from cerebras");
    expect(output.provider).toBe("cerebras");
    expect(output.model).toBe("llama-3.3-70b");
    expect(output.attempts.length).toBe(2);
    expect(output.attempts[0].provider).toBe("google");
    expect(output.attempts[0].succeeded).toBe(false);
    expect(output.attempts[0].status).toBe(429);
    expect(output.attempts[1].provider).toBe("cerebras");
    expect(output.attempts[1].succeeded).toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("fails over across three providers: google (503) -> cerebras (timeout) -> groq", async () => {
    const candidates = [
      makeCandidate("google", "gemini-3.8-flash"),
      makeCandidate("cerebras", "llama-3.3-70b"),
      makeCandidate("groq", "openai/gpt-oss-120b"),
    ];

    const runner = vi.fn().mockImplementation(async (c: ProviderCandidate) => {
      if (c.name === "google") {
        throw statusError("Service Unavailable", 503);
      }
      if (c.name === "cerebras") {
        const err = new Error("Inference timed out");
        err.name = "TimeoutError";
        throw err;
      }
      return `result from ${c.name}`;
    });

    const output = await executeWithFailover(candidates, runner);

    expect(output.result).toBe("result from groq");
    expect(output.provider).toBe("groq");
    expect(output.attempts.length).toBe(3);
    expect(output.attempts[0].provider).toBe("google");
    expect(output.attempts[1].provider).toBe("cerebras");
    expect(output.attempts[2].provider).toBe("groq");
  });

  it("throws AllProvidersFailedError when all configured providers fail", async () => {
    const candidates = [
      makeCandidate("google", "gemini-3.8-flash"),
      makeCandidate("groq", "openai/gpt-oss-120b"),
    ];

    const runner = vi.fn().mockImplementation(async (c: ProviderCandidate) => {
      throw statusError(`${c.name} outage`, 500);
    });

    await expect(executeWithFailover(candidates, runner)).rejects.toThrow(
      AllProvidersFailedError,
    );
  });

  it("aborts failover immediately on non-failover errors", async () => {
    const candidates = [
      makeCandidate("google", "gemini-3.8-flash"),
      makeCandidate("groq", "openai/gpt-oss-120b"),
    ];

    const runner = vi.fn().mockImplementation(async () => {
      throw new TypeError("Critical logic bug");
    });

    await expect(executeWithFailover(candidates, runner)).rejects.toThrow(
      TypeError,
    );
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
