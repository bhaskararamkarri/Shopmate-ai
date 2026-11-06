/**
 * ShopMate AI — server-managed guest session identity (Milestone 1).
 *
 * Implements cryptographically secure, server-managed guest session ownership.
 * A 256-bit random session identifier is generated on the server and stored in
 * a signed, HttpOnly, SameSite=Lax cookie validated against SHOPMATE_GUEST_SESSION_SECRET.
 *
 * The raw session identifier never reaches client JavaScript and is never
 * stored in the database. Instead, database payment records store a SHA-256
 * hash of the session identifier (`guest_owner_hash`).
 *
 * Signed Cookie Format:
 *   `<sessionId>.<createdAtMs>.<expiresAtMs>.<signature>`
 *   Where:
 *     - sessionId is 64 hex characters (256-bit cryptographically secure entropy)
 *     - createdAtMs is integer epoch milliseconds
 *     - expiresAtMs is integer epoch milliseconds
 *     - signature is HMAC-SHA256(secret, `${sessionId}.${createdAtMs}.${expiresAtMs}`) (64 hex characters)
 *
 * Security Invariants:
 *   - "server-only" module guard prevents client bundle leakage
 *   - Fails closed with HTTP 503 / GuestSessionConfigError if secret is missing or empty
 *   - Constant-time verification with crypto.timingSafeEqual prevents timing attacks
 *   - Authenticate-before-processing: signature is checked before trusting timestamps
 *   - Expiry check: Date.now() <= expiresAtMs
 *   - Cookie flags: HttpOnly, SameSite=Lax, Path=/, Secure in production
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Hard guard: server-only code must fail loudly if imported in a client bundle.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/payments/guest-session is server-only; do not import it from client code",
  );
}

export const GUEST_SESSION_COOKIE_NAME = "shopmate_guest_session";

/** Session token TTL: 24 hours. */
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Allowable clock drift for future-dated timestamps: 1 minute. */
const CLOCK_DRIFT_ALLOWANCE_MS = 60 * 1000;

/** Regex pattern for 4-part signed guest session cookies. */
const COOKIE_4PART_PATTERN =
  /^[0-9a-f]{64}\.\d{10,16}\.\d{10,16}\.[0-9a-f]{64}$/;

/** Typed error for unconfigured or invalid guest session secret. */
export class GuestSessionConfigError extends Error {
  readonly code = "session_secret_missing" as const;
  readonly status = 503 as const;

  constructor(
    message = "SHOPMATE_GUEST_SESSION_SECRET is required but not configured",
  ) {
    super(message);
    this.name = "GuestSessionConfigError";
  }
}

export interface VerifiedGuestSession {
  sessionId: string;
  guestOwnerHash: string; // 64 hex characters (SHA-256)
}

export interface GuestSession {
  /** Session identifier (32 or 64 hex characters). */
  id: string;
  /** 64-hex character SHA-256 hash stored in database payment records. */
  ownerHash: string;
}

export type ParsedGuestSession =
  | { valid: true; sessionId: string; ownerHash: string; issuedAtMs: number }
  | {
      valid: false;
      reason:
        | "malformed"
        | "bad_signature"
        | "expired"
        | "future_timestamp"
        | "unconfigured";
    };

/**
 * Resolves the server-only secret used for guest session HMAC signatures.
 * Fails closed if SHOPMATE_GUEST_SESSION_SECRET is missing or empty.
 */
export function getGuestSessionSecret(): string {
  const configured = process.env.SHOPMATE_GUEST_SESSION_SECRET?.trim();
  if (configured) {
    if (process.env.NODE_ENV === "production" && configured.length < 32) {
      throw new GuestSessionConfigError(
        "SHOPMATE_GUEST_SESSION_SECRET must be at least 32 characters in production.",
      );
    }
    return configured;
  }

  throw new GuestSessionConfigError(
    "SHOPMATE_GUEST_SESSION_SECRET is required but not configured.",
  );
}

/** Checks whether the guest session secret is properly configured without throwing. */
export function isGuestSessionConfigured(): boolean {
  try {
    getGuestSessionSecret();
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic one-way SHA-256 hash of a guest session ID for storage and lookups.
 * Plaintext session IDs are never stored in the database.
 */
export function hashGuestSession(sessionId: string): string {
  if (!sessionId || typeof sessionId !== "string") {
    throw new TypeError("sessionId must be a non-empty string");
  }
  return createHash("sha256")
    .update(sessionId, "utf8")
    .digest("hex")
    .toLowerCase();
}

/**
 * Generates a signed guest session cookie with 256-bit entropy.
 * Format: `<sessionId>.<createdAtMs>.<expiresAtMs>.<signature>`
 */
export function createGuestSessionCookie(
  ttlMs: number = GUEST_SESSION_TTL_MS,
  options?: { sessionId?: string; nowMs?: number },
): {
  cookieValue: string;
  session: { sessionId: string; createdAtMs: number; expiresAtMs: number };
} {
  const secret = getGuestSessionSecret();
  const sessionId = options?.sessionId ?? randomBytes(32).toString("hex");
  const createdAtMs = options?.nowMs ?? Date.now();
  const expiresAtMs = createdAtMs + ttlMs;

  const payload = `${sessionId}.${createdAtMs}.${expiresAtMs}`;
  const signature = createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
  const cookieValue = `${payload}.${signature}`;

  return {
    cookieValue,
    session: {
      sessionId,
      createdAtMs,
      expiresAtMs,
    },
  };
}

/**
 * Validates a guest session cookie string.
 * Enforces constant-time HMAC comparison and expiration checks.
 */
export function verifyGuestSessionCookie(
  cookieValue: string | undefined | null,
  nowMs: number = Date.now(),
):
  | { ok: true; session: VerifiedGuestSession }
  | { ok: false; error: string; status: number } {
  let secret: string;
  try {
    secret = getGuestSessionSecret();
  } catch {
    return { ok: false, error: "session_secret_missing", status: 503 };
  }

  if (
    !cookieValue ||
    typeof cookieValue !== "string" ||
    cookieValue.trim() === ""
  ) {
    return { ok: false, error: "session_missing", status: 401 };
  }

  const trimmed = cookieValue.trim();

  if (!COOKIE_4PART_PATTERN.test(trimmed)) {
    return { ok: false, error: "session_malformed", status: 401 };
  }

  const parts = trimmed.split(".");
  const sessionId = parts[0]!;
  const createdAtMs = Number(parts[1]);
  const expiresAtMs = Number(parts[2]);
  const signature = parts[3]!;

  if (
    !Number.isSafeInteger(createdAtMs) ||
    !Number.isSafeInteger(expiresAtMs) ||
    createdAtMs <= 0 ||
    expiresAtMs <= 0 ||
    createdAtMs > expiresAtMs
  ) {
    return { ok: false, error: "session_malformed", status: 401 };
  }

  // Future timestamp sanity check with clock drift allowance
  if (createdAtMs > nowMs + CLOCK_DRIFT_ALLOWANCE_MS) {
    return { ok: false, error: "session_malformed", status: 401 };
  }

  // Authenticate-before-processing: verify HMAC signature in constant time
  const payload = `${sessionId}.${createdAtMs}.${expiresAtMs}`;
  const expectedSigHex = createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  const actualSigBuf = Buffer.from(signature, "hex");
  const expectedSigBuf = Buffer.from(expectedSigHex, "hex");

  if (
    actualSigBuf.length !== expectedSigBuf.length ||
    !timingSafeEqual(actualSigBuf, expectedSigBuf)
  ) {
    return { ok: false, error: "session_tampered", status: 401 };
  }

  // Check expiration
  if (nowMs > expiresAtMs) {
    return { ok: false, error: "session_expired", status: 401 };
  }

  return {
    ok: true,
    session: {
      sessionId,
      guestOwnerHash: hashGuestSession(sessionId),
    },
  };
}

/**
 * Standard cookie configuration for the guest session.
 * Always HttpOnly, SameSite=Lax, Path=/, and Secure in production.
 */
export function getGuestSessionCookieOptions(maxAgeSec = 86400): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** Parses cookie header string into key-value map. */
export function parseCookieHeader(
  header: string | null | undefined,
): Record<string, string> {
  if (!header || typeof header !== "string") return {};
  const cookies: Record<string, string> = {};
  const pairs = header.split(";");
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in cookies)) {
      cookies[key] =
        val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val;
    }
  }
  return cookies;
}

/**
 * Extracts the guest session cookie value from various request sources:
 * standard Request, Headers, NextRequest, or a raw cookie header string.
 */
export function extractGuestSessionCookie(
  source:
    | Request
    | Headers
    | {
        headers?:
          | Headers
          | Record<string, string | string[] | undefined>;
        cookies?: { get(name: string): { value?: string } | undefined };
      }
    | string
    | null
    | undefined,
): string | null {
  if (source == null) return null;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return null;
    if (trimmed.includes("=")) {
      return parseCookieHeader(trimmed)[GUEST_SESSION_COOKIE_NAME] ?? null;
    }
    return trimmed;
  }

  // NextRequest or cookies-enabled request object
  if (
    "cookies" in source &&
    source.cookies &&
    typeof source.cookies.get === "function"
  ) {
    const fromCookie = source.cookies.get(GUEST_SESSION_COOKIE_NAME);
    if (fromCookie?.value) return fromCookie.value;
  }

  // Request or Headers container
  let headers:
    | Headers
    | Record<string, string | string[] | undefined>
    | undefined;
  if ("headers" in source && source.headers) {
    headers = source.headers;
  } else if ("get" in source && typeof source.get === "function") {
    headers = source as Headers;
  }

  if (!headers) return null;

  let cookieHeader: string | null = null;
  if (typeof (headers as Headers).get === "function") {
    cookieHeader = (headers as Headers).get("cookie");
  } else {
    const rec = headers as Record<string, string | string[] | undefined>;
    const val = rec["cookie"] ?? rec["Cookie"];
    cookieHeader = Array.isArray(val) ? val.join("; ") : (val ?? null);
  }

  if (!cookieHeader) return null;
  return parseCookieHeader(cookieHeader)[GUEST_SESSION_COOKIE_NAME] ?? null;
}

/**
 * Validates a guest session extracted directly from a Request or header source.
 */
export function verifyGuestSessionFromRequest(
  source:
    | Request
    | Headers
    | {
        headers?:
          | Headers
          | Record<string, string | string[] | undefined>;
      }
    | string
    | null
    | undefined,
  nowMs?: number,
):
  | { ok: true; session: VerifiedGuestSession }
  | { ok: false; error: string; status: number } {
  const cookieValue = extractGuestSessionCookie(source);
  if (!cookieValue) {
    return { ok: false, error: "session_missing", status: 401 };
  }
  return verifyGuestSessionCookie(cookieValue, nowMs);
}

/**
 * Formats the `Set-Cookie` header for a guest session token.
 */
export function serializeGuestSessionCookie(
  token: string,
  secure = process.env.NODE_ENV === "production",
): string {
  const maxAge = Math.floor(GUEST_SESSION_TTL_MS / 1000);
  const parts = [
    `${GUEST_SESSION_COOKIE_NAME}=${token}`,
    `Max-Age=${maxAge}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Extracts a cookie value by name from a `Cookie` header string. */
export function extractCookie(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  return parseCookieHeader(cookieHeader)[name] ?? null;
}

/**
 * Generates a signed 3-part guest session token (Phase 6C compatibility).
 * Format: `<sessionId>.<issuedAtMs>.<signature>`
 */
export function createGuestSessionToken(options?: {
  nowMs?: number;
  sessionId?: string;
}): string {
  const secret = getGuestSessionSecret();
  const sessionId = options?.sessionId ?? randomBytes(16).toString("hex");
  const issuedAtMs = options?.nowMs ?? Date.now();
  const message = `${sessionId}.${issuedAtMs}`;

  const signature = createHmac("sha256", secret)
    .update(message, "utf8")
    .digest("base64url");

  return `${message}.${signature}`;
}

/**
 * Validates and parses a guest session token (Phase 6C / 4-part compatibility).
 */
export function parseGuestSessionToken(
  token: string,
  nowMs?: number,
): ParsedGuestSession {
  let secret: string;
  try {
    secret = getGuestSessionSecret();
  } catch {
    return { valid: false, reason: "unconfigured" };
  }

  if (!token || typeof token !== "string") {
    return { valid: false, reason: "malformed" };
  }

  const parts = token.split(".");

  // 4-part modern cookie format support
  if (parts.length === 4) {
    const verified = verifyGuestSessionCookie(token, nowMs);
    if (!verified.ok) {
      if (verified.error === "session_expired") {
        return { valid: false, reason: "expired" };
      }
      if (verified.error === "session_secret_missing") {
        return { valid: false, reason: "unconfigured" };
      }
      if (verified.error === "session_tampered") {
        return { valid: false, reason: "bad_signature" };
      }
      return { valid: false, reason: "malformed" };
    }

    return {
      valid: true,
      sessionId: verified.session.sessionId,
      ownerHash: verified.session.guestOwnerHash,
      issuedAtMs: Number(parts[1]),
    };
  }

  if (parts.length !== 3) {
    return { valid: false, reason: "malformed" };
  }

  const [sessionId, tsStr, signature] = parts;
  if (!sessionId || !tsStr || !signature) {
    return { valid: false, reason: "malformed" };
  }

  const SESSION_ID_PATTERN = /^[0-9a-f]{32,64}$/;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { valid: false, reason: "malformed" };
  }

  const issuedAtMs = Number(tsStr);
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs <= 0) {
    return { valid: false, reason: "malformed" };
  }

  const current = nowMs ?? Date.now();

  // Check clock drift allowance for future timestamps.
  if (issuedAtMs > current + CLOCK_DRIFT_ALLOWANCE_MS) {
    return { valid: false, reason: "future_timestamp" };
  }

  // Check expiry.
  if (current - issuedAtMs > GUEST_SESSION_TTL_MS) {
    return { valid: false, reason: "expired" };
  }

  // Recompute signature and verify with constant-time equality.
  const message = `${sessionId}.${issuedAtMs}`;
  const expectedSig = createHmac("sha256", secret)
    .update(message, "utf8")
    .digest("base64url");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "bad_signature" };
  }

  return {
    valid: true,
    sessionId,
    ownerHash: hashGuestSession(sessionId),
    issuedAtMs,
  };
}

/**
 * Retrieves the verified guest session from request cookies, or issues a fresh
 * one if missing, expired, or invalid.
 */
export function getOrIssueGuestSession(request: Request): {
  session: GuestSession;
  setCookie?: string;
  isNew: boolean;
} {
  const cookieHeader = request.headers.get("cookie");
  const rawCookie = extractCookie(cookieHeader, GUEST_SESSION_COOKIE_NAME);

  if (rawCookie) {
    const parsed = parseGuestSessionToken(rawCookie);
    if (parsed.valid) {
      return {
        session: { id: parsed.sessionId, ownerHash: parsed.ownerHash },
        isNew: false,
      };
    }
  }

  // Issue a fresh guest session token and Set-Cookie header.
  const created = createGuestSessionCookie();
  return {
    session: {
      id: created.session.sessionId,
      ownerHash: hashGuestSession(created.session.sessionId),
    },
    setCookie: serializeGuestSessionCookie(created.cookieValue),
    isNew: true,
  };
}

/**
 * Strictly requires an existing, valid guest session from request cookies.
 * Does NOT auto-issue a fresh session.
 */
export function requireGuestSession(
  request: Request,
):
  | { ok: true; session: GuestSession }
  | { ok: false; error: "missing" | "invalid" | "expired" | "unconfigured" } {
  if (!isGuestSessionConfigured()) {
    return { ok: false, error: "unconfigured" };
  }

  const cookieHeader = request.headers.get("cookie");
  const rawCookie = extractCookie(cookieHeader, GUEST_SESSION_COOKIE_NAME);

  if (!rawCookie) {
    return { ok: false, error: "missing" };
  }

  const parsed = parseGuestSessionToken(rawCookie);
  if (parsed.valid) {
    return {
      ok: true,
      session: { id: parsed.sessionId, ownerHash: parsed.ownerHash },
    };
  }

  if (parsed.reason === "expired") {
    return { ok: false, error: "expired" };
  }
  if (parsed.reason === "unconfigured") {
    return { ok: false, error: "unconfigured" };
  }
  return { ok: false, error: "invalid" };
}
