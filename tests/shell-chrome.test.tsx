// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

let mockPathname = "/";
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopProvider, useShop } from "@/lib/store";
import { Navbar } from "@/components/shop/navbar";
import { MobileBottomNav } from "@/components/shop/mobile-bottom-nav";
import { Footer } from "@/components/shop/footer";

beforeEach(() => {
  mockPathname = "/";
  mockPush.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

function ReceiptHarness() {
  const { activeReceipt, setActiveReceipt, clearActiveReceipt, addToCart } = useShop();
  return (
    <div>
      <span data-testid="receipt-id">{activeReceipt?.orderId ?? "none"}</span>
      <button
        type="button"
        onClick={() =>
          setActiveReceipt({
            orderId: "ORD-123",
            captureId: "CAP-456",
            amount: { currency: "USD", value: "249.00" },
            purchasedItems: [],
            capturedAt: "10:15 AM",
          })
        }
      >
        Set Receipt
      </button>
      <button type="button" onClick={() => clearActiveReceipt()}>
        Clear Receipt
      </button>
      <button type="button" onClick={() => addToCart("demo-aurora-headphones")}>
        Add Item
      </button>
    </div>
  );
}

describe("Stitch Global Chrome & Receipt Shell", () => {
  it("persists receipt in sessionStorage and clears automatically on addToCart or clear", () => {
    render(
      <ShopProvider>
        <ReceiptHarness />
      </ShopProvider>,
    );
    expect(screen.getByTestId("receipt-id").textContent).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Set Receipt" }));
    expect(screen.getByTestId("receipt-id").textContent).toBe("ORD-123");
    expect(window.sessionStorage.getItem("shopmate.receipt.v1")).toContain("ORD-123");

    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect(screen.getByTestId("receipt-id").textContent).toBe("none");
    expect(window.sessionStorage.getItem("shopmate.receipt.v1")).toBeNull();
  });

  it("hides MobileBottomNav and renders Checkout Flow back button when activeReceipt exists on /cart", () => {
    mockPathname = "/cart";
    window.sessionStorage.setItem(
      "shopmate.receipt.v1",
      JSON.stringify({
        orderId: "ORD-999",
        captureId: "CAP-999",
        amount: { currency: "USD", value: "249.00" },
        purchasedItems: [],
        capturedAt: "11:00 AM",
      }),
    );
    render(
      <ShopProvider>
        <Navbar />
        <MobileBottomNav />
      </ShopProvider>,
    );
    expect(screen.queryByRole("navigation", { name: /mobile bottom/i })).toBeNull();
    const backBtn = screen.getByRole("button", { name: /back from checkout confirmation/i });
    expect(backBtn).toBeDefined();
    fireEvent.click(backBtn);
    expect(screen.getByRole("navigation", { name: /mobile bottom/i })).toBeDefined();
  });

  it("opens mobile quick search drawer and submits query to /chat", () => {
    render(
      <ShopProvider>
        <Navbar />
      </ShopProvider>,
    );
    const openBtn = screen.getByRole("button", { name: /open quick search/i });
    fireEvent.click(openBtn);
    const input = screen.getByLabelText(/ask shopmate ai/i);
    fireEvent.change(input, { target: { value: "wireless buds" } });
    fireEvent.submit(input.closest("form")!);
    expect(mockPush).toHaveBeenCalledWith("/chat?q=wireless%20buds");
  });

  it("renders Footer with 4 internal navigable links and zero hash placeholders", () => {
    render(<Footer />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toBe("#");
    }
  });
});
