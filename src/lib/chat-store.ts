"use client";

/**
 * Chat conversation store.
 *
 * An external store read through `useSyncExternalStore`; the snapshot starts
 * empty on both the server and the first client render and is hydrated from
 * sessionStorage after mount, so the prerendered shell stays stable.
 *
 * Assistant messages carry resolved `Product` records (live Channel3 records
 * or labeled demo records) that came from the catalog API; they persist with
 * the message so a reload keeps the reply renderable.
 */
import type { ChatMessage } from "@/types";

/** Chat Message extending the shared contract with local UI state. */
export interface UiMessage extends ChatMessage {
  /** True while the assistant reply is still pending (never persisted). */
  pending?: boolean;
  /** Set when the reply failed; the row shows a retry affordance. */
  error?: "request_failed";
  /** Query to re-run when the user hits retry on a failed row. */
  retryQuery?: string;
}

const STORAGE_KEY = "shopmate.chat.v2";

const EMPTY_MESSAGES: UiMessage[] = [];

function loadStoredMessages(): UiMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is UiMessage =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            ((entry as { role?: unknown }).role === "user" ||
              (entry as { role?: unknown }).role === "assistant") &&
            typeof (entry as { content?: unknown }).content === "string",
        ),
    );
  } catch {
    return [];
  }
}

function persist(messages: UiMessage[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Session storage can be unavailable; the chat still works in memory.
  }
}

function createMessagesStore() {
  let snapshot: UiMessage[] = EMPTY_MESSAGES;
  let hydrated = false;
  const listeners = new Set<() => void>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function setMessages(next: UiMessage[]) {
    snapshot = next;
    persist(next);
    emit();
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): UiMessage[] {
      return snapshot;
    },
    getServerSnapshot(): UiMessage[] {
      return EMPTY_MESSAGES;
    },
    hydrate(): void {
      if (hydrated) return;
      hydrated = true;
      const restored = loadStoredMessages();
      if (restored.length > 0) {
        snapshot = restored;
        emit();
      }
    },
    /**
     * Appends a message onto the latest snapshot, even when the caller read
     * the value before an in-flight hydration.
     */
    append(message: UiMessage): void {
      setMessages([...snapshot, message]);
    },
    replaceAll(messages: UiMessage[]): void {
      setMessages(messages);
    },
  };
}

export const chatStore = createMessagesStore();

export function newMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
