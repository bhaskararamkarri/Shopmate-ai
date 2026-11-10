// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cart",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopProvider } from "@/lib/store";
import { CartClient } from "@/components/cart/cart-client";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Stitch Cart & Confirmation UI (/cart)", () => {
  it("renders 'Your Cart is Quiet' empty state and restores 2 demo items on click", () => {
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    expect(screen.getByText(/Your Cart is Quiet/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Restore Demo Cart/i }));
    expect(screen.getByText(/Aurora ANC Headphones/i)).toBeDefined();
    expect(screen.getByText(/2 items/i)).toBeDefined();
  });

  it("renders complementary catalog upgrades and honest $0.00 Fulfillment without fabricated tax", () => {
    window.sessionStorage.removeItem("shopmate.receipt.v1");
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Restore Demo Cart/i }));
    expect(screen.getByText(/Demo Transaction \(\$0\.00\)/i)).toBeDefined();
    expect(screen.queryByText(/\$31\.04/)).toBeNull();
    expect(screen.queryByText(/Sandbox Simulation Controls/i)).toBeNull();
    expect(screen.getByText(/Frequently Complemented Upgrades/i)).toBeDefined();
  });

  it("supports quantity adjustment, comparison toggle, removal, and complementary upgrade additions", () => {
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Restore Demo Cart/i }));

    fireEvent.click(
      screen.getByRole("button", {
        name: /Increase quantity of Aurora ANC Headphones/i,
      }),
    );
    expect(screen.getByText(/3 items/i)).toBeDefined();

    const compareBtn = screen.getAllByRole("button", {
      name: /Save to Compare/i,
    })[0];
    fireEvent.click(compareBtn);
    expect(screen.getByRole("button", { name: /In Compare/i })).toBeDefined();

    const upgradeButtons = screen.getAllByRole("button", {
      name: /Add upgrade/i,
    });
    expect(upgradeButtons.length).toBeGreaterThan(0);
    fireEvent.click(upgradeButtons[0]);
    expect(screen.getByText(/4 items/i)).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Remove Bloom ANC Earbuds from cart/i,
      }),
    );
    const cartList = screen.getByRole("list", { name: /Cart items/i });
    expect(within(cartList).queryByText(/Bloom ANC Earbuds/i)).toBeNull();
    expect(screen.getByText(/3 items/i)).toBeDefined();
  });

  it("renders Stitch 05 Confirmation View from persisted verified session receipt without dev fallback drawer", () => {
    window.sessionStorage.setItem(
      "shopmate.receipt.v1",
      JSON.stringify({
        orderId: "ORD-VERIFIED-7",
        captureId: "CAP-VERIFIED-9",
        amount: { currency: "USD", value: "249.00" },
        purchasedItems: [],
        capturedAt: "14:32 UTC",
      }),
    );
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    expect(screen.getByText(/Payment Confirmed & Captured/i)).toBeDefined();
    expect(screen.getByText("ORD-VERIFIED-7")).toBeDefined();
    expect(screen.getByText("CAP-VERIFIED-9")).toBeDefined();
    expect(screen.queryByText(/Sandbox Fallback Testing/i)).toBeNull();
    const sandboxNote = screen.getByText(
      /PayPal Testnet active · No real monetary funds deducted/i,
    );
    expect(sandboxNote.className).not.toContain("truncate");

    fireEvent.click(screen.getByRole("button", { name: /Start new cart/i }));
    expect(window.sessionStorage.getItem("shopmate.receipt.v1")).toBeNull();
    expect(screen.getByText(/Your Cart is Quiet/i)).toBeDefined();
  });
});
