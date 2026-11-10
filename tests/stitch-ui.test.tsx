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
import { ProductCard } from "@/components/shop/product-card";
import {
  DEMO_PRODUCTS,
  FEATURED_PRODUCT_IDS,
  getDemoProduct,
} from "@/lib/demo-catalog";
import { ShopProvider, useShop } from "@/lib/store";

beforeEach(() => {
  mockPathname = "/";
  window.localStorage.clear();
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

describe("Stitch Light UI Integration", () => {
  it("uses currentColor on Shop wordmark for crisp light-mode contrast", () => {
    const { container } = render(<ShopMateLogo variant="horizontal" />);
    const textEl = container.querySelector("text");
    expect(textEl?.getAttribute("fill")).toBe("currentColor");
  });

  it("hides ComparisonDrawer when no items are pinned and shows dock when items are selected", () => {
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
    expect(screen.getByText(/instant comparison matrix/i)).toBeDefined();
    expect(screen.getByText("2/4 Selected")).toBeDefined();
    expect(screen.getByRole("link", { name: /launch matrix/i })).toBeDefined();
  });

  it("expands ComparisonDrawer peek panel, shows real specs, and removes items cleanly", () => {
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

  it("filters and sorts products interactively in DiscoveryCatalog", () => {
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

    // Filter to Audio (3 items)
    fireEvent.click(screen.getByRole("button", { name: /audio/i }));
    const audioArticles = screen.getAllByRole("article");
    expect(audioArticles).toHaveLength(3);

    // Sort Lowest Price first ($89 Pulse Portable Speaker before $129 Bloom and $249 Aurora)
    fireEvent.click(screen.getByRole("button", { name: /lowest price/i }));
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0]?.textContent).toBe("Pulse Portable Speaker");
    expect(headings[2]?.textContent).toBe("Aurora ANC Headphones");
  });

  it("renders ProductCard with real specs preview and preserves Add-to-Cart as first button", () => {
    const product = getDemoProduct("demo-aurora-headphones")!;
    render(
      <ShopProvider>
        <ProductCard product={product} />
      </ShopProvider>,
    );

    expect(screen.getByText("Battery life")).toBeDefined();
    expect(screen.getByText("34 hours")).toBeDefined();

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]?.textContent).toContain("Add to cart");
    fireEvent.click(buttons[0]!);
    expect(buttons[0]?.textContent).toContain("In cart");
  });
});
