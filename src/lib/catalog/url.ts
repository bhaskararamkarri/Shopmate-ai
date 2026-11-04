/**
 * ShopMate AI — URL safety helpers (pure, safe for client and server).
 *
 * External product data is untrusted: any URL that ends up in an href or an
 * image source must parse as an absolute http(s) URL first. data:, javascript:,
 * and other schemes are rejected outright.
 */
export function isSafeHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" || url.protocol === "http:";
}
