/**
 * ShopMate AI — chat agent API client (browser side).
 *
 * Typed fetch wrapper for POST /api/chat. The browser never sees a model
 * API key; it only talks to this same-origin endpoint. All types are
 * type-only imports — no agent or zod runtime code ships to the client.
 */
import type { ChatApiResponse, ChatRequest } from "@/lib/agent/chat-contract";

export type { ChatApiResponse };

export interface SendChatInput {
  conversationId: string;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  /** Intent accumulated so far, sent back to keep context across turns. */
  intent?: ChatRequest["intent"];
  signal?: AbortSignal;
}

export async function sendChatMessage(input: SendChatInput): Promise<ChatApiResponse> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: input.conversationId,
        history: input.history,
        message: input.message,
        ...(input.intent ? { intent: input.intent } : {}),
      }),
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("network_error");
  }

  try {
    return (await response.json()) as ChatApiResponse;
  } catch {
    throw new Error("network_error");
  }
}
