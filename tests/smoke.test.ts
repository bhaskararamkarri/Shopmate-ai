import { describe, expect, it } from "vitest";

/** Sanity check that the vitest pipeline and the `@` alias both resolve. */
describe("test pipeline", () => {
  it("runs assertions and resolves the @ alias", async () => {
    const mod = await import("@/lib/format");
    expect(mod).toBeTruthy();
    expect(1 + 1).toBe(2);
  });
});
