/**
 * PayPal browser error diagnostics (Phase 5.4 hardening).
 *
 * PayPal's approval popup can fail before `onApprove` runs. The SDK error must
 * be logged with enough detail to support a PayPal debug_id investigation, but
 * never with credentials, tokens, cookies, full URLs, emails, or buyer details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePayPalError,
  reportPayPalCheckoutError,
} from "@/lib/checkout/paypal-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describePayPalError", () => {
  it("keeps a safe name, sanitized message, PayPal issue and debug id", () => {
    const diagnostic = describePayPalError({
      name: "PayPalError",
      message: "Things don't appear to be working at the moment.",
      details: [{ issue: "PAYMENT_DENIED", debug_id: "f719139b636c1" }],
    });

    expect(diagnostic).toEqual({
      name: "PayPalError",
      message: "Things don't appear to be working at the moment.",
      code: "PAYMENT_DENIED",
      debugId: "f719139b636c1",
    });
  });

  it("redacts tokens, cookies, full URLs, emails, cards and buyer fields", () => {
    const diagnostic = describePayPalError(
      new Error(
        "Authorization: Bearer A21AAJsecret access_token=secret-token " +
          "cookie=session=abc123 " +
          "https://www.sandbox.paypal.com/checkoutweb/genericError" +
          "?code=PAYMENT_DENIED&debug_id=f719139b636c1 " +
          "buyer@example.com card 4111 1111 1111 1111 " +
          'name="Jane Buyer" payer_id=QYR5Z8XDVJNXQ',
      ),
    );

    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("A21AAJsecret");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("session=abc123");
    expect(serialized).not.toContain("sandbox.paypal.com");
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("4111");
    expect(serialized).not.toContain("Jane Buyer");
    expect(serialized).not.toContain("QYR5Z8XDVJNXQ");
    expect(serialized).toContain("[redacted");
    expect(diagnostic.debugId).toBe("f719139b636c1");
  });

  it("redacts camelCase credential and buyer fields", () => {
    const diagnostic = describePayPalError(
      new Error(
        "accessToken=short123\nclientSecret=short456\n" +
          "payerId=ABC123\nemailAddress=buyer2@example.com\n" +
          "token: short789",
      ),
    );

    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("short123");
    expect(serialized).not.toContain("short456");
    expect(serialized).not.toContain("ABC123");
    expect(serialized).not.toContain("buyer2@example.com");
    expect(serialized).not.toContain("short789");
    expect(serialized).toContain("[redacted");
  });

  it("does not throw on circular or hostile error objects", () => {
    const error: Record<string, unknown> = {
      name: "PayPalError",
      message: "failed",
    };
    error.self = error;

    expect(() => describePayPalError(error)).not.toThrow();
    expect(describePayPalError(error).message).toBe("failed");
  });

  it("only accepts a debug id with the PayPal debug-id shape", () => {
    const diagnostic = describePayPalError({
      name: "Error",
      message: "failed",
      debug_id: "access_token=abcdef1234567890",
    });

    expect(diagnostic.debugId).toBeUndefined();
  });

  it("falls back safely when the error has no usable message", () => {
    const diagnostic = describePayPalError(null);

    expect(diagnostic.name).toBe("Error");
    expect(diagnostic.message.length).toBeGreaterThan(0);
    expect(diagnostic.message).toBe("PayPal reported an error.");
  });

  it("truncates long messages", () => {
    const diagnostic = describePayPalError(new Error("x".repeat(1000)));

    expect(diagnostic.message.length).toBeLessThanOrEqual(300);
  });

  it("includes an order id only when it has the PayPal order-id shape", () => {
    expect(
      describePayPalError(new Error("failed"), "7G3149096X211100R").orderId,
    ).toBe("7G3149096X211100R");
    expect(
      describePayPalError(new Error("failed"), "not an order id").orderId,
    ).toBeUndefined();
  });
});

describe("reportPayPalCheckoutError", () => {
  it("logs only the sanitized diagnostic and returns it", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = {
      name: "PayPalError",
      message:
        "access_token=secret-token https://www.sandbox.paypal.com/checkoutweb/genericError?debug_id=f719139b636c1",
      debug_id: "f719139b636c1",
    };

    const diagnostic = reportPayPalCheckoutError(error, "7G3149096X211100R");

    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("sandbox.paypal.com");
    expect(logged).toContain("f719139b636c1");
    expect(logged).toContain("7G3149096X211100R");
    expect(diagnostic.debugId).toBe("f719139b636c1");
    expect(diagnostic.orderId).toBe("7G3149096X211100R");
  });
});
