/**
 * ShopMate AI — chat agent endpoint (POST /api/chat).
 *
 * Server-side only: the model API key never leaves this process. The route
 * validates and bounds the request (message/history limits), rate-limits
 * per caller IP to protect both the model quota and Channel3 credits, then
 * runs one agent turn and returns the grounded payload.
 *
 * Errors are typed and mapped to HTTP status codes:
 * - 400 invalid_request  — body failed validation
 * - 429 rate_limited     — per-IP fixed window exhausted (Retry-After set)
 * - 502 ai_unavailable   — the model layer failed this turn
 * - 500 internal_error   — anything unexpected
 */
import { NextRequest, NextResponse } from "next/server";
import { ChatRequestSchema, type ChatApiFailure } from "@/lib/agent/chat-contract";
import { AgentTurnError, runAgentTurn } from "@/lib/agent/agent";
import { checkRateLimit } from "@/lib/agent/rate-limit";
import { resolveClientIp } from "@/lib/agent/client-ip";

export const maxDuration = 60;

/** Per-IP chat turns per minute. Conservative: each turn can spend credits.
 * SHOPMATE_CHAT_RATE_LIMIT overrides (tests/E2E raise it; clamped 1–1000). */
const RATE_LIMIT = Math.min(
  1000,
  Math.max(1, Number(process.env.SHOPMATE_CHAT_RATE_LIMIT ?? 10) || 10),
);
const RATE_WINDOW_MS = 60_000;

/** Hard cap on the request body: the largest valid chat request is ~35 KB. */
const MAX_BODY_BYTES = 64 * 1024;

const USER_ID_COOKIE = "shopmate_uid";

function failure(
  body: ChatApiFailure,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: NextRequest) {
  // Rate limit BEFORE reading the body: headers are available without
  // buffering the payload, so garbage floods are rejected cheaply. Invalid
  // requests consume budget too — that is the point.
  const limit = checkRateLimit(resolveClientIp(request.headers), {
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (!limit.allowed) {
    return failure(
      {
        success: false,
        error: "rate_limited",
        message: "Too many chat requests — slow down for a moment.",
        retryAfterSec: limit.retryAfterSec,
      },
      429,
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  // Bound the body before parsing it: route handlers have no default size
  // cap, so an unbounded JSON.parse is a cheap memory/CPU exhaustion vector.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return failure(
      {
        success: false,
        error: "invalid_request",
        message: "Request body too large.",
      },
      400,
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return failure(
      {
        success: false,
        error: "invalid_request",
        message: "Content-Type must be application/json.",
      },
      400,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return failure(
      { success: false, error: "invalid_request", message: "Body must be JSON." },
      400,
    );
  }

  const parsed = ChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return failure(
      {
        success: false,
        error: "invalid_request",
        message: parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
          .join("; "),
      },
      400,
    );
  }

  const userId =
    request.cookies.get(USER_ID_COOKIE)?.value || undefined;

  try {
    const result = await runAgentTurn({
      conversationId: parsed.data.conversationId,
      history: parsed.data.history,
      message: parsed.data.message,
      intent: parsed.data.intent,
      contextProductIds: parsed.data.contextProductIds,
      userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentTurnError) {
      // The client gets a generic message; the server keeps the sanitized
      // cause (message + upstream status, never request bodies or headers).
      console.error(
        "[/api/chat] agent turn failed:",
        typeof error.upstreamStatus === "number"
          ? `${error.message} (upstream HTTP ${error.upstreamStatus})`
          : error.message,
      );
      return failure(
        {
          success: false,
          error: "ai_unavailable",
          message: "The AI service could not complete this turn. Try again shortly.",
        },
        502,
      );
    }
    console.error("[/api/chat] unexpected error:", error);
    return failure(
      { success: false, error: "internal_error", message: "Unexpected server error." },
      500,
    );
  }
}
