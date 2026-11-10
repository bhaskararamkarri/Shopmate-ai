// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopMateLogo } from "@/components/brand/logo";
import { ComparisonDrawer } from "@/components/compare/comparison-drawer";
import { DiscoveryCatalog } from "@/components/shop/discovery-catalog";
import { ProductAnalysisDrawer } from "@/components/shop/product-analysis-drawer";
import { ProductCard } from "@/components/shop/product-card";
import {
  DEMO_PRODUCTS,
  FEATURED_PRODUCT_IDS,
  getDemoProduct,
} from "@/lib/demo-catalog";
import { ShopProvider, useShop } from "@/lib/store";
import type { Product } from "@/types";

beforeEach(() => {
  mockPathname = "/";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

function SeedCompareHarness({ ids }: { ids: string[] }) {
  const { setCompare } = useShop();
  React.useEffect(() => {
    setCompare(ids);
  }, [ids, setCompare]);
  return <ComparisonDrawer />;
}

describe("Exact Stitch Discovery UI & Floating Drawer Integration", () => {
  it("preserves currentColor on ShopMateLogo wordmark", () => {
    const { container } = render(<ShopMateLogo variant="horizontal" />);
    const textEl = container.querySelector("text");
    expect(textEl?.getAttribute("fill")).toBe("currentColor");
  });

  it("hides ComparisonDrawer when empty, shows dock when pinned, and clears mobile nav cleanly", () => {
    render(
      <ShopProvider>
        <ComparisonDrawer />
      </ShopProvider>,
    );
    expect(
      screen.queryByRole("complementary", {
        name: /pinned product comparison drawer/i,
      }),
    ).toBeNull();

    cleanup();

    render(
      <ShopProvider>
        <SeedCompareHarness
          ids={["demo-aurora-headphones", "demo-bloom-earbuds"]}
        />
      </ShopProvider>,
    );
    const dock = screen.getByRole("complementary", {
      name: /pinned product comparison drawer/i,
    });
    expect(dock.className).toContain("bottom-20");
    expect(screen.getByText(/instant comparison matrix/i)).toBeDefined();
    expect(screen.getByText("2/4 Selected")).toBeDefined();
    expect(screen.getByRole("link", { name: /launch matrix/i })).toBeDefined();
  });

  it("expands ComparisonDrawer peek panel, shows Side-by-Side Spec Breakdown & Quick Verdict, and removes items", () => {
    render(
      <ShopProvider>
        <SeedCompareHarness
          ids={["demo-aurora-headphones", "demo-bloom-earbuds"]}
        />
      </ShopProvider>,
    );

    const toggleBtn = screen.getByRole("button", {
      name: /instant comparison matrix/i,
    });
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/side-by-side spec breakdown/i)).toBeDefined();
    expect(screen.getByText(/quick verdict/i)).toBeDefined();
    expect(screen.getByText("Aurora ANC Headphones")).toBeDefined();
    expect(screen.getByText("Bloom ANC Earbuds")).toBeDefined();
    expect(screen.getByText("$129 – $249")).toBeDefined();

    const removeAurora = screen.getByRole("button", {
      name: /remove aurora anc headphones from comparison drawer/i,
    });
    fireEvent.click(removeAurora);
    expect(screen.queryByText("Aurora ANC Headphones")).toBeNull();
    expect(screen.getByText("1/4 Selected")).toBeDefined();
  });

  it("hides ComparisonDrawer on /compare, /chat, and /cart routes to prevent occlusion", () => {
    for (const hiddenRoute of ["/compare", "/chat", "/cart"]) {
      mockPathname = hiddenRoute;
      render(
        <ShopProvider>
          <SeedCompareHarness
            ids={["demo-aurora-headphones", "demo-bloom-earbuds"]}
          />
        </ShopProvider>,
      );
      expect(
        screen.queryByRole("complementary", {
          name: /pinned product comparison drawer/i,
        }),
      ).toBeNull();
      cleanup();
    }
  });

  it("filters and sorts products in DiscoveryCatalog and renders Catalog Attribute Profile & mobile Instant Matrix banner", () => {
    render(
      <ShopProvider>
        <DiscoveryCatalog
          products={DEMO_PRODUCTS}
          featuredIds={FEATURED_PRODUCT_IDS}
        />
      </ShopProvider>,
    );

    // Default Featured shows 4 products
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByText(/catalog attribute profile/i)).toBeDefined();
    expect(screen.getByText(/instant matrix/i)).toBeDefined();

    // Filter to Audio (3 items)
    fireEvent.click(screen.getByRole("button", { name: /^audio/i }));
    expect(screen.getAllByRole("article")).toHaveLength(3);

    // Sort Lowest Price first ($89 Pulse before $129 Bloom and $249 Aurora)
    fireEvent.click(screen.getByRole("button", { name: /lowest price/i }));
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0]?.textContent).toBe("Pulse Portable Speaker");
    expect(headings[2]?.textContent).toBe("Aurora ANC Headphones");
  });

  it("renders ProductCard Stitch actions (Compare -> Compared, Analysis -> slide-over drawer Add to Cart)", () => {
    const product = getDemoProduct("demo-aurora-headphones")!;
    render(
      <ShopProvider>
        <ProductCard product={product} />
      </ShopProvider>,
    );

    expect(screen.getByText("Battery life")).toBeDefined();
    expect(screen.getByText("34 hours")).toBeDefined();

    // No discount pill when compareAtPrice is absent
    expect(screen.queryByText(/-\d+%/)).toBeNull();

    const compareBtn = screen.getByRole("button", { name: /compare/i });
    expect(compareBtn.textContent).toContain("Compare");
    fireEvent.click(compareBtn);
    expect(compareBtn.textContent).toContain("Compared");

    const analysisBtn = screen.getByRole("button", { name: /analysis/i });
    fireEvent.click(analysisBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);
    expect(screen.getByRole("button", { name: /in cart/i })).toBeDefined();
  });

  it("omits unsafe javascript:/data: buyUrl links in ProductAnalysisDrawer while rendering safe https offers and genuine discounts", () => {
    const unsafeLiveProduct: Product = {
      ...getDemoProduct("demo-aurora-headphones")!,
      id: "live-unsafe-1",
      source: "channel3",
      merchant: "sketchy.example",
      buyUrl: "javascript:alert(1)",
      compareAtPrice: 299,
      price: 249,
    };

    const { rerender } = render(
      <ShopProvider>
        <ProductAnalysisDrawer
          product={unsafeLiveProduct}
          open
          onClose={vi.fn()}
        />
      </ShopProvider>,
    );

    expect(screen.queryByRole("link", { name: /see at/i })).toBeNull();
    expect(screen.getByText("-17%")).toBeDefined();

    rerender(
      <ShopProvider>
        <ProductAnalysisDrawer
          product={{
            ...unsafeLiveProduct,
            merchant: "trusted.example",
            buyUrl: "https://trusted.example/item/1",
          }}
          open
          onClose={vi.fn()}
        />
      </ShopProvider>,
    );

    const safeLink = screen.getByRole("link", { name: /see at trusted\.example/i });
    expect(safeLink.getAttribute("href")).toBe("https://trusted.example/item/1");
  });
});
