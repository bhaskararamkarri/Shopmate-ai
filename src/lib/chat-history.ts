/**
 * ShopMate AI — chat history window (client-side, Phase 4).
 *
 * Pure helper shared by the chat client: selects the turns sent to
 * /api/chat as conversation context. Extracted from the component so the
 * windowing rules (cap, truncation, completed-turns-only) are unit-pinned.
 */

/** History window sent with each turn — matches the server's validation bound. */
export const MAX_HISTORY = 16;
export const MAX_HISTORY_ITEM_LENGTH = 2000;

interface HistorySource {
  role: string;
  content: string;
  pending?: boolean;
  error?: string;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Builds the request history from the visible message list. Only completed
 * turns are included — pending and failed rows are not conversation context.
 */
export function buildHistory(messages: HistorySource[]): HistoryTurn[] {
  return messages
    .filter((message) => !message.pending && !message.error)
    .slice(-MAX_HISTORY)
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.content.slice(0, MAX_HISTORY_ITEM_LENGTH),
    }))
    .filter((entry) => entry.content.length > 0);
}
