import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

// Mock the db module so Dexie doesn't try to open real IndexedDB during import
vi.mock("@/lib/db", () => ({
  db: {},
}));

// Mock data functions to prevent unhandled promise rejections from fake db
vi.mock("@/lib/data", () => ({
  getStorageStats: vi.fn().mockResolvedValue({
    totalObservations: 0,
    distinctProducts: 0,
    oldestDate: null,
    newestDate: null,
    byChain: {},
  }),
  getProductHistory: vi.fn().mockResolvedValue([]),
  getProductStats: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/data-dashboard", () => ({
  getAllProductSummaries: vi.fn().mockResolvedValue([]),
  getBiggestPriceChanges: vi.fn().mockResolvedValue([]),
}));

// Mock PriceChart since Chart.js canvas rendering doesn't work in happy-dom
vi.mock("@/components/dashboard/PriceChart", () => ({
  PriceChart: () => <div data-testid="price-chart" />,
}));

// Mock export functions
vi.mock("@/lib/export", () => ({
  exportAsJSON: vi.fn().mockResolvedValue("[]"),
  exportAsCSV: vi.fn().mockResolvedValue(""),
}));

describe("DashboardLayout", () => {
  it("renders the header and all tab buttons", () => {
    render(<DashboardLayout />);
    expect(screen.getByText("Chook Check")).toBeDefined();
    expect(screen.getByRole("tab", { name: /overview/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /products/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /export/i })).toBeDefined();
  });

  it("shows overview tab by default", () => {
    render(<DashboardLayout />);
    expect(
      screen.getByRole("tab", { name: /overview/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("switches tab when clicked", () => {
    render(<DashboardLayout />);
    fireEvent.click(screen.getByRole("tab", { name: /products/i }));
    expect(
      screen.getByRole("tab", { name: /products/i }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: /overview/i }).getAttribute("aria-selected"),
    ).toBe("false");
  });
});
