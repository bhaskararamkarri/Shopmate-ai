/**
 * ShopMate AI — money helpers (Phase 6B).
 *
 * All payment amounts are integer cents inside the application and database.
 * PayPal's API uses a canonical decimal string with exactly two fraction
 * digits, which is the only format this module produces or accepts.
 */

/** Formats integer cents as a canonical USD decimal string. */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("Amount must be a non-negative safe integer in cents.");
  }
  return (cents / 100).toFixed(2);
}

/**
 * Parses PayPal's `value` string into integer cents.
 * Rejects signs, exponents, commas, more than two fraction digits, and
 * amounts that cannot be represented safely.
 */
export function parseUsdToCents(value: string): number | null {
  if (!/^\d{1,9}\.\d{2}$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** PayPal sandbox demo ceiling. */
export const MAX_DEMO_TOTAL_CENTS = 500 * 100;
