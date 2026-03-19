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

  it("shows community placeholder", () => {
    render(
      <OverlayPanel
        productName="Test"
        history={[]}
        stats={null}
        currentPriceCents={350}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Community data coming soon/)).toBeDefined();
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
