// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/compare",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams("ids=demo-aurora-headphones,demo-pulse-speaker"),
}));

import {
  groupComparisonSpecRows,
  computeUnitSafeLead,
} from "@/lib/compare/spec-groups";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import { getDemoProduct } from "@/lib/demo-catalog";
import { ShopProvider } from "@/lib/store";
import { CompareClient } from "@/components/compare/compare-client";
import type { Product } from "@/types";

beforeEach(() => {
  mockPush.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Stitch Comparison Matrix & Unit-Safe Spec Grouping", () => {
  it("groups arbitrary catalog specs into deterministic non-empty Stitch categories", () => {
    const p1 = getDemoProduct("demo-aurora-headphones")!;
    const p2 = getDemoProduct("demo-pulse-speaker")!;
    const matrix = buildComparisonMatrix([p1, p2]);
    const groups = groupComparisonSpecRows(matrix.specRows);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
    expect(groups.some((g) => g.title.includes("Battery"))).toBe(true);
  });

  it("computes SPEC LEAD only for single-number matching units and rejects mixed units", () => {
    const aurora = getDemoProduct("demo-aurora-headphones")!; // 34 hours, 9.6 oz
    const speaker = getDemoProduct("demo-pulse-speaker")!; // 18 hours, 1.3 lb
    const earbuds = getDemoProduct("demo-bloom-earbuds")!; // "8 hours buds, 24 with case"

    const hoursMatrix = buildComparisonMatrix([aurora, speaker]);
    const batteryRow = hoursMatrix.specRows.find(
      (r) => r.key === "Battery life",
    )!;
    const batteryLead = computeUnitSafeLead(batteryRow, [aurora, speaker]);
    expect(batteryLead?.winnerIds).toEqual([aurora.id]);
    expect(batteryLead?.ratioByProductId[aurora.id]).toBe(100);
    expect(batteryLead?.ratioByProductId[speaker.id]).toBeLessThan(100);

    // Weight: 9.6 oz vs 1.3 lb -> mixed units must return null (never crown 1.3 < 9.6 falsely)
    const weightRow = hoursMatrix.specRows.find((r) => r.key === "Weight")!;
    expect(computeUnitSafeLead(weightRow, [aurora, speaker])).toBeNull();

    // Compound prose battery string ("8 hours buds, 24 with case") -> must return null
    const compoundMatrix = buildComparisonMatrix([aurora, earbuds]);
    const compoundBatteryRow = compoundMatrix.specRows.find(
      (r) => r.key === "Battery life",
    )!;
    expect(computeUnitSafeLead(compoundBatteryRow, [aurora, earbuds])).toBeNull();
  });

  it("renders fixed bottom choice bar that adds chosen item to cart and navigates to /cart", () => {
    render(
      <ShopProvider>
        <CompareClient />
      </ShopProvider>,
    );
    expect(screen.getByText(/Product Comparison/i)).toBeDefined();
    expect(screen.getAllByText(/SPEC LEAD/i).length).toBeGreaterThanOrEqual(1);
    const chooseAurora = screen.getByRole("button", {
      name: /choose aurora/i,
    });
    const chooseSpeaker = screen.getByRole("button", {
      name: /choose pulse/i,
    });
    expect(chooseAurora.className).toContain("min-w-0");
    expect(chooseSpeaker.className).toContain("min-w-0");
    // Only the Best Overall pick receives primary purple accent; second pick uses distinct dark slate
    expect(chooseAurora.className).toContain("bg-primary");
    expect(chooseSpeaker.className).not.toContain("bg-primary ");
    fireEvent.click(chooseAurora);
    expect(mockPush).toHaveBeenCalledWith("/cart");
  });

  it("renders currency mismatch alert without crashing when currencies differ", () => {
    const usd: Product = {
      ...getDemoProduct("demo-aurora-headphones")!,
      currency: "USD",
    };
    const eur: Product = {
      ...getDemoProduct("demo-pulse-speaker")!,
      currency: "EUR",
    };
    const matrix = buildComparisonMatrix([usd, eur]);
    expect(matrix.priceComparison.hasCurrencyMismatch).toBe(true);
  });
});

