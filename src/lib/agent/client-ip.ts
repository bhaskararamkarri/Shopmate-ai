/**
 * ShopMate AI — client identity for rate limiting (Phase 4).
 *
 * `x-real-ip` is preferred because platform proxies (e.g. Vercel) set it
 * authoritatively. `x-forwarded-for` is only a fallback: its leftmost entry
 * is client-spoofable on deployments without a proxy that overwrites it, so
 * a direct-to-Node deployment must not treat it as a security boundary.
 * With neither header present every caller shares one bucket — fail-closed
 * for credit protection rather than fail-open.
 */

/** Resolves the best-available client identity from request headers. */
export function resolveClientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  return "unknown";
}
