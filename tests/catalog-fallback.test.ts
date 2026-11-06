import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCatalog } from "@/lib/catalog/provider";
import { channel3Provider } from "@/lib/catalog/normalize";
import { CatalogError } from "@/lib/catalog/types";

describe("Channel3 API failure and demo catalog fallback", () => {
  const originalEnv = process.env.CHANNEL3_API_KEY;

  afterEach(() => {
    process.env.CHANNEL3_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("falls back to demo catalog with not_configured reason when key is absent", async () => {
    delete process.env.CHANNEL3_API_KEY;

    const outcome = await searchCatalog("headphones", { limit: 5 });

    expect(outcome.source).toBe("demo");
    expect(outcome.fallback).toBeDefined();
    expect(outcome.fallback?.reason).toBe("not_configured");
    expect(outcome.products.length).toBeGreaterThan(0);
    for (const product of outcome.products) {
      expect(product.source).toBe("demo");
      expect(product.id).toMatch(/^demo-/);
    }
  });

  it("falls back to demo catalog when Channel3 provider throws auth_failed", async () => {
    process.env.CHANNEL3_API_KEY = "invalid-key";
    vi.spyOn(channel3Provider, "search").mockRejectedValue(
      new CatalogError("auth_failed", "Unauthorized", 401),
    );

    const outcome = await searchCatalog("headphones", { limit: 5 });

    expect(outcome.source).toBe("demo");
    expect(outcome.fallback).toBeDefined();
    expect(outcome.fallback?.reason).toBe("auth_failed");
    expect(outcome.products.length).toBeGreaterThan(0);
    expect(outcome.products[0].source).toBe("demo");
  });

  it("falls back to demo catalog when Channel3 provider encounters a timeout", async () => {
    process.env.CHANNEL3_API_KEY = "test-key";
    vi.spyOn(channel3Provider, "search").mockRejectedValue(
      new CatalogError("timeout", "Request timed out", 504),
    );

    const outcome = await searchCatalog("headphones", { limit: 5 });

    expect(outcome.source).toBe("demo");
    expect(outcome.fallback?.reason).toBe("timeout");
    expect(outcome.products.length).toBeGreaterThan(0);
    expect(outcome.products[0].source).toBe("demo");
  });

  it("falls back to demo catalog when Channel3 provider throws a generic provider error", async () => {
    process.env.CHANNEL3_API_KEY = "test-key";
    vi.spyOn(channel3Provider, "search").mockRejectedValue(
      new Error("Network connection reset"),
    );

    const outcome = await searchCatalog("headphones", { limit: 5 });

    expect(outcome.source).toBe("demo");
    expect(outcome.fallback?.reason).toBe("provider_error");
    expect(outcome.products.length).toBeGreaterThan(0);
    expect(outcome.products[0].source).toBe("demo");
  });
});

