/**
 * Groq conversation-history compatibility regression tests.
 *
 * Live failure: Groq's OpenAI-compatible API rejects `reasoning_content` on
 * incoming assistant messages ("messages.N: for role:assistant property
 * 'reasoning_content' is unsupported", HTTP 400) while its reasoning models
 * (e.g. openai/gpt-oss-120b) return reasoning that the AI SDK stores and
 * re-sends on the next tool-loop step. These tests pin the fix: the field is
 * stripped from outgoing request bodies while tool calls, tool results, ids
 * and ordering are preserved.
 */
import { describe, expect, it } from "vitest";
import { isStepCount, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { createGroqModel, stripGroqUnsupportedRequestFields } from "@/lib/agent/provider";

/** OpenAI-compatible chat-completion response (the wire format Groq returns). */
function completion(message: Record<string, unknown>, finishReason: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: "openai/gpt-oss-120b",
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** Step 1: gpt-oss-style reasoning + a tool call — exactly the live shape. */
const STEP1 = completion(
  {
    role: "assistant",
    content: "",
    reasoning: "The user wants the store hours; I should call the tool.",
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: { name: "store_hours", arguments: "{}" },
      },
    ],
  },
  "tool_calls",
);

/** Step 2: final text after the tool result. */
const STEP2 = completion({ role: "assistant", content: "Open 9am-9pm daily" }, "stop");

describe("Groq conversation-history compatibility", () => {
  it("does not send reasoning_content back on tool-loop follow-up requests", async () => {
    const requestBodies: string[] = [];
    const responses = [STEP1, STEP2];
    let call = 0;
    const capturingFetch: typeof fetch = async (_input, init) => {
      requestBodies.push(typeof init?.body === "string" ? init.body : "");
      const body = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    // The REAL openai-compatible provider (not a mock model): its serializer
    // is exactly what turns reasoning parts into reasoning_content.
    const model = createGroqModel("test-key", {
      modelId: "openai/gpt-oss-120b",
      fetch: capturingFetch,
    });

    const agent = new ToolLoopAgent({
      model,
      instructions: "test instructions",
      tools: {
        store_hours: tool({
          description: "Returns the store opening hours",
          inputSchema: z.object({}),
          execute: async () => "Open 9am-9pm daily",
        }),
      },
      stopWhen: isStepCount(3),
      maxOutputTokens: 512,
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: "What are the store hours?" }],
    });

    // The loop completed: tool executed, final text produced.
    expect(result.text).toContain("Open 9am-9pm");
    expect(requestBodies.length).toBe(2);

    // First request: system + user only, no assistant history yet.
    const first = JSON.parse(requestBodies[0]!) as { messages: { role: string }[] };
    expect(first.messages.some((m) => m.role === "assistant")).toBe(false);

    // Second request: the assistant turn must keep its tool call...
    const second = JSON.parse(requestBodies[1]!) as {
      messages: {
        role: string;
        tool_calls?: { id: string; function: { name: string } }[];
      }[];
    };
    const assistant = second.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant?.tool_calls?.[0]?.id).toBe("call_1");
    expect(assistant?.tool_calls?.[0]?.function.name).toBe("store_hours");

    // ...the tool result must keep its call id...
    const toolMsg = second.messages.find((m) => m.role === "tool") as
      | { tool_call_id?: string }
      | undefined;
    expect(toolMsg?.tool_call_id).toBe("call_1");

    // ...and the unsupported reasoning_content field must be gone.
    expect(requestBodies[1]).not.toContain("reasoning_content");
  });
});

describe("stripGroqUnsupportedRequestFields", () => {
  it("removes reasoning_content from assistant messages only", () => {
    const body = JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "internal reasoning",
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "t", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "result" },
      ],
    });
    const out = JSON.parse(stripGroqUnsupportedRequestFields(body)) as {
      messages: Record<string, unknown>[];
    };
    expect(out.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(out.messages[1]).toEqual({ role: "user", content: "hi" });
    expect(out.messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "t", arguments: "{}" } },
      ],
    });
    expect(out.messages[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: "result" });
  });

  it("returns non-JSON bodies unchanged", () => {
    expect(stripGroqUnsupportedRequestFields("not json at all")).toBe(
      "not json at all",
    );
  });

  it("returns bodies without a messages array unchanged", () => {
    const body = JSON.stringify({ model: "x", stream: false });
    expect(stripGroqUnsupportedRequestFields(body)).toBe(body);
  });

  it("returns the original string when there is nothing to strip", () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(stripGroqUnsupportedRequestFields(body)).toBe(body);
  });
});
