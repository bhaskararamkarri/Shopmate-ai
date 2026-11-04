import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { ToolLoopAgent } from "ai";
import { createAgentTools } from "@/lib/agent/tools";
import { emptyIntent } from "@/lib/agent/intent";
import type { Product } from "@/types";

/**
 * Full agent-loop compatibility pin for the installed AI SDK: a scripted
 * mock model drives ToolLoopAgent through one tool call and one final text
 * step, proving our zod tool schemas, execute results, and the loop itself
 * work with ai@7 + @ai-sdk/google@4 without any network.
 */

function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: "Generic Product",
    description: "",
    price: 100,
    currency: "USD",
    availability: "in_stock",
    images: [],
    ratings: 0,
    reviews: 0,
    category: "General",
    brand: "Generic",
    specs: {},
    source: "demo",
    ...overrides,
  };
}

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
  raw: {},
};

describe("ToolLoopAgent with the installed AI SDK", () => {
  it("executes a scripted searchProducts tool call and returns grounded text", async () => {
    const headphones = product({
      id: "p1",
      name: "Sony Wireless Headphones",
      brand: "Sony",
      category: "Headphones",
    });
    const search = vi.fn(async () => ({
      source: "demo" as const,
      products: [headphones],
    }));
    const catalogLog = new Map<string, Product>();
    const recommendedIdsRef = { current: [] as string[] };
    const tools = createAgentTools({
      catalog: { search, getProduct: vi.fn(async () => null) },
      budgets: { searches: 3, details: 6, compares: 1 },
      intentRef: { current: emptyIntent() },
      catalogLog,
      recommendedIdsRef,
      toolsUsedRef: { current: [] },
      comparisonsRef: { current: [] },
      catalogMetaRef: { current: null },
    });

    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "searchProducts",
              input: JSON.stringify({ query: "wireless headphones" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "STOP" },
          usage: USAGE,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "Here is what I found." }],
          finishReason: { unified: "stop", raw: "STOP" },
          usage: USAGE,
          warnings: [],
        },
      ],
    });

    const agent = new ToolLoopAgent({
      model,
      instructions: "test instructions",
      tools,
      stopWhen: undefined,
      maxOutputTokens: 1024,
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: "wireless headphones" }],
    });

    // The model's scripted tool call executed against the real tool layer.
    expect(search).toHaveBeenCalledWith(
      "wireless headphones",
      expect.objectContaining({ limit: 6 }),
    );
    expect(catalogLog.has("p1")).toBe(true);
    // The loop produced final text after the tool step.
    expect(result.text).toContain("Here is what I found.");
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });
});
