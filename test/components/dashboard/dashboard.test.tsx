import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ProductsView } from "@/components/dashboard/ProductsView";
import { ExportView } from "@/components/dashboard/ExportView";
import { OverviewView } from "@/components/dashboard/OverviewView";
import { ProductDetailView } from "@/components/dashboard/ProductDetailView";

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

describe("ProductsView", () => {
  it("renders loading state", () => {
    render(<ProductsView onSelectProduct={() => {}} />);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders empty state after loading", async () => {
    render(<ProductsView onSelectProduct={() => {}} />);
    expect(await screen.findByText(/no products tracked/i)).toBeDefined();
  });

  it("renders search input", async () => {
    render(<ProductsView onSelectProduct={() => {}} />);
    expect(
      await screen.findByPlaceholderText(/search products/i),
    ).toBeDefined();
  });
});

describe("ExportView", () => {
  it("renders export buttons", () => {
    render(<ExportView />);
    expect(screen.getByRole("button", { name: /json/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /csv/i })).toBeDefined();
  });

  it("renders description text", () => {
    render(<ExportView />);
    expect(screen.getByText(/download all your tracked/i)).toBeDefined();
  });
});

describe("OverviewView", () => {
  it("renders loading state initially", () => {
    render(<OverviewView onSelectProduct={() => {}} />);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders stats after loading", async () => {
    render(<OverviewView onSelectProduct={() => {}} />);
    expect(await screen.findByText("Products tracked")).toBeDefined();
  });

  it("renders empty state for price changes", async () => {
    render(<OverviewView onSelectProduct={() => {}} />);
    expect(
      await screen.findByText(/no price changes detected/i),
    ).toBeDefined();
  });
});

describe("ProductDetailView", () => {
  it("renders loading state", () => {
    render(
      <ProductDetailView productId="woolworths:123" onBack={() => {}} />,
    );
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders back button", () => {
    render(
      <ProductDetailView productId="woolworths:123" onBack={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
  });

  it("renders empty state for unknown product", async () => {
    render(
      <ProductDetailView productId="woolworths:999" onBack={() => {}} />,
    );
    expect(await screen.findByText(/no data found/i)).toBeDefined();
  });
});
