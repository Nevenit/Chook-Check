# Phase 5: Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full analytics dashboard as an extension page with product browsing, price history charts, insights, and data export.

**Architecture:** Tab-based single-page layout (no router library). Four views: Overview, All Products, Product Detail, and Export. All data reads go through the existing `lib/data.ts` layer (with new query functions added). Chart.js for price history line charts. CSS Modules for styling, consistent with popup.

**Tech Stack:** React 19, Chart.js 4, CSS Modules, Dexie.js (existing), Vitest + Testing Library

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/data-dashboard.ts` | Dashboard-specific queries: all products summary, biggest price changes, price change computation |
| `components/dashboard/DashboardLayout.tsx` | Top-level layout: header, tab bar, active view |
| `components/dashboard/DashboardLayout.module.css` | Layout styles |
| `components/dashboard/OverviewView.tsx` | Summary stats, biggest price changes cards, personalisation alerts |
| `components/dashboard/OverviewView.module.css` | Overview styles |
| `components/dashboard/ProductsView.tsx` | Searchable, sortable table of all tracked products |
| `components/dashboard/ProductsView.module.css` | Products table styles |
| `components/dashboard/ProductDetailView.tsx` | Single product: Chart.js line chart, stats, observation history |
| `components/dashboard/ProductDetailView.module.css` | Product detail styles |
| `components/dashboard/PriceChart.tsx` | Chart.js line chart wrapper (canvas-based, not testable in happy-dom) |
| `components/dashboard/PriceChart.module.css` | Chart container styles |
| `components/dashboard/ExportView.tsx` | JSON/CSV download buttons with status |
| `components/dashboard/ExportView.module.css` | Export view styles |
| `test/lib/data-dashboard.test.ts` | Tests for dashboard queries |
| `test/components/dashboard/dashboard.test.tsx` | Tests for dashboard components |

### Modified files

| File | Change |
|------|--------|
| `entrypoints/dashboard/App.tsx` | Replace placeholder with DashboardLayout |
| `entrypoints/dashboard/index.html` | Add base styles, wider viewport |
| `package.json` | Add `chart.js` dependency |

---

## Types

Used across dashboard components. Defined in `lib/data-dashboard.ts`:

```typescript
export interface ProductSummary {
  productId: string;
  productName: string;
  storeChain: "woolworths" | "coles";
  latestPriceCents: number;
  previousPriceCents: number | null;
  observationCount: number;
  lastObservedAt: string;
}

export interface PriceChange {
  productId: string;
  productName: string;
  storeChain: "woolworths" | "coles";
  oldPriceCents: number;
  newPriceCents: number;
  changeCents: number;
  changePercent: number;
  observedAt: string;
}
```

---

### Task 1: Install Chart.js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install chart.js**

Run:
```bash
npm install chart.js
```

- [ ] **Step 2: Verify build still works**

Run: `npx wxt build --browser chrome`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add chart.js dependency for dashboard"
```

---

### Task 2: Dashboard data queries

**Files:**
- Create: `lib/data-dashboard.ts`
- Test: `test/lib/data-dashboard.test.ts`

- [ ] **Step 1: Write failing tests for `getAllProductSummaries`**

Create `test/lib/data-dashboard.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "@/lib/db";
import { getAllProductSummaries, getBiggestPriceChanges } from "@/lib/data-dashboard";
import { makeObservation } from "../helpers";

describe("data-dashboard", () => {
  let db: ChookCheckDB;

  beforeEach(async () => {
    db = new ChookCheckDB("test-dashboard-" + Math.random());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe("getAllProductSummaries", () => {
    it("returns empty array when no data", async () => {
      const result = await getAllProductSummaries(db);
      expect(result).toEqual([]);
    });

    it("returns one summary per product with latest price", async () => {
      await db.priceObservations.bulkAdd([
        makeObservation({
          productId: "woolworths:123",
          productName: "Milk",
          priceCents: 300,
          observedAt: "2026-03-01T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:123",
          productName: "Milk",
          priceCents: 350,
          observedAt: "2026-03-10T00:00:00Z",
        }),
        makeObservation({
          productId: "coles:456",
          productName: "Bread",
          storeChain: "coles",
          priceCents: 500,
          observedAt: "2026-03-05T00:00:00Z",
        }),
      ]);

      const result = await getAllProductSummaries(db);
      expect(result).toHaveLength(2);

      const milk = result.find((p) => p.productId === "woolworths:123")!;
      expect(milk.latestPriceCents).toBe(350);
      expect(milk.previousPriceCents).toBe(300);
      expect(milk.observationCount).toBe(2);

      const bread = result.find((p) => p.productId === "coles:456")!;
      expect(bread.latestPriceCents).toBe(500);
      expect(bread.previousPriceCents).toBeNull();
      expect(bread.observationCount).toBe(1);
    });
  });

  describe("getBiggestPriceChanges", () => {
    it("returns empty array when no data", async () => {
      const result = await getBiggestPriceChanges(db, 5);
      expect(result).toEqual([]);
    });

    it("returns changes sorted by absolute change descending", async () => {
      await db.priceObservations.bulkAdd([
        // Small change product
        makeObservation({
          productId: "woolworths:1",
          productName: "Apple",
          priceCents: 100,
          observedAt: "2026-03-01T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:1",
          productName: "Apple",
          priceCents: 110,
          observedAt: "2026-03-10T00:00:00Z",
        }),
        // Big change product
        makeObservation({
          productId: "woolworths:2",
          productName: "Steak",
          priceCents: 1000,
          observedAt: "2026-03-01T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:2",
          productName: "Steak",
          priceCents: 1500,
          observedAt: "2026-03-10T00:00:00Z",
        }),
      ]);

      const result = await getBiggestPriceChanges(db, 5);
      expect(result).toHaveLength(2);
      expect(result[0].productId).toBe("woolworths:2");
      expect(result[0].changeCents).toBe(500);
      expect(result[1].productId).toBe("woolworths:1");
      expect(result[1].changeCents).toBe(10);
    });

    it("skips products with only one observation", async () => {
      await db.priceObservations.add(
        makeObservation({ productId: "woolworths:1", priceCents: 100 }),
      );

      const result = await getBiggestPriceChanges(db, 5);
      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/data-dashboard.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `lib/data-dashboard.ts`**

Create `lib/data-dashboard.ts`:

```typescript
import type { ChookCheckDB } from "./db";

export interface ProductSummary {
  productId: string;
  productName: string;
  storeChain: "woolworths" | "coles";
  latestPriceCents: number;
  previousPriceCents: number | null;
  observationCount: number;
  lastObservedAt: string;
}

export interface PriceChange {
  productId: string;
  productName: string;
  storeChain: "woolworths" | "coles";
  oldPriceCents: number;
  newPriceCents: number;
  changeCents: number;
  changePercent: number;
  observedAt: string;
}

export async function getAllProductSummaries(
  db: ChookCheckDB,
): Promise<ProductSummary[]> {
  const all = await db.priceObservations.orderBy("observedAt").toArray();
  const byProduct = new Map<
    string,
    { name: string; chain: "woolworths" | "coles"; prices: { cents: number; at: string }[] }
  >();

  for (const obs of all) {
    let entry = byProduct.get(obs.productId);
    if (!entry) {
      entry = { name: obs.productName, chain: obs.storeChain, prices: [] };
      byProduct.set(obs.productId, entry);
    }
    entry.prices.push({ cents: obs.priceCents, at: obs.observedAt });
  }

  const summaries: ProductSummary[] = [];
  for (const [productId, entry] of byProduct) {
    entry.prices.sort((a, b) => a.at.localeCompare(b.at));
    const latest = entry.prices[entry.prices.length - 1];
    const previous = entry.prices.length > 1 ? entry.prices[entry.prices.length - 2] : null;

    summaries.push({
      productId,
      productName: entry.name,
      storeChain: entry.chain,
      latestPriceCents: latest.cents,
      previousPriceCents: previous?.cents ?? null,
      observationCount: entry.prices.length,
      lastObservedAt: latest.at,
    });
  }

  return summaries;
}

export async function getBiggestPriceChanges(
  db: ChookCheckDB,
  limit: number,
): Promise<PriceChange[]> {
  const summaries = await getAllProductSummaries(db);
  const changes: PriceChange[] = [];

  for (const s of summaries) {
    if (s.previousPriceCents == null) continue;
    const changeCents = Math.abs(s.latestPriceCents - s.previousPriceCents);
    if (changeCents === 0) continue;

    changes.push({
      productId: s.productId,
      productName: s.productName,
      storeChain: s.storeChain,
      oldPriceCents: s.previousPriceCents,
      newPriceCents: s.latestPriceCents,
      changeCents,
      changePercent: Math.round((changeCents / s.previousPriceCents) * 100),
      observedAt: s.lastObservedAt,
    });
  }

  changes.sort((a, b) => b.changeCents - a.changeCents);
  return changes.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/data-dashboard.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add lib/data-dashboard.ts test/lib/data-dashboard.test.ts
git commit -m "feat: add dashboard data queries (product summaries, price changes)"
```

---

### Task 3: Dashboard layout and tab navigation

**Files:**
- Create: `components/dashboard/DashboardLayout.tsx`
- Create: `components/dashboard/DashboardLayout.module.css`
- Modify: `entrypoints/dashboard/App.tsx`
- Modify: `entrypoints/dashboard/index.html`
- Test: `test/components/dashboard/dashboard.test.tsx`

- [ ] **Step 1: Write failing tests for layout and tab switching**

Create `test/components/dashboard/dashboard.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Update `entrypoints/dashboard/index.html`**

Replace with wider viewport and base styles:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chook Check — Dashboard</title>
    <meta name="manifest.type" content="unlisted" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #1a1a1a;
        background: #fafafa;
        min-height: 100vh;
      }
      #root { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `DashboardLayout.module.css`**

Create `components/dashboard/DashboardLayout.module.css`:

```css
.header {
  margin-bottom: 24px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.subtitle {
  font-size: 13px;
  color: #666;
  margin: 0;
}

.tabBar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 24px;
}

.tab {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
}

.tab:hover {
  color: #1a1a1a;
}

.tabActive {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  background: none;
  border: none;
  margin-bottom: -2px;
  cursor: pointer;
  color: #1a7a2e;
  border-bottom: 2px solid #1a7a2e;
}
```

- [ ] **Step 5: Create `DashboardLayout.tsx`**

Create `components/dashboard/DashboardLayout.tsx`:

```tsx
import { useState } from "react";
import styles from "./DashboardLayout.module.css";
import { OverviewView } from "./OverviewView";
import { ProductsView } from "./ProductsView";
import { ProductDetailView } from "./ProductDetailView";
import { ExportView } from "./ExportView";

type Tab = "overview" | "products" | "export";

export function DashboardLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products" },
    { id: "export", label: "Export" },
  ];

  function handleSelectProduct(productId: string) {
    setSelectedProductId(productId);
    setActiveTab("products");
  }

  function handleBackToProducts() {
    setSelectedProductId(null);
  }

  return (
    <div>
      <header className={styles.header}>
        <h1 className={styles.title}>Chook Check</h1>
        <p className={styles.subtitle}>Price tracking dashboard</p>
      </header>

      <nav className={styles.tabBar} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={activeTab === t.id ? styles.tabActive : styles.tab}
            onClick={() => {
              setActiveTab(t.id);
              if (t.id !== "products") setSelectedProductId(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {activeTab === "overview" && (
          <OverviewView onSelectProduct={handleSelectProduct} />
        )}
        {activeTab === "products" && !selectedProductId && (
          <ProductsView onSelectProduct={handleSelectProduct} />
        )}
        {activeTab === "products" && selectedProductId && (
          <ProductDetailView
            productId={selectedProductId}
            onBack={handleBackToProducts}
          />
        )}
        {activeTab === "export" && <ExportView />}
      </div>
    </div>
  );
}
```

Note: This will fail to compile until Tasks 4-7 create the child view components. For this task, create stub versions of each view so tests pass:

Create `components/dashboard/OverviewView.tsx`:
```tsx
export function OverviewView(_props: { onSelectProduct: (id: string) => void }) {
  return <div>Overview placeholder</div>;
}
```

Create `components/dashboard/ProductsView.tsx`:
```tsx
export function ProductsView(_props: { onSelectProduct: (id: string) => void }) {
  return <div>Products placeholder</div>;
}
```

Create `components/dashboard/ProductDetailView.tsx`:
```tsx
export function ProductDetailView(_props: { productId: string; onBack: () => void }) {
  return <div>Product detail placeholder</div>;
}
```

Create `components/dashboard/ExportView.tsx`:
```tsx
export function ExportView() {
  return <div>Export placeholder</div>;
}
```

- [ ] **Step 6: Update `entrypoints/dashboard/App.tsx`**

```tsx
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export default function App() {
  return <DashboardLayout />;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: all pass

- [ ] **Step 8: Run full test suite**

Run: `npx vitest run`
Expected: all 152+ tests pass

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/ entrypoints/dashboard/ test/components/dashboard/
git commit -m "feat: add dashboard layout with tab navigation"
```

---

### Task 4: Overview view

**Files:**
- Replace stub: `components/dashboard/OverviewView.tsx`
- Create: `components/dashboard/OverviewView.module.css`
- Add tests to: `test/components/dashboard/dashboard.test.tsx`

This view shows: summary stats bar (reuses existing data), biggest price changes cards, and a personalisation alerts section (placeholder for community data in Phase 8).

- [ ] **Step 1: Add failing tests for overview view**

Append the following `describe` block to the end of `test/components/dashboard/dashboard.test.tsx` (imports are already at the top from Task 3):

```tsx
// Add this import at the top of the file alongside existing imports:
import { OverviewView } from "@/components/dashboard/OverviewView";

// Append this describe block at the end of the file:
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
```

Note: The data functions are already mocked at the top of the test file (from Task 3), returning empty results. The `findByText` queries wait for the async data load to complete.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: FAIL — "loading" text not found (stub just says "Overview placeholder")

- [ ] **Step 3: Create `OverviewView.module.css`**

Create `components/dashboard/OverviewView.module.css`:

```css
.section {
  margin-bottom: 24px;
}

.sectionTitle {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.statsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.statCard {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
}

.statValue {
  font-size: 24px;
  font-weight: 700;
}

.statLabel {
  font-size: 12px;
  color: #666;
}

.changeCard {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  cursor: pointer;
}

.changeCard:hover {
  border-color: #1a7a2e;
}

.changeHeader {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.changeName {
  font-weight: 500;
  font-size: 14px;
}

.changeAmount {
  font-weight: 600;
  font-size: 14px;
}

.changeUp {
  color: #d32f2f;
}

.changeDown {
  color: #1a7a2e;
}

.changeMeta {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.emptyState {
  color: #888;
  font-size: 14px;
  padding: 16px 0;
}

.loading {
  color: #888;
  font-size: 14px;
  padding: 24px 0;
}
```

- [ ] **Step 4: Implement `OverviewView.tsx`**

Replace stub `components/dashboard/OverviewView.tsx`:

```tsx
import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getStorageStats } from "@/lib/data";
import {
  getBiggestPriceChanges,
  type PriceChange,
} from "@/lib/data-dashboard";
import { formatPrice } from "@/components/shared/formatPrice";
import { formatRelativeTime } from "@/components/shared/formatTime";
import styles from "./OverviewView.module.css";

interface OverviewViewProps {
  onSelectProduct: (productId: string) => void;
}

export function OverviewView({ onSelectProduct }: OverviewViewProps) {
  const [stats, setStats] = useState<{
    distinctProducts: number;
    totalObservations: number;
    byChain: Record<string, number>;
    newestDate: string | null;
  } | null>(null);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStorageStats(db), getBiggestPriceChanges(db, 5)])
      .then(([s, c]) => {
        setStats(s);
        setChanges(c);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className={styles.loading}>Loading...</p>;

  return (
    <div>
      <section className={styles.section}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats?.distinctProducts ?? 0}</div>
            <div className={styles.statLabel}>Products tracked</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats?.totalObservations ?? 0}</div>
            <div className={styles.statLabel}>Price observations</div>
          </div>
          {Object.entries(stats?.byChain ?? {}).map(([chain, count]) => (
            <div key={chain} className={styles.statCard}>
              <div className={styles.statValue}>{count}</div>
              <div className={styles.statLabel}>
                {chain.charAt(0).toUpperCase() + chain.slice(1)}
              </div>
            </div>
          ))}
        </div>
        {stats?.newestDate && (
          <p className={styles.changeMeta}>
            Last updated {formatRelativeTime(stats.newestDate)}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Biggest price changes</h2>
        {changes.length === 0 ? (
          <p className={styles.emptyState}>
            No price changes detected yet. Keep browsing to build history.
          </p>
        ) : (
          changes.map((c) => {
            const isIncrease = c.newPriceCents > c.oldPriceCents;
            return (
              <div
                key={c.productId}
                className={styles.changeCard}
                onClick={() => onSelectProduct(c.productId)}
              >
                <div className={styles.changeHeader}>
                  <span className={styles.changeName}>{c.productName}</span>
                  <span
                    className={`${styles.changeAmount} ${isIncrease ? styles.changeUp : styles.changeDown}`}
                  >
                    {isIncrease ? "+" : "-"}
                    {formatPrice(c.changeCents)} ({c.changePercent}%)
                  </span>
                </div>
                <div className={styles.changeMeta}>
                  {formatPrice(c.oldPriceCents)} → {formatPrice(c.newPriceCents)}
                  {" · "}
                  {c.storeChain.charAt(0).toUpperCase() + c.storeChain.slice(1)}
                  {" · "}
                  {formatRelativeTime(c.observedAt)}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Personalisation alerts</h2>
        <p className={styles.emptyState}>
          Community comparison coming soon — contribute your data to help detect personalised pricing.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/OverviewView.module.css test/components/dashboard/dashboard.test.tsx
git commit -m "feat: add dashboard overview view with stats and price changes"
```

---

### Task 5: All Products view

**Files:**
- Replace stub: `components/dashboard/ProductsView.tsx`
- Create: `components/dashboard/ProductsView.module.css`
- Add tests to: `test/components/dashboard/dashboard.test.tsx`

Searchable, sortable table of all tracked products. Columns: product name, chain, latest price, change, observations, last seen. Click a row to open product detail.

- [ ] **Step 1: Add failing tests**

Append the following to `test/components/dashboard/dashboard.test.tsx` (add import at top, describe block at end):

```tsx
// Add this import at the top of the file:
import { ProductsView } from "@/components/dashboard/ProductsView";

// Append this describe block at the end:
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: FAIL — stub doesn't show "loading"

- [ ] **Step 3: Create `ProductsView.module.css`**

Create `components/dashboard/ProductsView.module.css`:

```css
.searchBar {
  margin-bottom: 16px;
}

.searchInput {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  outline: none;
}

.searchInput:focus {
  border-color: #1a7a2e;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  padding: 8px 12px;
  border-bottom: 2px solid #e0e0e0;
  cursor: pointer;
  user-select: none;
}

.table th:hover {
  color: #1a1a1a;
}

.sortIndicator {
  margin-left: 4px;
  font-size: 10px;
}

.table td {
  padding: 10px 12px;
  font-size: 14px;
  border-bottom: 1px solid #f0f0f0;
}

.row {
  cursor: pointer;
}

.row:hover {
  background: #f5f5f5;
}

.chain {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #666;
}

.changeUp {
  color: #d32f2f;
  font-size: 12px;
}

.changeDown {
  color: #1a7a2e;
  font-size: 12px;
}

.changeNone {
  color: #999;
  font-size: 12px;
}

.emptyState {
  color: #888;
  font-size: 14px;
  padding: 24px 0;
  text-align: center;
}

.loading {
  color: #888;
  font-size: 14px;
  padding: 24px 0;
}
```

- [ ] **Step 4: Implement `ProductsView.tsx`**

Replace stub `components/dashboard/ProductsView.tsx`:

```tsx
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/db";
import {
  getAllProductSummaries,
  type ProductSummary,
} from "@/lib/data-dashboard";
import { formatPrice } from "@/components/shared/formatPrice";
import { formatRelativeTime } from "@/components/shared/formatTime";
import styles from "./ProductsView.module.css";

type SortKey = "name" | "chain" | "price" | "change" | "count" | "lastSeen";
type SortDir = "asc" | "desc";

interface ProductsViewProps {
  onSelectProduct: (productId: string) => void;
}

export function ProductsView({ onSelectProduct }: ProductsViewProps) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastSeen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    getAllProductSummaries(db)
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? products.filter((p) => p.productName.toLowerCase().includes(q))
      : products;
  }, [products, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.productName.localeCompare(b.productName);
          break;
        case "chain":
          cmp = a.storeChain.localeCompare(b.storeChain);
          break;
        case "price":
          cmp = a.latestPriceCents - b.latestPriceCents;
          break;
        case "change": {
          const ac = a.previousPriceCents != null ? a.latestPriceCents - a.previousPriceCents : 0;
          const bc = b.previousPriceCents != null ? b.latestPriceCents - b.previousPriceCents : 0;
          cmp = ac - bc;
          break;
        }
        case "count":
          cmp = a.observationCount - b.observationCount;
          break;
        case "lastSeen":
          cmp = a.lastObservedAt.localeCompare(b.lastObservedAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "chain" ? "asc" : "desc");
    }
  }

  function renderSortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return (
      <span className={styles.sortIndicator}>
        {sortDir === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  }

  if (loading) return <p className={styles.loading}>Loading...</p>;

  return (
    <div>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {sorted.length === 0 ? (
        <p className={styles.emptyState}>
          {search ? "No products match your search." : "No products tracked yet."}
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th onClick={() => handleSort("name")}>Product{renderSortIndicator("name")}</th>
              <th onClick={() => handleSort("chain")}>Chain{renderSortIndicator("chain")}</th>
              <th onClick={() => handleSort("price")}>Price{renderSortIndicator("price")}</th>
              <th onClick={() => handleSort("change")}>Change{renderSortIndicator("change")}</th>
              <th onClick={() => handleSort("count")}>Obs{renderSortIndicator("count")}</th>
              <th onClick={() => handleSort("lastSeen")}>Last Seen{renderSortIndicator("lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const changeCents = p.previousPriceCents != null
                ? p.latestPriceCents - p.previousPriceCents
                : null;
              return (
                <tr
                  key={p.productId}
                  className={styles.row}
                  onClick={() => onSelectProduct(p.productId)}
                >
                  <td>{p.productName}</td>
                  <td>
                    <span className={styles.chain}>{p.storeChain}</span>
                  </td>
                  <td>{formatPrice(p.latestPriceCents)}</td>
                  <td>
                    {changeCents == null || changeCents === 0 ? (
                      <span className={styles.changeNone}>—</span>
                    ) : changeCents > 0 ? (
                      <span className={styles.changeUp}>+{formatPrice(changeCents)}</span>
                    ) : (
                      <span className={styles.changeDown}>-{formatPrice(Math.abs(changeCents))}</span>
                    )}
                  </td>
                  <td>{p.observationCount}</td>
                  <td>{formatRelativeTime(p.lastObservedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/ProductsView.tsx components/dashboard/ProductsView.module.css test/components/dashboard/dashboard.test.tsx
git commit -m "feat: add products table view with search, sort, and filtering"
```

---

### Task 6: Price chart component

**Files:**
- Create: `components/dashboard/PriceChart.tsx`
- Create: `components/dashboard/PriceChart.module.css`

This is a Chart.js canvas wrapper. Canvas rendering doesn't work in happy-dom, so this component is not unit-tested — it's tested via the build and manual testing. The data transformation logic lives in `data-dashboard.ts` (already tested).

- [ ] **Step 1: Create `PriceChart.module.css`**

Create `components/dashboard/PriceChart.module.css`:

```css
.container {
  position: relative;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.canvas {
  width: 100%;
  max-height: 300px;
}
```

- [ ] **Step 2: Create `PriceChart.tsx`**

Create `components/dashboard/PriceChart.tsx`:

```tsx
import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import type { PriceObservation } from "@/lib/types";
import styles from "./PriceChart.module.css";

Chart.register(...registerables);

interface PriceChartProps {
  observations: PriceObservation[];
}

export function PriceChart({ observations }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || observations.length === 0) return;

    const sorted = [...observations].sort((a, b) =>
      a.observedAt.localeCompare(b.observedAt),
    );

    const labels = sorted.map((o) =>
      new Date(o.observedAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      }),
    );
    const data = sorted.map((o) => o.priceCents / 100);

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Price ($)",
            data,
            borderColor: "#1a7a2e",
            backgroundColor: "rgba(26, 122, 46, 0.1)",
            fill: true,
            tension: 0.2,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (val) => `$${(val as number).toFixed(2)}`,
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [observations]);

  if (observations.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} height={300} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx wxt build --browser chrome`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/PriceChart.tsx components/dashboard/PriceChart.module.css
git commit -m "feat: add Chart.js price history chart component"
```

---

### Task 7: Product detail view

**Files:**
- Replace stub: `components/dashboard/ProductDetailView.tsx`
- Create: `components/dashboard/ProductDetailView.module.css`
- Add tests to: `test/components/dashboard/dashboard.test.tsx`

Shows: back button, product name, price chart, stats grid (min/max/avg/count), observation history table.

- [ ] **Step 1: Add failing tests**

Append the following to `test/components/dashboard/dashboard.test.tsx` (add import at top, describe block at end):

```tsx
// Add this import at the top of the file:
import { ProductDetailView } from "@/components/dashboard/ProductDetailView";

// Append this describe block at the end:
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
```

Note: The `PriceChart` component is already mocked at the top of the file (from Task 3), so Chart.js canvas APIs won't be accessed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: FAIL — stub doesn't render loading or back button

- [ ] **Step 3: Create `ProductDetailView.module.css`**

Create `components/dashboard/ProductDetailView.module.css`:

```css
.backButton {
  background: none;
  border: none;
  color: #1a7a2e;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;
}

.backButton:hover {
  text-decoration: underline;
}

.productName {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}

.productChain {
  font-size: 13px;
  color: #666;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 16px;
}

.statsGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.statCard {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.statValue {
  font-size: 20px;
  font-weight: 700;
}

.statLabel {
  font-size: 11px;
  color: #666;
}

.sectionTitle {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.historyTable {
  width: 100%;
  border-collapse: collapse;
}

.historyTable th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  padding: 8px 12px;
  border-bottom: 2px solid #e0e0e0;
}

.historyTable td {
  padding: 8px 12px;
  font-size: 14px;
  border-bottom: 1px solid #f0f0f0;
}

.loading {
  color: #888;
  font-size: 14px;
  padding: 24px 0;
}

.emptyState {
  color: #888;
  font-size: 14px;
  padding: 16px 0;
}
```

- [ ] **Step 4: Implement `ProductDetailView.tsx`**

Replace stub `components/dashboard/ProductDetailView.tsx`:

```tsx
import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getProductHistory, getProductStats } from "@/lib/data";
import { formatPrice } from "@/components/shared/formatPrice";
import { PriceChart } from "./PriceChart";
import type { PriceObservation } from "@/lib/types";
import styles from "./ProductDetailView.module.css";

interface ProductDetailViewProps {
  productId: string;
  onBack: () => void;
}

export function ProductDetailView({ productId, onBack }: ProductDetailViewProps) {
  const [history, setHistory] = useState<PriceObservation[]>([]);
  const [stats, setStats] = useState<{
    min: number;
    max: number;
    avg: number;
    count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProductHistory(db, productId), getProductStats(db, productId)])
      .then(([h, s]) => {
        setHistory(h);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  const latest = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div>
      <button className={styles.backButton} onClick={onBack}>
        ← Back to products
      </button>

      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : !latest ? (
        <p className={styles.emptyState}>No data found for this product.</p>
      ) : (
        <>
          <h2 className={styles.productName}>{latest.productName}</h2>
          <p className={styles.productChain}>{latest.storeChain}</p>

          <PriceChart observations={history} />

          {stats && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{formatPrice(stats.min)}</div>
                <div className={styles.statLabel}>Lowest</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{formatPrice(stats.avg)}</div>
                <div className={styles.statLabel}>Average</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{formatPrice(stats.max)}</div>
                <div className={styles.statLabel}>Highest</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.count}</div>
                <div className={styles.statLabel}>Observations</div>
              </div>
            </div>
          )}

          <h3 className={styles.sectionTitle}>Community comparison</h3>
          <p className={styles.emptyState}>
            Community price comparison coming soon.
          </p>

          <h3 className={styles.sectionTitle}>Observation history</h3>
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Price</th>
                <th>Was Price</th>
                <th>Unit Price</th>
                <th>Promo</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((obs, i) => (
                <tr key={obs.id ?? i}>
                  <td>
                    {new Date(obs.observedAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{formatPrice(obs.priceCents)}</td>
                  <td>{obs.wasPriceCents ? formatPrice(obs.wasPriceCents) : "—"}</td>
                  <td>
                    {obs.unitPriceCents
                      ? `${formatPrice(obs.unitPriceCents)}${obs.unitMeasure ? ` / ${obs.unitMeasure}` : ""}`
                      : "—"}
                  </td>
                  <td>{obs.promoType ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/ProductDetailView.tsx components/dashboard/ProductDetailView.module.css test/components/dashboard/dashboard.test.tsx
git commit -m "feat: add product detail view with chart, stats, and history"
```

---

### Task 8: Export view

**Files:**
- Replace stub: `components/dashboard/ExportView.tsx`
- Create: `components/dashboard/ExportView.module.css`
- Add tests to: `test/components/dashboard/dashboard.test.tsx`

JSON and CSV download buttons. Uses existing `lib/export.ts` functions.

- [ ] **Step 1: Add failing tests**

Append the following to `test/components/dashboard/dashboard.test.tsx` (add import at top, describe block at end):

```tsx
// Add this import at the top of the file:
import { ExportView } from "@/components/dashboard/ExportView";

// Append this describe block at the end:
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: FAIL — stub doesn't render buttons

- [ ] **Step 3: Create `ExportView.module.css`**

Create `components/dashboard/ExportView.module.css`:

```css
.container {
  max-width: 480px;
}

.description {
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
}

.buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.button {
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.button:hover {
  border-color: #1a7a2e;
  color: #1a7a2e;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  font-size: 13px;
  color: #1a7a2e;
}
```

- [ ] **Step 4: Implement `ExportView.tsx`**

Replace stub `components/dashboard/ExportView.tsx`:

```tsx
import { useState } from "react";
import { db } from "@/lib/db";
import { exportAsJSON, exportAsCSV } from "@/lib/export";
import styles from "./ExportView.module.css";

export function ExportView() {
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport(format: "json" | "csv") {
    setExporting(true);
    setStatus(null);
    try {
      const content =
        format === "json" ? await exportAsJSON(db) : await exportAsCSV(db);

      if (!content || content === "[]" || content === "") {
        setStatus("No data to export.");
        return;
      }

      const blob = new Blob([content], {
        type: format === "json" ? "application/json" : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chook-check-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Exported as ${format.toUpperCase()}.`);
    } catch {
      setStatus("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Download all your tracked price observations as JSON or CSV.
      </p>
      <div className={styles.buttons}>
        <button
          className={styles.button}
          onClick={() => handleExport("json")}
          disabled={exporting}
        >
          Export JSON
        </button>
        <button
          className={styles.button}
          onClick={() => handleExport("csv")}
          disabled={exporting}
        >
          Export CSV
        </button>
      </div>
      {status && <p className={styles.status}>{status}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/components/dashboard/dashboard.test.tsx`
Expected: all pass

- [ ] **Step 6: Run full test suite and build**

Run: `npx vitest run && npx wxt build --browser chrome`
Expected: all tests pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/ExportView.tsx components/dashboard/ExportView.module.css test/components/dashboard/dashboard.test.tsx
git commit -m "feat: add export view with JSON and CSV download"
```

---

## Post-implementation checklist

After all 8 tasks are complete:

1. Run full test suite: `npx vitest run` — all tests pass
2. Run lint: `npx eslint .` — no errors
3. Build Chrome: `npx wxt build` — success
4. Build Firefox: `npx wxt build -b firefox` — success
5. Manual test in Chrome:
   - Load extension, click popup → Dashboard link opens dashboard page
   - Overview tab shows stats and price changes
   - Click a price change card → navigates to product detail
   - Product detail shows Chart.js line chart, stats grid, observation table
   - Back button returns to products table
   - Products tab shows searchable, sortable table
   - Search filters products, column headers sort
   - Export tab → JSON and CSV buttons trigger downloads
6. Verify no console errors in the dashboard page
