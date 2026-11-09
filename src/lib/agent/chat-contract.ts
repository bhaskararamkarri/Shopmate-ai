/**
 * ShopMate AI — /api/chat request and response contracts (Phase 4).
 *
 * Shared by the route handler (server), the browser client (chat-api.ts),
 * and the agent assembly, so all three agree on one shape. Limits here are
 * the single source of truth for message/history validation.
 */
import { z } from "zod";
import type { Product, ProductRecommendationInsight } from "@/types";
import { IntentSchema, type ShoppingIntent } from "./intent";

/** Request and history bounds — deliberate, modest ceilings. */
export const CHAT_LIMITS = {
  maxHistoryMessages: 16,
  maxHistoryMessageLength: 4000,
  maxMessageLength: 1000,
  maxConversationIdLength: 64,
} as const;

export const ConversationIdSchema = z
  .string()
  .min(1)
  .max(CHAT_LIMITS.maxConversationIdLength)
  .regex(/^[A-Za-z0-9_-]+$/, "conversationId must be URL-safe");

export const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(CHAT_LIMITS.maxHistoryMessageLength),
});

export const ChatRequestSchema = z.object({
  conversationId: ConversationIdSchema,
  history: z
    .array(HistoryMessageSchema)
    .max(CHAT_LIMITS.maxHistoryMessages)
    .default([]),
  message: z.string().trim().min(1).max(CHAT_LIMITS.maxMessageLength),
  /** Intent accumulated so far, sent back by the client to keep context. */
  intent: IntentSchema.optional(),
  /** Product IDs recently discussed or shortlisted in this conversation. */
  contextProductIds: z.array(z.string().min(1).max(128)).max(32).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** One side-by-side comparison the agent performed this turn. */
export interface ChatComparison {
  productIds: string[];
  products: Product[];
  missingIds: string[];
}

export interface ChatCatalogMeta {
  source: "channel3" | "demo";
  /** Set when live results degraded to labeled demo results. */
  fallback?: string;
}

export interface ChatApiSuccess {
  success: true;
  /** The assistant's reply text. */
  content: string;
  /** Structured shopping intent after this turn. */
  intent: ShoppingIntent;
  /** Ranked product recommendations (all facts from the catalog). */
  products: Product[];
  /** Evidenced recommendation insights produced by the decision engine. */
  recommendations?: ProductRecommendationInsight[];
  comparisons: ChatComparison[];
  /** Open clarifying questions, if any. */
  clarifications: string[];
  /** Ids behind `products` — the client can resolve/add to cart from these. */
  productIds: string[];
  /** Where the product data came from — never silently demo. */
  catalog: ChatCatalogMeta;
  /** Which agent tools ran this turn. */
  toolsUsed: string[];
  /** Model id when mode is 'ai' (e.g. "gemini-3.8-flash"). */
  model?: string;
  /** How this turn was produced. */
  mode: "ai" | "keyword_fallback";
}

export type ChatApiFailure = {
  success: false;
  error:
    | "invalid_request"
    | "rate_limited"
    | "ai_unavailable"
    | "internal_error";
  message?: string;
  /** Seconds to wait before retrying (rate_limited only). */
  retryAfterSec?: number;
};

export type ChatApiResponse = ChatApiSuccess | ChatApiFailure;
