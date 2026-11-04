/**
 * ShopMate AI — product search API (GET /api/products/search?q=...).
 *
 * Server-side catalog gateway:
 * - Validates and bounds the query before any provider call.
 * - Never exposes the Channel3 API key (all provider calls happen here).
 * - Applies a short-lived server cache that respects Channel3's caching terms.
 * - Degrades visibly: provider failures return labeled demo results plus a
 *   `fallback.reason`, never a silent substitution for live prices.
 * - Forwards a stable pseudonymous id as Channel3 `x-user-id` so buy links
 *   attribute clicks/sales to this session's user.
 */
import { NextRequest, NextResponse } from "next/server";
import { searchCatalog, CHANNEL3_MAX_LIMIT } from "@/lib/catalog/provider";

const USER_ID_COOKIE = "shopmate_uid";
const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 12;

/** Rejects control characters that have no business in a search query. */
function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (query.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_query",
        message: "Provide a non-empty ?q= search query.",
      },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY_LENGTH || hasControlChars(query)) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_query",
        message: `Query must be 1-${MAX_QUERY_LENGTH} characters with no control characters.`,
      },
      { status: 400 },
    );
  }

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.round(parsedLimit), 1), CHANNEL3_MAX_LIMIT)
    : DEFAULT_LIMIT;

  // Stable pseudonymous user attribution (Channel3 stamps it onto buy URLs).
  // Cache keys include it so one user's attribution never leaks into
  // another user's cached response.
  const existingUserId = request.cookies.get(USER_ID_COOKIE)?.value;
  const userId =
    existingUserId && existingUserId.length <= 128 && existingUserId.length > 0
      ? existingUserId
      : crypto.randomUUID();

  const outcome = await searchCatalog(query, { limit, userId });

  const response = NextResponse.json(
    {
      success: true,
      source: outcome.source,
      products: outcome.products,
      count: outcome.products.length,
      // Present only when live results degraded to labeled demo data.
      fallback: outcome.fallback,
    },
    { status: 200 },
  );

  // Freshness is owned by the server-side TTL cache; the browser must not
  // reuse a stale labeled (or unlabeled) response across modes.
  response.headers.set("Cache-Control", "no-store");
  if (!existingUserId) {
    response.cookies.set(USER_ID_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
