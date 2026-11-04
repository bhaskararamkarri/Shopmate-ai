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

export const runtime = "nodejs";
export const maxDuration = 60;

/** Per-IP chat turns per minute. Conservative: each turn can spend credits. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const USER_ID_COOKIE = "shopmate_uid";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function failure(
  body: ChatApiFailure,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: NextRequest) {
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

  const ip = clientIp(request);
  const limit = checkRateLimit(ip, { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
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

  const userId =
    request.cookies.get(USER_ID_COOKIE)?.value || undefined;

  try {
    const result = await runAgentTurn({
      history: parsed.data.history,
      message: parsed.data.message,
      intent: parsed.data.intent,
      userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentTurnError) {
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
