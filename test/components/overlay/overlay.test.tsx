import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayPanel } from "../../../components/overlay/OverlayPanel";
import { OverlayBadge } from "../../../components/overlay/OverlayBadge";
import { makeObservation } from "../../helpers";

describe("OverlayPanel", () => {
  it("displays stats when available", () => {
    const history = [
      makeObservation({ priceCents: 300 }),
      makeObservation({ priceCents: 500 }),
    ];
    render(
      <OverlayPanel
        productName="Test Product"
        history={history}
        stats={{ min: 300, max: 500, avg: 400, count: 2 }}
        currentPriceCents={350}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Test Product")).toBeDefined();
    expect(screen.getByText("$3.50")).toBeDefined(); // Now
    expect(screen.getByText("$4.00")).toBeDefined(); // Avg
    expect(screen.getByText("$3.00")).toBeDefined(); // Low
    expect(screen.getByText("$5.00")).toBeDefined(); // High
    expect(screen.getByText(/Tracked 2 times/)).toBeDefined();
  });

  it("shows first-observation message when stats is null", () => {
    render(
      <OverlayPanel
        productName="Test Product"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/First observation recorded/)).toBeDefined();
  });

  it("shows community stats when quorum is met", () => {
    render(
      <OverlayPanel
        productName="Test"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={() => {}}
        communityStats={{
          productId: "woolworths:1",
          productName: "Test",
          brand: null,
          storeChain: "woolworths",
          quorum: true,
          currentMedianCents: 750,
          minCents: 700,
          maxCents: 800,
          observationCount: 10,
          contributorCount: 5,
          priceHistory: [],
          promoFrequency: {},
        }}
      />,
    );
    expect(screen.getByText("Community")).toBeDefined();
    expect(screen.getByText("$7.50")).toBeDefined(); // median
    expect(screen.getByText(/5 contributors/)).toBeDefined();
  });

  it("shows quorum message when quorum not met", () => {
    render(
      <OverlayPanel
        productName="Test"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={() => {}}
        communityStats={{
          productId: "woolworths:1",
          productName: "Test",
          brand: null,
          storeChain: "woolworths",
          quorum: false,
          currentMedianCents: null,
          minCents: null,
          maxCents: null,
          observationCount: 2,
          contributorCount: 2,
          priceHistory: [],
          promoFrequency: {},
        }}
      />,
    );
    expect(screen.getByText(/Not enough community data/)).toBeDefined();
    expect(screen.getByText(/2 of 3/)).toBeDefined();
  });

  it("shows loading spinner when communityLoading is true", () => {
    render(
      <OverlayPanel
        productName="Test"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={() => {}}
        communityLoading={true}
      />,
    );
    expect(screen.getByText("Community")).toBeDefined();
    expect(screen.getByText(/Loading/)).toBeDefined();
  });

  it("hides community section when no stats and not loading", () => {
    const { container } = render(
      <OverlayPanel
        productName="Test"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Community");
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <OverlayPanel
        productName="Test"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("OverlayBadge", () => {
  it("renders when not expanded", () => {
    render(
      <OverlayBadge isExpanded={false} priceBelowAvg={false} onClick={() => {}} />,
    );
    expect(screen.getByText("CC")).toBeDefined();
  });

  it("does not render when expanded", () => {
    const { container } = render(
      <OverlayBadge isExpanded={true} priceBelowAvg={false} onClick={() => {}} />,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <OverlayBadge isExpanded={false} priceBelowAvg={false} onClick={onClick} />,
    );
    fireEvent.click(screen.getByText("CC"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
