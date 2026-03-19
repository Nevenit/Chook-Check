import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PopupHeader } from "../../../components/popup/PopupHeader";
import { StatsBar } from "../../../components/popup/StatsBar";
import { ObservationItem } from "../../../components/popup/ObservationItem";
import { ObservationList } from "../../../components/popup/ObservationList";
import { PopupFooter } from "../../../components/popup/PopupFooter";
import { makeObservation } from "../../helpers";

describe("PopupHeader", () => {
  it("renders the title and tagline", () => {
    render(<PopupHeader />);
    expect(screen.getByText("Chook Check")).toBeDefined();
    expect(screen.getByText("Tracking Australian prices")).toBeDefined();
  });
});

describe("StatsBar", () => {
  it("displays product and observation counts", () => {
    render(
      <StatsBar
        distinctProducts={12}
        totalObservations={47}
        byChain={{ woolworths: 32, coles: 15 }}
      />,
    );
    expect(screen.getByText(/12 products/)).toBeDefined();
    expect(screen.getByText(/47 prices/)).toBeDefined();
  });

  it("displays per-chain breakdown", () => {
    render(
      <StatsBar
        distinctProducts={5}
        totalObservations={10}
        byChain={{ woolworths: 7, coles: 3 }}
      />,
    );
    expect(screen.getByText(/Woolworths: 7/)).toBeDefined();
    expect(screen.getByText(/Coles: 3/)).toBeDefined();
  });

  it("handles zero state", () => {
    render(
      <StatsBar distinctProducts={0} totalObservations={0} byChain={{}} />,
    );
    expect(screen.getByText(/0 products/)).toBeDefined();
    expect(screen.getByText(/0 prices/)).toBeDefined();
  });

  it("shows dashes on error", () => {
    render(
      <StatsBar distinctProducts={-1} totalObservations={-1} byChain={{}} />,
    );
    const dashes = screen.getAllByText("\u2014");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ObservationItem", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("displays product name and formatted price", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:05:00.000Z"));

    const obs = makeObservation({
      productName: "Coca-Cola 1.25L",
      priceCents: 420,
      storeChain: "woolworths",
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    render(<ObservationItem observation={obs} />);
    expect(screen.getByText("Coca-Cola 1.25L")).toBeDefined();
    expect(screen.getByText("$4.20")).toBeDefined();
    expect(screen.getByText(/woolworths/)).toBeDefined();
    expect(screen.getByText(/5 min ago/)).toBeDefined();
  });
});

describe("ObservationList", () => {
  it("shows empty state when no observations", () => {
    render(<ObservationList observations={[]} />);
    expect(screen.getByText(/Visit a Woolworths or Coles/)).toBeDefined();
  });

  it("renders observation items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:10:00.000Z"));

    const observations = [
      makeObservation({ productName: "Product A", observedAt: "2026-03-18T12:00:00.000Z" }),
      makeObservation({ productName: "Product B", observedAt: "2026-03-18T11:00:00.000Z" }),
    ];
    render(<ObservationList observations={observations} />);
    expect(screen.getByText("Product A")).toBeDefined();
    expect(screen.getByText("Product B")).toBeDefined();

    vi.useRealTimers();
  });
});

describe("PopupFooter", () => {
  it("renders dashboard and settings links", () => {
    render(<PopupFooter />);
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("renders contribution call-to-action", () => {
    render(<PopupFooter />);
    expect(screen.getByText(/Help other Australians/)).toBeDefined();
  });
});
