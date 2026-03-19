# Phase 4: Popup & Product Page Overlay — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the popup (extension icon click) and product page overlay (injected badge + panel on Woolworths/Coles pages) so users can see their collected price data.

**Architecture:** The popup reads directly from IndexedDB via Dexie. The overlay is a content script that communicates with the background service worker via message passing (`GET_PRODUCT_DATA`). The overlay uses Shadow DOM for style isolation and a hand-rolled SVG sparkline. CSS Modules for popup; plain CSS with `?inline` imports for overlay. (Deviation from spec: the spec says "CSS Modules for all components", but inside Shadow DOM, CSS Modules' class-name scoping is redundant since Shadow DOM already isolates styles. Plain CSS with `?inline` avoids the complexity of dual-importing `.module.css` files and is the standard pattern for Shadow DOM.)

**Tech Stack:** React 19, CSS Modules, Dexie.js, WXT, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-18-popup-overlay-design.md`

**Dependencies:** Tasks 1-4 are shared infrastructure (do first). Tasks 5 and 6-8 are independent and can be parallelised. Within overlay tasks, 6 → 7 → 8.

---

### Task 1: Shared formatting utilities

**Files:**
- Create: `components/shared/formatPrice.ts`
- Create: `components/shared/formatTime.ts`
- Create: `test/components/shared/formatPrice.test.ts`
- Create: `test/components/shared/formatTime.test.ts`

- [ ] **Step 1: Write formatPrice tests**

```typescript
// test/components/shared/formatPrice.test.ts
import { describe, it, expect } from "vitest";
import { formatPrice } from "../../../components/shared/formatPrice";

describe("formatPrice", () => {
  it("formats cents to dollar string", () => {
    expect(formatPrice(350)).toBe("$3.50");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("formats large amounts", () => {
    expect(formatPrice(12345)).toBe("$123.45");
  });

  it("formats single digit cents", () => {
    expect(formatPrice(5)).toBe("$0.05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/components/shared/formatPrice.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement formatPrice**

```typescript
// components/shared/formatPrice.ts
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/components/shared/formatPrice.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Write formatRelativeTime tests**

```typescript
// test/components/shared/formatTime.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "../../../components/shared/formatTime";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps under 60 seconds ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:30.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("just now");
  });

  it("returns minutes for timestamps under an hour ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:05:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("5 min ago");
  });

  it("returns hours for timestamps under a day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T15:00:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("3 hr ago");
  });

  it("returns 'yesterday' for 1 day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("yesterday");
  });

  it("returns days for older timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T12:00:00.000Z"));
    expect(formatRelativeTime("2026-03-18T12:00:00.000Z")).toBe("5 days ago");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run test/components/shared/formatTime.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement formatRelativeTime**

```typescript
// components/shared/formatTime.ts
export function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay === 1) return "yesterday";
  return `${diffDay} days ago`;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run test/components/shared/formatTime.test.ts`
Expected: 5 tests PASS

- [ ] **Step 9: Run all tests, lint, commit**

Run: `npx vitest run && npx eslint .`
Expected: All tests PASS, no lint errors

```bash
git add components/shared/ test/components/
git commit -m "feat: add formatPrice and formatRelativeTime shared utilities"
```

---

### Task 2: Product ID extraction

Extract SKU-from-URL functions from both scrapers into a shared module. Add `getProductIdFromUrl` for the overlay.

**Files:**
- Create: `lib/product-id.ts`
- Create: `test/lib/product-id.test.ts`
- Modify: `lib/scrapers/woolworths.ts` — remove local `extractSkuFromUrl`, import from `../product-id`
- Modify: `lib/scrapers/coles.ts` — remove local `extractSkuFromUrl`, import from `../product-id`

- [ ] **Step 1: Write product-id tests**

```typescript
// test/lib/product-id.test.ts
import { describe, it, expect } from "vitest";
import {
  extractWoolworthsSku,
  extractColesSku,
  getProductIdFromUrl,
} from "../../lib/product-id";

describe("extractWoolworthsSku", () => {
  it("extracts SKU from product page URL", () => {
    expect(
      extractWoolworthsSku("https://www.woolworths.com.au/shop/productdetails/32731/coca-cola"),
    ).toBe("32731");
  });

  it("returns null for non-product URLs", () => {
    expect(
      extractWoolworthsSku("https://www.woolworths.com.au/shop/browse/drinks"),
    ).toBeNull();
  });
});

describe("extractColesSku", () => {
  it("extracts SKU from product page URL", () => {
    expect(
      extractColesSku("https://www.coles.com.au/product/coca-cola-classic-1234567"),
    ).toBe("1234567");
  });

  it("extracts SKU with query params", () => {
    expect(
      extractColesSku("https://www.coles.com.au/product/milk-2l-9876543?pid=abc"),
    ).toBe("9876543");
  });

  it("returns null for non-product URLs", () => {
    expect(
      extractColesSku("https://www.coles.com.au/browse/dairy"),
    ).toBeNull();
  });
});

describe("getProductIdFromUrl", () => {
  it("returns prefixed woolworths product ID", () => {
    expect(
      getProductIdFromUrl("https://www.woolworths.com.au/shop/productdetails/32731/coca-cola"),
    ).toBe("woolworths:32731");
  });

  it("returns prefixed coles product ID", () => {
    expect(
      getProductIdFromUrl("https://www.coles.com.au/product/coca-cola-1234567"),
    ).toBe("coles:1234567");
  });

  it("returns null for unknown domains", () => {
    expect(
      getProductIdFromUrl("https://www.example.com/product/123"),
    ).toBeNull();
  });

  it("returns null for non-product pages", () => {
    expect(
      getProductIdFromUrl("https://www.woolworths.com.au/shop/browse/drinks"),
    ).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(getProductIdFromUrl("not-a-url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/product-id.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement product-id module**

```typescript
// lib/product-id.ts

export function extractWoolworthsSku(url: string): string | null {
  const match = url.match(/\/shop\/productdetails\/(\d+)/);
  return match ? match[1] : null;
}

export function extractColesSku(url: string): string | null {
  const match = url.match(/\/product\/.*?-(\d+)(?:\?|$)/);
  return match ? match[1] : null;
}

export function getProductIdFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("woolworths.com.au")) {
      const sku = extractWoolworthsSku(url);
      return sku ? `woolworths:${sku}` : null;
    }
    if (hostname.includes("coles.com.au")) {
      const sku = extractColesSku(url);
      return sku ? `coles:${sku}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/product-id.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Refactor woolworths scraper**

In `lib/scrapers/woolworths.ts`:
- Add import: `import { extractWoolworthsSku } from "../product-id";`
- Remove the local `function extractSkuFromUrl(url: string): string | null { ... }` (lines 80-84)
- In the fallback expression (`const sku = jsonLd.sku != null ? String(jsonLd.sku) : extractSkuFromUrl(url);`), replace `extractSkuFromUrl` with `extractWoolworthsSku`

- [ ] **Step 6: Refactor coles scraper**

In `lib/scrapers/coles.ts`:
- Add import: `import { extractColesSku } from "../product-id";`
- Remove the local `function extractSkuFromUrl(url: string): string | null { ... }` (lines 84-88)
- Replace `extractSkuFromUrl(url)` call on line 22 with `extractColesSku(url)`

- [ ] **Step 7: Run all tests, lint, commit**

Run: `npx vitest run && npx eslint .`
Expected: All tests PASS (existing scraper tests still pass), no lint errors

```bash
git add lib/product-id.ts lib/scrapers/woolworths.ts lib/scrapers/coles.ts test/lib/product-id.test.ts
git commit -m "refactor: extract SKU-from-URL into shared product-id module"
```

---

### Task 3: Refactor onUrlChange for multiple listeners

The current `onUrlChange` monkey-patches `pushState`/`replaceState` per caller. Multiple callers overwrite each other. Refactor to patch once and dispatch a `CustomEvent`.

**Files:**
- Modify: `lib/navigation.ts`
- Modify: `test/lib/navigation.test.ts` (add multi-listener test)

- [ ] **Step 1: Read existing navigation test**

Read `test/lib/navigation.test.ts` to understand current test structure.

- [ ] **Step 2: Add multi-listener test**

Append to `test/lib/navigation.test.ts`:

```typescript
it("supports multiple listeners without overwriting", async () => {
  const calls1: string[] = [];
  const calls2: string[] = [];

  const cleanup1 = onUrlChange((url) => calls1.push(url));
  const cleanup2 = onUrlChange((url) => calls2.push(url));

  history.pushState({}, "", "/multi-test");

  await vi.waitFor(() => {
    expect(calls1).toHaveLength(1);
    expect(calls2).toHaveLength(1);
  }, { timeout: 2000 });

  expect(calls1[0]).toContain("/multi-test");
  expect(calls2[0]).toContain("/multi-test");

  cleanup1();
  cleanup2();
});
```

- [ ] **Step 3: Run new test to verify it fails**

Run: `npx vitest run test/lib/navigation.test.ts`
Expected: The new multi-listener test FAILS (second `onUrlChange` overwrites first's patches)

- [ ] **Step 4: Refactor onUrlChange**

Replace the `onUrlChange` function in `lib/navigation.ts` with:

```typescript
const URL_CHANGE_EVENT = "chook-check:url-change";
let patched = false;
let listenerCount = 0;
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;

function dispatchUrlChange(): void {
  window.dispatchEvent(new CustomEvent(URL_CHANGE_EVENT));
}

function ensurePatched(): void {
  if (patched) return;
  patched = true;

  originalPushState = history.pushState.bind(history);
  originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    originalPushState!(...args);
    dispatchUrlChange();
  };

  history.replaceState = (
    ...args: Parameters<typeof history.replaceState>
  ) => {
    originalReplaceState!(...args);
    dispatchUrlChange();
  };

  window.addEventListener("popstate", dispatchUrlChange);
}

function restorePatches(): void {
  if (!patched) return;
  if (originalPushState) history.pushState = originalPushState;
  if (originalReplaceState) history.replaceState = originalReplaceState;
  window.removeEventListener("popstate", dispatchUrlChange);
  patched = false;
  originalPushState = null;
  originalReplaceState = null;
}

/**
 * Listens for client-side URL changes (SPA navigation).
 * Patches pushState/replaceState once, dispatches a custom event.
 * Multiple callers each get their own debounced listener.
 * Returns a cleanup function; when all listeners are removed, restores originals.
 */
export function onUrlChange(callback: (url: string) => void): () => void {
  ensurePatched();
  listenerCount++;

  let debounceTimer: ReturnType<typeof setTimeout>;

  const handler = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(window.location.href);
    }, 500);
  };

  window.addEventListener(URL_CHANGE_EVENT, handler);

  return () => {
    clearTimeout(debounceTimer);
    window.removeEventListener(URL_CHANGE_EVENT, handler);
    listenerCount--;
    if (listenerCount === 0) {
      restorePatches();
    }
  };
}
```

Keep `waitForElement` unchanged.

- [ ] **Step 5: Run all navigation tests**

Run: `npx vitest run test/lib/navigation.test.ts`
Expected: All 4 tests PASS (3 existing + 1 new)

- [ ] **Step 6: Run all tests, lint, commit**

Run: `npx vitest run && npx eslint .`
Expected: All tests PASS

```bash
git add lib/navigation.ts test/lib/navigation.test.ts
git commit -m "refactor: onUrlChange supports multiple listeners via custom events"
```

---

### Task 4: Data layer extension + background message handler

Add `distinctProducts` to `getStorageStats`. Add `GET_PRODUCT_DATA` message handler to background.

**Files:**
- Modify: `lib/data.ts` — add `distinctProducts` field
- Modify: `entrypoints/background.ts` — add `GET_PRODUCT_DATA` handler, refactor listener to return Promise
- Modify: `test/lib/data.test.ts` — add distinctProducts tests

- [ ] **Step 1: Update existing getStorageStats test and add distinctProducts tests**

First, update the existing empty-database test in `test/lib/data.test.ts` (inside the `getStorageStats` describe block) — the `toEqual` assertion will break once `distinctProducts` is added to the return type. Change:

```typescript
expect(stats).toEqual({ totalObservations: 0, oldestDate: null, newestDate: null, byChain: {} });
```

to:

```typescript
expect(stats).toEqual({ totalObservations: 0, distinctProducts: 0, oldestDate: null, newestDate: null, byChain: {} });
```

Then add new tests in the same describe block:

```typescript
it("returns distinct product count", async () => {
  await db.priceObservations.bulkAdd([
    makeObservation({ productId: "product-a", observedAt: "2026-03-18T01:00:00.000Z" }),
    makeObservation({ productId: "product-a", observedAt: "2026-03-18T02:00:00.000Z", priceCents: 400 }),
    makeObservation({ productId: "product-b", observedAt: "2026-03-18T03:00:00.000Z" }),
  ]);

  const stats = await getStorageStats(db);
  expect(stats.distinctProducts).toBe(2);
  expect(stats.totalObservations).toBe(3);
});

it("returns zero distinct products for empty database", async () => {
  const stats = await getStorageStats(db);
  expect(stats.distinctProducts).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/data.test.ts`
Expected: FAIL — `distinctProducts` property does not exist

- [ ] **Step 3: Add distinctProducts to getStorageStats**

In `lib/data.ts`, modify `getStorageStats`:

```typescript
export async function getStorageStats(db: ChookCheckDB): Promise<{
  totalObservations: number;
  distinctProducts: number;
  oldestDate: string | null;
  newestDate: string | null;
  byChain: Record<string, number>;
}> {
  const total = await db.priceObservations.count();
  if (total === 0) {
    return { totalObservations: 0, distinctProducts: 0, oldestDate: null, newestDate: null, byChain: {} };
  }
  const productKeys = await db.priceObservations.orderBy("productId").uniqueKeys();
  const oldest = await db.priceObservations.orderBy("observedAt").first();
  const newest = await db.priceObservations.orderBy("observedAt").reverse().first();
  const byChain: Record<string, number> = {};
  const woolworths = await db.priceObservations.where("storeChain").equals("woolworths").count();
  const coles = await db.priceObservations.where("storeChain").equals("coles").count();
  if (woolworths > 0) byChain.woolworths = woolworths;
  if (coles > 0) byChain.coles = coles;
  return {
    totalObservations: total,
    distinctProducts: productKeys.length,
    oldestDate: oldest?.observedAt ?? null,
    newestDate: newest?.observedAt ?? null,
    byChain,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/data.test.ts`
Expected: All data tests PASS

- [ ] **Step 5: Write GET_PRODUCT_DATA handler tests**

The background message handler is hard to test in isolation (it's inside `defineBackground`), but the logic it delegates to (`getProductHistory` + `getProductStats`) is already tested. Add integration-style tests for the data layer queries used by the handler in `test/lib/data.test.ts`:

```typescript
describe("getProductHistory + getProductStats (GET_PRODUCT_DATA handler path)", () => {
  it("returns history and stats for known product", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "woolworths:123", priceCents: 300, observedAt: "2026-03-17T00:00:00.000Z" }),
      makeObservation({ productId: "woolworths:123", priceCents: 400, observedAt: "2026-03-18T00:00:00.000Z" }),
    ]);

    const history = await getProductHistory(db, "woolworths:123");
    const stats = await getProductStats(db, "woolworths:123");

    expect(history).toHaveLength(2);
    expect(stats).toEqual({ min: 300, max: 400, avg: 350, count: 2 });
  });

  it("returns empty results for unknown product", async () => {
    const history = await getProductHistory(db, "unknown:999");
    const stats = await getProductStats(db, "unknown:999");

    expect(history).toHaveLength(0);
    expect(stats).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/lib/data.test.ts`
Expected: All tests PASS (these test existing functions, should pass immediately)

- [ ] **Step 7: Refactor background message handler**

Add import at top of `entrypoints/background.ts`:

```typescript
import { getProductHistory, getProductStats } from "@/lib/data";
```

Replace the `browser.runtime.onMessage.addListener` block with:

```typescript
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "PRICE_OBSERVATION" && message.data) {
    const { productName, priceCents, storeChain } = message.data;
    console.log(
      `[Chook Check] ${storeChain}: ${productName} — $${(priceCents / 100).toFixed(2)}`,
    );
    saveObservation(db, message.data).catch((err) =>
      console.error("[Chook Check] Unhandled saveObservation error:", err),
    );
  }

  if (message.type === "GET_PRODUCT_DATA" && message.productId) {
    return (async () => {
      const history = await getProductHistory(db, message.productId);
      const stats = await getProductStats(db, message.productId);
      return { history, stats };
    })();
  }
});
```

Note: The listener returns `undefined` for `PRICE_OBSERVATION` (fire-and-forget) and returns a `Promise` for `GET_PRODUCT_DATA` (keeps message channel open for the async response). This is correct per the WebExtension API.

- [ ] **Step 8: Run all tests, lint, commit**

Run: `npx vitest run && npx eslint .`
Expected: All tests PASS

```bash
git add lib/data.ts entrypoints/background.ts test/lib/data.test.ts
git commit -m "feat: add distinctProducts to getStorageStats, add GET_PRODUCT_DATA handler"
```

---

### Task 5: Popup UI components

Install `@testing-library/react`, build all popup components with CSS Modules, rewrite `App.tsx`.

**Files:**
- Create: `components/popup/PopupHeader.tsx` + `PopupHeader.module.css`
- Create: `components/popup/StatsBar.tsx` + `StatsBar.module.css`
- Create: `components/popup/ObservationItem.tsx` + `ObservationItem.module.css`
- Create: `components/popup/ObservationList.tsx` + `ObservationList.module.css`
- Create: `components/popup/PopupFooter.tsx` + `PopupFooter.module.css`
- Create: `test/components/popup/popup.test.tsx`
- Modify: `entrypoints/popup/App.tsx` — rewrite
- Modify: `entrypoints/popup/main.tsx` — remove old style import
- Delete: `entrypoints/popup/style.css`

- [ ] **Step 1: Install @testing-library/react**

Run: `npm install -D @testing-library/react`

- [ ] **Step 2: Write popup component tests**

```typescript
// test/components/popup/popup.test.tsx
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/components/popup/popup.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement PopupHeader**

```typescript
// components/popup/PopupHeader.tsx
import styles from "./PopupHeader.module.css";

export function PopupHeader() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Chook Check</h1>
      <p className={styles.tagline}>Tracking Australian prices</p>
    </header>
  );
}
```

```css
/* components/popup/PopupHeader.module.css */
.header {
  margin-bottom: 12px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.tagline {
  font-size: 12px;
  color: #666;
  margin: 0;
}
```

- [ ] **Step 5: Implement StatsBar**

```typescript
// components/popup/StatsBar.tsx
import styles from "./StatsBar.module.css";

interface StatsBarProps {
  distinctProducts: number;
  totalObservations: number;
  byChain: Record<string, number>;
}

export function StatsBar({ distinctProducts, totalObservations, byChain }: StatsBarProps) {
  const chains = Object.entries(byChain);
  const isError = distinctProducts < 0;

  return (
    <section className={styles.stats}>
      <div className={styles.summary}>
        {isError ? "—" : `${distinctProducts} products`} · {isError ? "—" : `${totalObservations} prices`}
      </div>
      {chains.length > 0 && (
        <div className={styles.chains}>
          {chains.map(([chain, count]) => (
            <span key={chain} className={styles.chain}>
              {chain.charAt(0).toUpperCase() + chain.slice(1)}: {count}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
```

```css
/* components/popup/StatsBar.module.css */
.stats {
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  margin-bottom: 12px;
}

.summary {
  font-size: 15px;
  font-weight: 600;
}

.chains {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.chain {
  margin-right: 8px;
}
```

- [ ] **Step 6: Implement ObservationItem**

```typescript
// components/popup/ObservationItem.tsx
import { formatPrice } from "../shared/formatPrice";
import { formatRelativeTime } from "../shared/formatTime";
import styles from "./ObservationItem.module.css";
import type { PriceObservation } from "@/lib/types";

interface ObservationItemProps {
  observation: PriceObservation;
}

export function ObservationItem({ observation }: ObservationItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.top}>
        <span className={styles.name}>{observation.productName}</span>
        <span className={styles.price}>{formatPrice(observation.priceCents)}</span>
      </div>
      <div className={styles.bottom}>
        <span className={styles.chain}>{observation.storeChain}</span>
        <span className={styles.dot}> · </span>
        <span className={styles.time}>{formatRelativeTime(observation.observedAt)}</span>
      </div>
    </div>
  );
}
```

```css
/* components/popup/ObservationItem.module.css */
.item {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.item:last-child {
  border-bottom: none;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.price {
  font-size: 13px;
  font-weight: 600;
  color: #16a34a;
  flex-shrink: 0;
}

.bottom {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}

.chain {
  text-transform: capitalize;
}
```

- [ ] **Step 7: Implement ObservationList**

```typescript
// components/popup/ObservationList.tsx
import { ObservationItem } from "./ObservationItem";
import styles from "./ObservationList.module.css";
import type { PriceObservation } from "@/lib/types";

interface ObservationListProps {
  observations: PriceObservation[];
}

export function ObservationList({ observations }: ObservationListProps) {
  if (observations.length === 0) {
    return (
      <section className={styles.empty}>
        Visit a Woolworths or Coles product page to start tracking prices.
      </section>
    );
  }

  return (
    <section className={styles.list}>
      <h2 className={styles.heading}>Recent Observations</h2>
      {observations.map((obs) => (
        <ObservationItem key={obs.id ?? obs.observedAt} observation={obs} />
      ))}
    </section>
  );
}
```

```css
/* components/popup/ObservationList.module.css */
.list {
  margin-bottom: 12px;
}

.heading {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin: 0 0 8px;
}

.empty {
  padding: 16px 0;
  font-size: 13px;
  color: #888;
  text-align: center;
}
```

- [ ] **Step 8: Implement PopupFooter**

```typescript
// components/popup/PopupFooter.tsx
import styles from "./PopupFooter.module.css";

export function PopupFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links}>
        <a href={browser.runtime.getURL("/dashboard.html")} className={styles.link}>
          Dashboard
        </a>
        <a href={browser.runtime.getURL("/options.html")} className={styles.link}>
          Settings
        </a>
      </nav>
      <p className={styles.status}>Not contributing</p>
      <p className={styles.cta}>
        Help other Australians spot unfair pricing — start contributing
      </p>
    </footer>
  );
}
```

```css
/* components/popup/PopupFooter.module.css */
.footer {
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.links {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}

.link {
  font-size: 13px;
  color: #16a34a;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.status {
  font-size: 11px;
  color: #888;
  margin: 0;
}

.cta {
  font-size: 11px;
  color: #16a34a;
  margin: 4px 0 0;
  cursor: pointer;
}
```

- [ ] **Step 9: Run popup tests**

Run: `npx vitest run test/components/popup/popup.test.tsx`
Expected: All tests PASS

- [ ] **Step 10: Rewrite popup App.tsx and main.tsx**

```typescript
// entrypoints/popup/App.tsx
import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getStorageStats, getRecentObservations } from "@/lib/data";
import { PopupHeader } from "@/components/popup/PopupHeader";
import { StatsBar } from "@/components/popup/StatsBar";
import { ObservationList } from "@/components/popup/ObservationList";
import { PopupFooter } from "@/components/popup/PopupFooter";
import type { PriceObservation } from "@/lib/types";

export default function App() {
  const [stats, setStats] = useState<{
    distinctProducts: number;
    totalObservations: number;
    byChain: Record<string, number>;
  }>({ distinctProducts: 0, totalObservations: 0, byChain: {} });
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([getStorageStats(db), getRecentObservations(db, 10)])
      .then(([storageStats, recent]) => {
        setStats({
          distinctProducts: storageStats.distinctProducts,
          totalObservations: storageStats.totalObservations,
          byChain: storageStats.byChain,
        });
        setObservations(recent);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div style={{ padding: 16 }}>
      <PopupHeader />
      <StatsBar
        distinctProducts={error ? -1 : stats.distinctProducts}
        totalObservations={error ? -1 : stats.totalObservations}
        byChain={error ? {} : stats.byChain}
      />
      {error ? (
        <p style={{ color: "#888", fontSize: 13 }}>Unable to load data.</p>
      ) : (
        <ObservationList observations={observations} />
      )}
      <PopupFooter />
    </div>
  );
}
```

```typescript
// entrypoints/popup/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Update `entrypoints/popup/index.html` — add base styles inline since we're removing style.css:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chook Check</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        color: #1a1a1a;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

Delete `entrypoints/popup/style.css`.

- [ ] **Step 11: Run all tests, lint, commit**

Run: `npx vitest run && npx eslint .`
Expected: All tests PASS

```bash
git add components/popup/ test/components/popup/ entrypoints/popup/
git rm entrypoints/popup/style.css
git commit -m "feat: build popup UI with stats, observations, and navigation"
```

---

### Task 6: Sparkline component

Hand-rolled SVG sparkline for the overlay. Uses plain CSS (not Modules) since it renders inside Shadow DOM.

**Files:**
- Create: `components/overlay/Sparkline.tsx`
- Create: `components/overlay/sparkline.css`
- Create: `test/components/overlay/sparkline.test.tsx`

- [ ] **Step 1: Write sparkline tests**

```typescript
// test/components/overlay/sparkline.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "../../../components/overlay/Sparkline";

describe("Sparkline", () => {
  it("renders nothing for empty prices", () => {
    const { container } = render(<Sparkline prices={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a dot for a single price point", () => {
    const { container } = render(<Sparkline prices={[350]} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("circle")).not.toBeNull();
    expect(svg!.querySelector("polyline")).toBeNull();
  });

  it("renders a polyline for multiple price points", () => {
    const { container } = render(<Sparkline prices={[300, 350, 320, 400]} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("polyline")).not.toBeNull();
  });

  it("highlights the last point with a dot", () => {
    const { container } = render(<Sparkline prices={[300, 350, 320]} />);
    const svg = container.querySelector("svg");
    expect(svg!.querySelector("circle")).not.toBeNull();
  });

  it("handles all same prices (flat line)", () => {
    const { container } = render(<Sparkline prices={[400, 400, 400]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/overlay/sparkline.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Sparkline**

```typescript
// components/overlay/Sparkline.tsx
interface SparklineProps {
  prices: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ prices, width = 200, height = 40 }: SparklineProps) {
  if (prices.length === 0) return null;

  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  if (prices.length === 1) {
    return (
      <svg width={width} height={height} className="cc-sparkline">
        <circle cx={width / 2} cy={height / 2} r={3} className="cc-sparkline-dot" />
      </svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices
    .map((price, i) => {
      const x = padding + (i / (prices.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((price - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const lastX = padding + chartWidth;
  const lastY =
    padding + chartHeight - ((prices[prices.length - 1] - min) / range) * chartHeight;

  return (
    <svg width={width} height={height} className="cc-sparkline">
      <polyline points={points} className="cc-sparkline-line" />
      <circle cx={lastX} cy={lastY} r={3} className="cc-sparkline-dot" />
    </svg>
  );
}
```

```css
/* components/overlay/sparkline.css */
.cc-sparkline {
  display: block;
  margin: 8px 0;
}

.cc-sparkline-line {
  fill: none;
  stroke: #16a34a;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cc-sparkline-dot {
  fill: #16a34a;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/components/overlay/sparkline.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 5: Lint and commit**

Run: `npx vitest run && npx eslint .`

```bash
git add components/overlay/Sparkline.tsx components/overlay/sparkline.css test/components/overlay/
git commit -m "feat: add hand-rolled SVG sparkline component"
```

---

### Task 7: Overlay panel and badge components

Build the OverlayPanel (expanded view with stats) and OverlayBadge (collapsed pill). Plain CSS for Shadow DOM.

**Files:**
- Create: `components/overlay/OverlayPanel.tsx`
- Create: `components/overlay/overlay-panel.css`
- Create: `components/overlay/OverlayBadge.tsx`
- Create: `components/overlay/overlay-badge.css`
- Create: `test/components/overlay/overlay.test.tsx`

- [ ] **Step 1: Write overlay component tests**

```typescript
// test/components/overlay/overlay.test.tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/overlay/overlay.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement OverlayPanel**

```typescript
// components/overlay/OverlayPanel.tsx
import { Sparkline } from "./Sparkline";
import { formatPrice } from "../shared/formatPrice";
import type { PriceObservation } from "@/lib/types";

interface OverlayPanelProps {
  productName: string;
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
  currentPriceCents: number;
  onClose: () => void;
  error?: boolean;
}

export function OverlayPanel({
  productName,
  history,
  stats,
  currentPriceCents,
  onClose,
  error = false,
}: OverlayPanelProps) {
  const prices = history.map((o) => o.priceCents);

  return (
    <div className="cc-panel">
      <div className="cc-panel-header">
        <span className="cc-panel-title">{productName}</span>
        <button className="cc-panel-close" onClick={onClose}>
          ✕
        </button>
      </div>
      {error ? (
        <p className="cc-panel-empty">Unable to load price history.</p>
      ) : !stats ? (
        <p className="cc-panel-empty">
          First observation recorded — check back after your next visit to see
          trends.
        </p>
      ) : (
        <>
          <Sparkline prices={prices} />
          <div className="cc-panel-stats">
            <div className="cc-panel-row">
              <span className="cc-panel-label">Now</span>
              <span className="cc-panel-value">
                {formatPrice(currentPriceCents)}
              </span>
            </div>
            <div className="cc-panel-row">
              <span className="cc-panel-label">Avg</span>
              <span className="cc-panel-value">{formatPrice(stats.avg)}</span>
            </div>
            <div className="cc-panel-row">
              <span className="cc-panel-label">Low</span>
              <span className="cc-panel-value">{formatPrice(stats.min)}</span>
              <span className="cc-panel-sep"> · </span>
              <span className="cc-panel-label">High</span>
              <span className="cc-panel-value">{formatPrice(stats.max)}</span>
            </div>
            <div className="cc-panel-tracked">
              Tracked {stats.count} times
            </div>
          </div>
        </>
      )}
      <p className="cc-panel-community">Community data coming soon</p>
    </div>
  );
}
```

```css
/* components/overlay/overlay-panel.css */
.cc-panel {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  width: 260px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  position: absolute;
  z-index: 999999;
}

.cc-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.cc-panel-title {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
  margin-right: 8px;
}

.cc-panel-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #888;
  padding: 0;
  line-height: 1;
}

.cc-panel-close:hover {
  color: #333;
}

.cc-panel-stats {
  margin: 8px 0;
}

.cc-panel-row {
  display: flex;
  align-items: baseline;
  margin-bottom: 4px;
}

.cc-panel-label {
  color: #666;
  width: 32px;
  flex-shrink: 0;
}

.cc-panel-value {
  font-weight: 600;
}

.cc-panel-sep {
  color: #ccc;
  margin: 0 4px;
}

.cc-panel-tracked {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
}

.cc-panel-empty {
  font-size: 12px;
  color: #888;
  padding: 8px 0;
  margin: 0;
}

.cc-panel-community {
  font-size: 11px;
  color: #aaa;
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
  margin: 8px 0 0;
}
```

- [ ] **Step 4: Implement OverlayBadge**

```typescript
// components/overlay/OverlayBadge.tsx
interface OverlayBadgeProps {
  isExpanded: boolean;
  priceBelowAvg: boolean;
  onClick: () => void;
}

export function OverlayBadge({ isExpanded, priceBelowAvg, onClick }: OverlayBadgeProps) {
  if (isExpanded) return null;

  return (
    <button
      className={`cc-badge ${priceBelowAvg ? "cc-badge-good" : "cc-badge-neutral"}`}
      onClick={onClick}
      title="Chook Check — view price history"
    >
      CC
    </button>
  );
}
```

```css
/* components/overlay/overlay-badge.css */
.cc-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 16px;
  border: 1px solid #e0e0e0;
  background: #fff;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.15s, border-color 0.15s;
  padding: 0;
  margin-left: 8px;
  vertical-align: middle;
}

.cc-badge:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  border-color: #ccc;
}

.cc-badge-good {
  color: #16a34a;
  border-color: #16a34a;
}

.cc-badge-neutral {
  color: #666;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/components/overlay/`
Expected: All overlay tests PASS

- [ ] **Step 6: Lint and commit**

Run: `npx vitest run && npx eslint .`

```bash
git add components/overlay/ test/components/overlay/
git commit -m "feat: add overlay panel and badge components"
```

---

### Task 8: Overlay root, selectors, and content script

Wire up the overlay: Shadow DOM container, positioning logic, overlay-selectors, OverlayRoot component, and the content script entry point.

**Files:**
- Create: `lib/overlay-selectors.ts`
- Create: `components/overlay/OverlayRoot.tsx`
- Create: `entrypoints/overlay.content.ts`

Note: We use `defineContentScript` and manually create the Shadow DOM rather than WXT's directory-based approach. This gives us full control over the Shadow DOM lifecycle.

**Timing note:** The overlay queries `GET_PRODUCT_DATA` after the scraper has sent `PRICE_OBSERVATION`. Both content scripts run at `document_idle`, and the scraper fires first (it sends the message immediately). By the time the user might interact with the overlay, the observation should be saved. If the overlay loads before the scraper saves (e.g., first ever visit), the panel shows the "First observation recorded" message, which is the correct UX.

- [ ] **Step 1: Write overlay-selectors tests**

```typescript
// test/lib/overlay-selectors.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectChain, findPriceElement } from "../../lib/overlay-selectors";

describe("detectChain", () => {
  it("detects woolworths from hostname", () => {
    vi.stubGlobal("location", { hostname: "www.woolworths.com.au" });
    expect(detectChain()).toBe("woolworths");
  });

  it("detects coles from hostname", () => {
    vi.stubGlobal("location", { hostname: "www.coles.com.au" });
    expect(detectChain()).toBe("coles");
  });

  it("returns null for unknown hostname", () => {
    vi.stubGlobal("location", { hostname: "www.example.com" });
    expect(detectChain()).toBeNull();
  });
});

describe("findPriceElement", () => {
  beforeEach(() => {
    document.body.textContent = "";
  });

  it("finds woolworths price element", () => {
    vi.stubGlobal("location", { hostname: "www.woolworths.com.au" });
    const el = document.createElement("div");
    el.className = "price-dollars";
    document.body.appendChild(el);
    expect(findPriceElement()).toBe(el);
  });

  it("returns null when no price element found", () => {
    vi.stubGlobal("location", { hostname: "www.woolworths.com.au" });
    expect(findPriceElement()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/overlay-selectors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create overlay-selectors**

```typescript
// lib/overlay-selectors.ts

const PRICE_SELECTORS: Record<string, string[]> = {
  woolworths: [
    '[class*="price-dollars"]',
    '[class*="product-price_component"]',
    '.shelfProductTile-price',
  ],
  coles: [
    '[data-testid="pricing"]',
    '.price__value',
    '.product-price',
  ],
};

export function detectChain(): "woolworths" | "coles" | null {
  const hostname = window.location.hostname;
  if (hostname.includes("woolworths.com.au")) return "woolworths";
  if (hostname.includes("coles.com.au")) return "coles";
  return null;
}

export function findPriceElement(): Element | null {
  const chain = detectChain();
  if (!chain) return null;

  const selectors = PRICE_SELECTORS[chain];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}
```

- [ ] **Step 4: Create OverlayRoot**

Note: OverlayRoot has no CSS of its own — it delegates all styling to OverlayBadge and OverlayPanel.

```typescript
// components/overlay/OverlayRoot.tsx
import { useState, useEffect } from "react";
import { OverlayBadge } from "./OverlayBadge";
import { OverlayPanel } from "./OverlayPanel";
import type { PriceObservation } from "@/lib/types";

interface ProductData {
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
}

export function OverlayRoot({ productId }: { productId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 5000),
    );

    Promise.race([
      browser.runtime.sendMessage({ type: "GET_PRODUCT_DATA", productId }),
      timeout,
    ])
      .then((response: ProductData) => setData(response))
      .catch(() => {
        setError(true);
        setData({ history: [], stats: null });
      });
  }, [productId]);

  if (!data) return null;

  const latestObs = data.history.length > 0 ? data.history[data.history.length - 1] : null;
  const currentPrice = latestObs?.priceCents ?? 0;
  const productName = latestObs?.productName ?? "Product";
  const priceBelowAvg = data.stats ? currentPrice <= data.stats.avg : false;

  return (
    <>
      <OverlayBadge
        isExpanded={expanded}
        priceBelowAvg={priceBelowAvg}
        onClick={() => setExpanded(true)}
      />
      {expanded && (
        <OverlayPanel
          productName={productName}
          history={data.history}
          stats={data.stats}
          currentPriceCents={currentPrice}
          onClose={() => setExpanded(false)}
          error={error}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Create overlay content script**

```typescript
// entrypoints/overlay.content.ts
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getProductIdFromUrl } from "@/lib/product-id";
import { onUrlChange } from "@/lib/navigation";
import { findPriceElement } from "@/lib/overlay-selectors";
import { OverlayRoot } from "@/components/overlay/OverlayRoot";

// Import CSS as inline strings for Shadow DOM injection
import sparklineCss from "@/components/overlay/sparkline.css?inline";
import panelCss from "@/components/overlay/overlay-panel.css?inline";
import badgeCss from "@/components/overlay/overlay-badge.css?inline";

export default defineContentScript({
  matches: [
    "https://www.woolworths.com.au/*",
    "https://www.coles.com.au/*",
  ],
  runAt: "document_idle",

  main() {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    function cleanup() {
      if (root) {
        root.unmount();
        root = null;
      }
      if (container) {
        container.remove();
        container = null;
      }
    }

    function inject() {
      cleanup();

      const productId = getProductIdFromUrl(window.location.href);
      if (!productId) return;

      container = document.createElement("div");
      container.id = "chook-check-overlay";
      const shadow = container.attachShadow({ mode: "open" });

      // Inject styles
      const style = document.createElement("style");
      style.textContent = [sparklineCss, panelCss, badgeCss].join("\n");
      shadow.appendChild(style);

      // React mount point
      const mountPoint = document.createElement("div");
      shadow.appendChild(mountPoint);

      // Position near price element or fall back to fixed
      const priceEl = findPriceElement();
      if (priceEl) {
        priceEl.insertAdjacentElement("afterend", container);
      } else {
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.right = "20px";
        container.style.zIndex = "999999";
        document.body.appendChild(container);
      }

      root = createRoot(mountPoint);
      root.render(createElement(OverlayRoot, { productId }));
    }

    // Inject on initial load (if on a product page)
    inject();

    // Re-inject on SPA navigation
    onUrlChange(() => inject());
  },
});
```

- [ ] **Step 6: Build and verify no compile errors**

Run: `npx wxt build`
Expected: Build succeeds with no errors

- [ ] **Step 7: Run all tests, lint, commit**

Run: `npx vitest run && npx eslint .`
Expected: All tests PASS

```bash
git add lib/overlay-selectors.ts components/overlay/OverlayRoot.tsx entrypoints/overlay.content.ts test/lib/overlay-selectors.test.ts
git commit -m "feat: wire overlay with Shadow DOM, positioning, and content script"
```

- [ ] **Step 8: Build both targets**

Run: `npx wxt build && npx wxt build -b firefox`
Expected: Both Chrome and Firefox builds succeed

---

## Post-implementation checklist

After all 8 tasks are complete:

1. Run full test suite: `npx vitest run` — all tests pass
2. Run lint: `npx eslint .` — no errors
3. Build Chrome: `npx wxt build` — success
4. Build Firefox: `npx wxt build -b firefox` — success
5. Manual test in Chrome:
   - Load extension, click icon → popup shows stats and recent observations
   - Visit Woolworths product page → overlay badge appears near price
   - Click badge → panel expands with sparkline and stats
   - Navigate to another product (SPA) → overlay updates
6. Verify no console errors in service worker or content script DevTools
