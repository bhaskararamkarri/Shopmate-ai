/**
 * Phase 6B — capture-token capability tests.
 *
 * The browser token must be deterministic for replay, but the database must
 * only ever hold its SHA-256 hash. No test here calls PayPal.
 */
import { describe, expect, it } from "vitest";
import {
  captureTokenMatches,
  deriveCaptureToken,
  hashCaptureToken,
  isValidCaptureToken,
} from "@/lib/payments/capture-token";

describe("capture token", () => {
  it("derives a deterministic, URL-safe capability per order", () => {
    const first = deriveCaptureToken("ORDER1234567890", "shopmate-demo-a");
    const second = deriveCaptureToken("ORDER1234567890", "shopmate-demo-a");
    const other = deriveCaptureToken("ORDER1234567890", "shopmate-demo-b");

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[A-Za-z0-9-]{16,128}$/);
    expect(isValidCaptureToken(first)).toBe(true);
  });

  it("stores only a 64-character SHA-256 hash", () => {
    const token = deriveCaptureToken("ORDER1234567890", "shopmate-demo-a");
    const hash = hashCaptureToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });

  it("verifies the right token in constant time and rejects others", () => {
    const token = deriveCaptureToken("ORDER1234567890", "shopmate-demo-a");
    const hash = hashCaptureToken(token);

    expect(captureTokenMatches(hash, token)).toBe(true);
    expect(captureTokenMatches(hash, `${token}0`)).toBe(false);
    expect(
      captureTokenMatches(
        hash,
        deriveCaptureToken("ORDER1234567890", "shopmate-demo-b"),
      ),
    ).toBe(false);
  });

  it("fails closed on a malformed stored hash or token", () => {
    expect(captureTokenMatches("not-a-hash", "a".repeat(32))).toBe(false);
    expect(captureTokenMatches("a".repeat(64), "short")).toBe(false);
  });
});
