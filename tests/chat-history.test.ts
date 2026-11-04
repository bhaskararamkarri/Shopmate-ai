import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  MAX_HISTORY_ITEM_LENGTH,
  buildHistory,
} from "@/lib/chat-history";

describe("buildHistory", () => {
  it("keeps only completed user/assistant turns", () => {
    const history = buildHistory([
      { role: "user", content: "wireless headphones" },
      { role: "assistant", content: "Here are some picks." },
      { role: "assistant", content: "composing…", pending: true },
      { role: "assistant", content: "failed row", error: "request_failed" },
    ] as Parameters<typeof buildHistory>[0]);
    expect(history).toEqual([
      { role: "user", content: "wireless headphones" },
      { role: "assistant", content: "Here are some picks." },
    ]);
  });

  it("caps the window at MAX_HISTORY most recent turns", () => {
    const many = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${i}`,
    }));
    const history = buildHistory(many);
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[history.length - 1].content).toBe(
      `turn ${many.length - 1}`,
    );
  });

  it("truncates each turn to MAX_HISTORY_ITEM_LENGTH", () => {
    const history = buildHistory([
      { role: "user", content: "x".repeat(MAX_HISTORY_ITEM_LENGTH + 500) },
    ]);
    expect(history[0].content).toHaveLength(MAX_HISTORY_ITEM_LENGTH);
  });

  it("drops turns whose content truncates to empty", () => {
    const history = buildHistory([
      { role: "user", content: "" },
      { role: "assistant", content: "still here" },
    ]);
    expect(history).toEqual([{ role: "assistant", content: "still here" }]);
  });
});
