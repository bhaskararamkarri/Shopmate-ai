/**
 * Cerebras and OpenAI-compatible conversation-history compatibility regression tests.
 *
 * Live failure on Cerebras:
 * Cerebras's OpenAI-compatible API rejects `reasoning_content` on incoming assistant
 * messages with HTTP 400 ("messages.N: for role:assistant property 'reasoning_content' is unsupported").
 * Cerebras reasoning models (such as gpt-oss-120b and qwen-3.8-27b) return reasoning that
 * the AI SDK stores and echoes back on the next tool-loop step.
 *
 * These tests verify:
 * 1. Safe `reasoning_content` sanitization for Cerebras and all OpenAI-compatible providers.
 * 2. Legitimate tool_calls, arguments, tool results, message order, and context are preserved intact.
 * 3. Multi-step Cerebras execution succeeds.
 * 4. Cerebras failure correctly falls through to Groq in runAgentTurn.
 * 5. Groq behavior remains completely unaffected.
 */
import { describe, expect, it, vi } from "vitest";
import { isStepCount, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import {
  createCerebrasModel,
  createGroqModel,
  sanitizeOpenAICompatibleRequestBody,
  stripGroqUnsupportedRequestFields,
} from "@/lib/agent/provider";
import {
  extractErrorStatus,
  extractRetryAfterSec,
  isFailoverEligibleError,
} from "@/lib/agent/failover";
import { runAgentTurn } from "@/lib/agent/agent";
import type { ProviderCandidate } from "@/lib/agent/provider";
import type { Product } from "@/types";

/** OpenAI-compatible chat-completion response wire format. */
function completion(message: Record<string, unknown>, finishReason: string, model = "gpt-oss-120b") {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** Step 1: Cerebras returns reasoning + searchProducts tool call. */
const CEREBRAS_STEP1 = completion(
  {
    role: "assistant",
    content: null,
    reasoning: "User wants running shoes. I will search the catalog.",
    tool_calls: [
      {
        id: "call_cerebras_1",
        type: "function",
        function: {
          name: "searchProducts",
          arguments: JSON.stringify({ query: "running shoes", limit: 4 }),
        },
      },
    ],
  },
  "tool_calls",
  "gpt-oss-120b",
);

/** Step 2: Cerebras returns final grounded recommendations. */
const CEREBRAS_STEP2 = completion(
  {
    role: "assistant",
    content: "Here are the top running shoes from Cerebras under $120.",
  },
  "stop",
  "gpt-oss-120b",
);

describe("Cerebras conversation-history compatibility", () => {
  it("removes reasoning_content on multi-step tool calls while preserving tool calls and arguments", async () => {
    const outboundBodies: string[] = [];
    const responses = [CEREBRAS_STEP1, CEREBRAS_STEP2];
    let callIndex = 0;

    const capturingFetch: typeof fetch = async (_input, init) => {
      const rawBody = typeof init?.body === "string" ? init.body : "";
      outboundBodies.push(rawBody);

      // Verify that if Cerebras were to receive reasoning_content on step 2,
      // it would reject it with HTTP 400 exactly like the live API.
      if (callIndex > 0 && rawBody.includes("reasoning_content")) {
        return new Response(
          JSON.stringify({
            message: "messages.2.assistant.reasoning_content: property is unsupported",
            type: "invalid_request_error",
            code: "wrong_api_format",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }

      const body = responses[Math.min(callIndex, responses.length - 1)]!;
      callIndex += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const model = createCerebrasModel("test-cerebras-key", {
      modelId: "gpt-oss-120b",
      fetch: capturingFetch,
    });

    const agent = new ToolLoopAgent({
      model,
      instructions: "You are ShopMate AI.",
      tools: {
        searchProducts: tool({
          description: "Search catalog",
          inputSchema: z.object({
            query: z.string(),
            limit: z.number().optional(),
          }),
          execute: async ({ query }) => ({
            results: [{ id: "shoe_1", name: `Product for ${query}`, price: 89 }],
          }),
        }),
      },
      stopWhen: isStepCount(3),
      maxOutputTokens: 512,
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: "running shoes under $120" }],
    });

    // 1. Multi-step execution succeeded
    expect(result.text).toContain("top running shoes from Cerebras");
    expect(outboundBodies.length).toBe(2);

    // 2. Step 1 has no assistant history yet
    const firstReq = JSON.parse(outboundBodies[0]!) as { messages: { role: string }[] };
    expect(firstReq.messages.some((m) => m.role === "assistant")).toBe(false);

    // 3. Step 2 has assistant message with tool_calls and tool result, but WITHOUT reasoning_content
    const secondReq = JSON.parse(outboundBodies[1]!) as {
      messages: Array<{
        role: string;
        content?: unknown;
        reasoning_content?: unknown;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        tool_call_id?: string;
      }>;
    };

    const assistantMsg = secondReq.messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.tool_calls).toBeDefined();
    expect(assistantMsg?.tool_calls?.[0]?.id).toBe("call_cerebras_1");
    expect(assistantMsg?.tool_calls?.[0]?.function.name).toBe("searchProducts");
    expect(JSON.parse(assistantMsg?.tool_calls?.[0]?.function.arguments || "{}")).toEqual({
      query: "running shoes",
      limit: 4,
    });

    // Tool result message preserved
    const toolMsg = secondReq.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe("call_cerebras_1");

    // reasoning_content must be completely stripped
    expect(assistantMsg?.reasoning_content).toBeUndefined();
    expect(outboundBodies[1]).not.toContain("reasoning_content");
  });

  it("falls through from Cerebras failure to Groq in runAgentTurn", async () => {
    const demoProduct: Product = {
      id: "shoe_1",
      name: "Ultraboost Running Shoes",
      description: "Comfortable running shoe",
      price: 110,
      currency: "USD",
      availability: "in_stock",
      images: ["https://example.com/shoe.jpg"],
      ratings: 4.7,
      reviews: 500,
      category: "Athletic Shoes",
      brand: "adidas",
      specs: { Fit: "Regular", Material: "Primeknit" },
      source: "demo",
    };

    const catalog = {
      search: vi.fn(async () => ({ source: "demo" as const, products: [demoProduct] })),
      getProduct: vi.fn(async () => demoProduct),
    };

    // Cerebras fails with a 503 Service Unavailable
    const failingCerebrasFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: "Cerebras overloaded" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    };

    // Groq succeeds with clean recommendation
    const successfulGroqFetch: typeof fetch = async () => {
      const resp = completion(
        {
          role: "assistant",
          content: "Here are running shoes recommended by Groq fallback.",
        },
        "stop",
        "openai/gpt-oss-120b",
      );
      return new Response(JSON.stringify(resp), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const providers: ProviderCandidate[] = [
      {
        name: "cerebras",
        modelId: "gpt-oss-120b",
        createModel: () =>
          createCerebrasModel("test-cerebras-key", {
            modelId: "gpt-oss-120b",
            fetch: failingCerebrasFetch,
          }),
        timeoutMs: 5000,
      },
      {
        name: "groq",
        modelId: "openai/gpt-oss-120b",
        createModel: () =>
          createGroqModel("test-groq-key", {
            modelId: "openai/gpt-oss-120b",
            fetch: successfulGroqFetch,
          }),
        timeoutMs: 5000,
      },
    ];

    const result = await runAgentTurn(
      { history: [], message: "running shoes under $120" },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(result.content).toContain("recommended by Groq fallback");
  }, 15000);
});

describe("sanitizeOpenAICompatibleRequestBody", () => {
  it("removes reasoning_content from assistant messages while preserving all other properties", () => {
    const raw = JSON.stringify({
      model: "gpt-oss-120b",
      messages: [
        { role: "system", content: "You are a shopping assistant." },
        { role: "user", content: "running shoes" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "Thought process to remove",
          tool_calls: [
            {
              id: "call_abc",
              type: "function",
              function: { name: "searchProducts", arguments: '{"query":"running"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_abc", content: '{"results":[]}' },
      ],
    });

    const sanitized = sanitizeOpenAICompatibleRequestBody(raw);
    expect(sanitized).not.toContain("reasoning_content");
    expect(sanitized).not.toContain("Thought process to remove");

    const parsed = JSON.parse(sanitized);
    expect(parsed.messages.length).toBe(4);
    expect(parsed.messages[0]).toEqual({ role: "system", content: "You are a shopping assistant." });
    expect(parsed.messages[1]).toEqual({ role: "user", content: "running shoes" });
    expect(parsed.messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_abc",
          type: "function",
          function: { name: "searchProducts", arguments: '{"query":"running"}' },
        },
      ],
    });
    expect(parsed.messages[3]).toEqual({ role: "tool", tool_call_id: "call_abc", content: '{"results":[]}' });
  });

  it("is backward compatible with stripGroqUnsupportedRequestFields alias", () => {
    expect(stripGroqUnsupportedRequestFields).toBe(sanitizeOpenAICompatibleRequestBody);
  });
});

describe("recursive error extraction safety", () => {
  it("prevents infinite loops when encountering circular error references", () => {
    const circularError: Record<string, unknown> = {
      message: "AI_APICallError wrapper",
    };
    // Create direct circular reference
    circularError.lastError = circularError;
    circularError.cause = circularError;

    // Must not throw RangeError: Maximum call stack size exceeded
    expect(extractErrorStatus(circularError)).toBeUndefined();
    expect(extractRetryAfterSec(circularError)).toBeUndefined();
    expect(isFailoverEligibleError(circularError)).toBe(false);
  });

  it("extracts nested error status up to safe depth without looping", () => {
    const nestedError = {
      message: "Outer error",
      lastError: {
        message: "Middle error",
        lastError: {
          message: "Deep error",
          statusCode: 429,
        },
      },
    };

    expect(extractErrorStatus(nestedError)).toBe(429);
    expect(isFailoverEligibleError(nestedError)).toBe(true);
  });
});
