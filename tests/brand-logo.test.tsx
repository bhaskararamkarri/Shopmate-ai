// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { ShopMateLogo } from "@/components/brand/logo";

afterEach(cleanup);

describe("ShopMateLogo", () => {
  it("renders the horizontal logo variant by default with accessible label", () => {
    const { container } = render(<ShopMateLogo />);
    const logo = screen.getByRole("img", { name: /shopmate ai/i });
    expect(logo).toBeDefined();
    expect(container.textContent).toContain("Shop");
    expect(container.textContent).toContain("Mate");
    expect(container.textContent).toContain("AI");
  });

  it("renders the icon-only variant without wordmark text", () => {
    const { container } = render(<ShopMateLogo variant="icon" />);
    const logo = screen.getByRole("img", { name: /shopmate ai/i });
    expect(logo).toBeDefined();
    expect(container.textContent?.trim()).toBe("ShopMate AI");
  });

  it("renders the full variant with the official brand tagline", () => {
    render(<ShopMateLogo variant="full" showTagline />);
    expect(screen.getByText("Shop smarter. Choose with confidence.")).toBeDefined();
  });

  it("applies sizing classes appropriately", () => {
    const { rerender } = render(<ShopMateLogo size="sm" />);
    let svg = screen.getByRole("img", { name: /shopmate ai/i });
    expect(svg.getAttribute("class")).toContain("h-7");

    rerender(<ShopMateLogo size="lg" />);
    svg = screen.getByRole("img", { name: /shopmate ai/i });
    expect(svg.getAttribute("class")).toContain("h-11");
  });

  it("supports custom className and preserves SVG viewBox for zero layout shift", () => {
    render(<ShopMateLogo className="custom-test-class" />);
    const svg = screen.getByRole("img", { name: /shopmate ai/i });
    expect(svg.getAttribute("class")).toContain("custom-test-class");
    expect(svg.getAttribute("viewBox")).toBeDefined();
  });
});
