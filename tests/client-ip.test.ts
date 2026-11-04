import { describe, expect, it } from "vitest";
import { resolveClientIp } from "@/lib/agent/client-ip";

function headersWith(entries: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(entries)) {
    headers.set(key, value);
  }
  return headers;
}

describe("resolveClientIp", () => {
  it("prefers the platform-controlled x-real-ip", () => {
    expect(
      resolveClientIp(
        headersWith({
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to the leftmost x-forwarded-for entry", () => {
    expect(
      resolveClientIp(
        headersWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }),
      ),
    ).toBe("1.2.3.4");
  });

  it("trims whitespace around the chosen entry", () => {
    expect(
      resolveClientIp(headersWith({ "x-forwarded-for": "  1.2.3.4 ,5.6.7.8" })),
    ).toBe("1.2.3.4");
  });

  it("returns the shared unknown bucket when no ip headers exist", () => {
    expect(resolveClientIp(headersWith({}))).toBe("unknown");
    expect(resolveClientIp(new Headers())).toBe("unknown");
  });

  it("ignores blank header values", () => {
    expect(
      resolveClientIp(
        headersWith({ "x-real-ip": "  ", "x-forwarded-for": "1.2.3.4" }),
      ),
    ).toBe("1.2.3.4");
  });
});
