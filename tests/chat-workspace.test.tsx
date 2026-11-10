// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopProvider } from "@/lib/store";
import { ChatMessageItem } from "@/components/chat/chat-message";
import { ChatClient } from "@/components/chat/chat-client";
import { chatStore } from "@/lib/chat-store";
import { getDemoProduct } from "@/lib/demo-catalog";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  chatStore.replaceAll([]);
});

afterEach(() => {
  cleanup();
});

describe("Stitch AI Shopping Workspace (/chat)", () => {
  it("renders inline 2-up synthesis cards with recommendation insights and Add/Compare actions", () => {
    const aurora = getDemoProduct("demo-aurora-headphones")!;
    render(
      <ShopProvider>
        <ChatMessageItem
          message={{
            id: "msg-1",
            role: "assistant",
            content: "Here are two grounded picks.",
            createdAt: "2026-11-10T10:00:00Z",
            products: [aurora],
            recommendations: [
              {
                productId: aurora.id,
                badge: "Best Overall",
                whyItMatches: "Matches your ANC travel criteria.",
                requirementsSatisfied: ["Battery >= 25h"],
                failedRequirements: ["Price slightly above $200 ideal"],
                missingOrUnverified: ["Codec bitrate unlisted"],
                tradeOffs: ["Over-ear form factor is bulkier than earbuds."],
                whoShouldChoose: "Frequent flyers prioritizing ANC endurance.",
              },
            ],
            agentMeta: {
              mode: "ai",
              model: "gemini-2.5-flash",
              toolsUsed: ["search_catalog"],
              catalog: { source: "demo" },
            },
          }}
        />
      </ShopProvider>,
    );

    const list = screen.getByRole("list", { name: /recommended products/i });
    expect(list).toBeDefined();
    expect(screen.getByText("Best Overall")).toBeDefined();
    expect(screen.getByText(/Over-ear form factor/i)).toBeDefined();
    expect(screen.getByText(/Price slightly above \$200 ideal/i)).toBeDefined();
    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);
    expect(screen.getByRole("button", { name: /in cart/i })).toBeDefined();
  });

  it("handles missing recommendations and empty specs without throwing or fabricating scores", () => {
    const bareProduct = {
      ...getDemoProduct("demo-aurora-headphones")!,
      specs: {},
    };
    render(
      <ShopProvider>
        <ChatMessageItem
          message={{
            id: "msg-2",
            role: "assistant",
            content: "Found one bare record.",
            createdAt: "2026-11-10T10:00:00Z",
            products: [bareProduct],
          }}
        />
      </ShopProvider>,
    );
    expect(screen.queryByText(/98% FIT SCORE/i)).toBeNull();
    expect(screen.getByText("Aurora ANC Headphones")).toBeDefined();
  });

  it("uses strict 2-column desktop workspace (Requirements rail + Conversation stream, no 3rd desktop Shortlist rail)", () => {
    render(
      <ShopProvider>
        <ChatClient />
      </ShopProvider>,
    );
    expect(
      screen.getByRole("complementary", {
        name: /shopping requirements & refinements/i,
      }),
    ).toBeDefined();
    expect(
      screen.queryByRole("complementary", {
        name: /live product shortlist & decision insights/i,
      }),
    ).toBeNull();
  });

  it("renders mobile Shortlist tab only when Shortlist tab is selected", () => {
    render(
      <ShopProvider>
        <ChatClient />
      </ShopProvider>,
    );
    const shortlistTab = screen.getByRole("button", { name: /shortlist/i });
    fireEvent.click(shortlistTab);
    expect(
      screen.getByRole("complementary", {
        name: /live product shortlist & decision insights/i,
      }),
    ).toBeDefined();
  });

  it("keeps workspace badge single-line and uses non-clipping min-h-full centering on welcome card", () => {
    render(
      <ShopProvider>
        <ChatClient />
      </ShopProvider>,
    );
    const workspaceBadge = screen.getByText(/SHOPMATE WORKSPACE/i).closest("span.rounded-full");
    expect(workspaceBadge?.className).toContain("whitespace-nowrap");

    const copilotHeading = screen.getByRole("heading", {
      name: /ShopMate Research Copilot/i,
    });
    const innerCard = copilotHeading.closest("div.max-w-2xl");
    expect(innerCard?.className).toContain("my-auto");
    expect(innerCard?.parentElement?.className).toContain("min-h-full");
    expect(innerCard?.parentElement?.className.split(/\s+/)).not.toContain("h-full");
  });
});

