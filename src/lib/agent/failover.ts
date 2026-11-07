/**
 * ShopMate AI — Multi-Provider Failover & Reliability Engine (Phase 8).
 *
 * Implements resilient provider execution with automatic failover:
 * 1. Google Gemini API (`google`) — primary
 * 2. Cerebras Inference (`cerebras`) — secondary high-speed fallback
 * 3. Groq (`groq`) — tertiary fallback
 * 4. OpenRouter (`openrouter`) — optional final fallback
 * 5. Ollama (`ollama`) — local development fallback
 *
 * On transient failures (HTTP 429, temporary 5xx, timeouts, network disconnects),
 * the failover runner automatically tries the next configured provider in priority order.
 * Application errors, non-transient bugs, and user validation failures do not trigger fallback.
 */

import type { AIProviderName, ProviderCandidate } from "./provider";

export interface ProviderAttemptRecord {
  provider: AIProviderName;
  model: string;
  error?: string;
  errorName?: string;
  status?: number;
  latencyMs: number;
  succeeded: boolean;
  retryAfterSec?: number;
}

export interface FailoverExecutionResult<T> {
  result: T;
  provider: AIProviderName;
  model: string;
  latencyMs: number;
  attempts: ProviderAttemptRecord[];
}

/** Typed failure thrown when all candidate AI providers fail to complete a turn. */
export class AllProvidersFailedError extends Error {
  constructor(
    message: string,
    readonly lastStatus?: number,
    readonly attempts: ProviderAttemptRecord[] = [],
  ) {
    super(message);
    this.name = "AllProvidersFailedError";
  }
}

/**
 * Extracts numeric HTTP status code from arbitrary provider error structures.
 * Protected against circular references with a recursion depth limit.
 */
export function extractErrorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || !error || typeof error !== "object") return undefined;
  const direct = (error as { statusCode?: unknown; status?: unknown }).statusCode ??
    (error as { status?: unknown }).status;
  if (typeof direct === "number") return direct;

  const nested = (error as { response?: { status?: unknown } }).response?.status;
  if (typeof nested === "number") return nested;

  const lastError = (error as { lastError?: unknown }).lastError;
  if (lastError && typeof lastError === "object") {
    const s = extractErrorStatus(lastError, depth + 1);
    if (typeof s === "number") return s;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    return extractErrorStatus(cause, depth + 1);
  }

  return undefined;
}

/**
 * Extracts Retry-After delay (in seconds) if present on the error or response headers.
 * Protected against circular references with a recursion depth limit.
 */
export function extractRetryAfterSec(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || !error || typeof error !== "object") return undefined;
  const headers =
    (error as { headers?: Record<string, string> }).headers ??
    (error as { response?: { headers?: Record<string, string> } }).response?.headers;

  if (headers && typeof headers === "object") {
    const raw = headers["retry-after"] ?? headers["Retry-After"];
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  const lastError = (error as { lastError?: unknown }).lastError;
  if (lastError && typeof lastError === "object") {
    const r = extractRetryAfterSec(lastError, depth + 1);
    if (typeof r === "number") return r;
  }

  return undefined;
}

/**
 * Determines whether an error is transient and eligible for automatic failover.
 * Returns true for 429 (rate limits/quotas), 5xx (server errors), 408 (timeout),
 * aborts/timeouts, and known transient network issues.
 * Returns false for ordinary validation errors, syntax errors, or unrecoverable client errors.
 * Protected against circular references with a recursion depth limit.
 */
export function isFailoverEligibleError(error: unknown, depth = 0): boolean {
  if (depth > 5 || !error) return false;

  const status = extractErrorStatus(error, depth);
  if (typeof status === "number") {
    // 401/403: Provider credential failure / unauthorized (fail over to next provider)
    if (status === 401 || status === 403) return true;
    // 404: Model not found or deprecated on this provider
    if (status === 404) return true;
    // 429: Rate-limit or quota exceeded (Google, Cerebras, Groq, OpenRouter)
    if (status === 429) return true;
    // 5xx: Bad Gateway, Service Unavailable, Gateway Timeout, Internal Error
    if (status >= 500 && status <= 599) return true;
    // 408: Request Timeout
    if (status === 408) return true;
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return true;

  const lastError = (error as { lastError?: unknown }).lastError;
  if (lastError && isFailoverEligibleError(lastError, depth + 1)) return true;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Pattern match known transient / quota failure messages across AI SDK providers
  const transientPatterns = [
    "high demand",
    "quota",
    "exceeded",
    "rate limit",
    "rate_limited",
    "too many requests",
    "resource has been exhausted",
    "service unavailable",
    "temporarily unavailable",
    "overloaded",
    "timed out",
    "timeout",
    "econnreset",
    "etimedout",
    "fetch failed",
    "network error",
    "connection refused",
    "socket hang up",
    "gateway timeout",
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Executes a runner function with sequential failover across provided candidate models.
 * Automatically tries the next candidate upon encountering a failover-eligible error.
 * Bounded by candidate list length and individual candidate timeouts.
 */
export async function executeWithFailover<T>(
  candidates: ProviderCandidate[],
  runner: (candidate: ProviderCandidate) => Promise<T>,
): Promise<FailoverExecutionResult<T>> {
  if (candidates.length === 0) {
    throw new AllProvidersFailedError("No AI providers configured");
  }

  const attempts: ProviderAttemptRecord[] = [];
  let lastStatus: number | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const startTime = Date.now();

    try {
      const result = await runner(candidate);
      const latencyMs = Date.now() - startTime;

      attempts.push({
        provider: candidate.name,
        model: candidate.modelId,
        latencyMs,
        succeeded: true,
      });

      console.log(
        `[agent] completed turn using provider=${candidate.name} model=${candidate.modelId} latency=${latencyMs}ms (attempt ${i + 1}/${candidates.length})`,
      );

      return {
        result,
        provider: candidate.name,
        model: candidate.modelId,
        latencyMs,
        attempts,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const status = extractErrorStatus(error);
      const retryAfterSec = extractRetryAfterSec(error);
      if (typeof status === "number") lastStatus = status;

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : undefined;

      attempts.push({
        provider: candidate.name,
        model: candidate.modelId,
        error: errorMessage,
        errorName,
        status,
        latencyMs,
        succeeded: false,
        retryAfterSec,
      });

      const eligible = isFailoverEligibleError(error);

      if (!eligible) {
        console.error(
          `[agent] provider=${candidate.name} encountered non-failover error (${errorMessage}, latency=${latencyMs}ms). Aborting chain.`,
        );
        throw error;
      }

      console.warn(
        `[agent] provider=${candidate.name} failed (${errorMessage}, status=${status ?? "none"}, latency=${latencyMs}ms). ` +
          (i + 1 < candidates.length
            ? `Failing over to ${candidates[i + 1].name}...`
            : "No further providers in failover chain."),
      );
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}(${a.status ?? "error"}, ${a.latencyMs}ms)`)
    .join(" -> ");

  throw new AllProvidersFailedError(
    `All AI providers failed: [${summary}]`,
    lastStatus,
    attempts,
  );
}
