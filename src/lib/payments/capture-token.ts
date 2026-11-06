/**
 * ShopMate AI — deterministic capture-token capability (Phase 6B).
 *
 * The browser receives an opaque capability when it creates an order. The
 * database stores only a SHA-256 hash of that capability, so a database leak
 * does not hand out capture rights.
 *
 * The token is derived deterministically from the PayPal order id and the
 * server-generated purchase-unit reference id. That lets a create-order replay
 * return the same capability without ever storing it in plaintext. Verification
 * always hashes the supplied token and compares in constant time.
 *
 * Key material precedence (server-only):
 *   CAPTURE_TOKEN_SECRET
 *   SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL
 *   per-process ephemeral key (tests / local development only)
 *
 * In production, a stable secret (ideally CAPTURE_TOKEN_SECRET) must be set so
 * tokens remain stable across process restarts and database password changes.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Hard guard: a client bundle that somehow imports this module must fail loudly.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/payments/capture-token is server-only; do not import it from client code",
  );
}

/** 64 hex characters; also accepted by the existing capture-token pattern. */
const CAPTURE_TOKEN_PATTERN = /^[A-Za-z0-9-]{16,128}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

let ephemeralKey: string | null = null;

function keyMaterial(): string {
  const candidates = [
    process.env.CAPTURE_TOKEN_SECRET,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.DATABASE_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  if (!ephemeralKey) {
    ephemeralKey = randomBytes(32).toString("hex");
  }
  return ephemeralKey;
}

/** True when the value is syntactically usable as a capture capability. */
export function isValidCaptureToken(value: string): boolean {
  return CAPTURE_TOKEN_PATTERN.test(value);
}

/** Deterministically derives the capability for one server-created order. */
export function deriveCaptureToken(
  paypalOrderId: string,
  referenceId: string,
): string {
  return createHmac("sha256", keyMaterial())
    .update(`shopmate-capture-v1\n${paypalOrderId}\n${referenceId}`, "utf8")
    .digest("hex");
}

/** SHA-256 of a token, as stored in `payment_orders.capture_token_hash`. */
export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison of a supplied capability against the stored hash.
 * Malformed stored values fail closed.
 */
export function captureTokenMatches(
  storedHash: string,
  suppliedToken: string,
): boolean {
  if (!HASH_PATTERN.test(storedHash)) return false;
  if (!isValidCaptureToken(suppliedToken)) return false;

  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashCaptureToken(suppliedToken), "hex");
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}
