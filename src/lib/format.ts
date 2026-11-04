/**
 * Formatting helpers shared across the demo UI.
 *
 * Display-only formatting: authoritative prices and totals are always
 * recalculated and validated server-side in later phases.
 */
export function formatMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Formats a bare integer with thousands separators (e.g. 2400 -> "2,400"). */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
