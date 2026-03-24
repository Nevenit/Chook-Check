# Phase 8: Extension ↔ API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Chook Check browser extension to the deployed community backend so observations are submitted in batches, community stats are shown in the overlay, and an onboarding banner encourages contribution.

**Architecture:** All API communication goes through the background service worker. A new `lib/api.ts` module wraps fetch calls. The background registers a 5-minute alarm for batch submission, and handles `GET_COMMUNITY_STATS` / `DELETE_SERVER_DATA` messages from the overlay and settings UI.

**Tech Stack:** WXT, React 19, TypeScript, Dexie (IndexedDB), Vitest + happy-dom

---

## File Structure

**New files:**
- `lib/api.ts` — fetch wrapper for all 3 API endpoints
- `components/popup/OnboardingBanner.tsx` — dismissible contribution prompt
- `test/lib/api.test.ts` — unit tests for API client
- `test/components/popup/onboarding.test.tsx` — onboarding banner tests

**Modified files:**
- `lib/types.ts` — add `SubmitRequest`, `SubmitResponse`, `ProductStats`, `SharingEvent`; add `onboardingDismissed` to `UserSettings`
- `lib/db.ts` — add `sharingLog` table, bump schema version
- `lib/store.ts` — add `onboardingDismissed: false` to `initDefaults`
- `entrypoints/background.ts` — alarm + submission handler, two new message handlers
- `components/overlay/OverlayRoot.tsx` — fetch community stats on panel expand
- `components/overlay/OverlayPanel.tsx` — display community stats section
- `components/settings/SharingLogSection.tsx` — read from `sharingLog` Dexie table
- `components/settings/DataManagementSection.tsx` — enable server deletion button
- `entrypoints/popup/App.tsx` — render onboarding banner
- `test/components/overlay/overlay.test.tsx` — update/add community stats tests
- `test/components/settings/settings.test.tsx` — update sharing log & data management tests

---

### Task 1: Types and database schema

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db.ts`
- Modify: `lib/store.ts`
- Test: `test/lib/store.test.ts` (verify existing tests still pass)

- [ ] **Step 1: Update `lib/types.ts`**

Add these types after the existing `ConsentEvent` interface and update `UserSettings`:

```typescript
// In UserSettings, add this field:
//   onboardingDismissed: boolean;

// After ConsentEvent interface, add:

export interface SubmitRequest {
  contributorId: string;
  observations: Array<{
    productId: string;
    productName: string;
    brand?: string | null;
    category?: string | null;
    gtin?: string | null;
    storeChain: "woolworths" | "coles";
    priceCents: number;
    wasPriceCents?: number | null;
    unitPriceCents?: number | null;
    unitMeasure?: string | null;
    promoType?: string | null;
    isPersonalised: boolean;
    observedAt: string;
  }>;
  context?: {
    browser?: string;
    state?: string;
    city?: string;
    store?: string;
  };
}

export interface SubmitResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  reasons?: string[];
}

export interface ProductStats {
  productId: string;
  productName: string;
  brand: string | null;
  storeChain: string;
  quorum: boolean;
  currentMedianCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  observationCount: number;
  contributorCount: number;
  priceHistory: Array<{
    date: string;
    medianCents: number;
    minCents: number;
    maxCents: number;
  }>;
  promoFrequency: Record<string, number>;
}

export interface SharingEvent {
  id?: number;
  timestamp: string;
  observationCount: number;
  status: "success" | "error";
  errorMessage?: string;
}
```

The full updated `UserSettings` should be:

```typescript
export interface UserSettings {
  contributionEnabled: boolean;
  contributorId: string;
  contributorIdMode: "anonymous" | "account_linked";
  shareBrowser: boolean;
  shareState: boolean;
  shareCity: boolean;
  shareStore: boolean;
  linkAccount: boolean;
  consentLog: ConsentEvent[];
  onboardingDismissed: boolean;
}
```

- [ ] **Step 2: Update `lib/db.ts`**

Bump the Dexie schema version to 2 and add the `sharingLog` table. The full file should be:

```typescript
import Dexie, { type EntityTable } from "dexie";
import type { PriceObservation, UserSettings, SharingEvent } from "./types";

export type StoredSettings = UserSettings & { key: string };

export class ChookCheckDB extends Dexie {
  priceObservations!: EntityTable<PriceObservation, "id">;
  userSettings!: EntityTable<StoredSettings, "key">;
  sharingLog!: EntityTable<SharingEvent, "id">;

  constructor(name = "ChookCheckDB") {
    super(name);
    this.version(1).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
    });
    this.version(2).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
      sharingLog: "++id, timestamp",
    });
  }
}

export const db = new ChookCheckDB();
```

- [ ] **Step 3: Update `lib/store.ts`**

Add `onboardingDismissed: false` to the `initDefaults` function. The defaults object at line 90-101 should become:

```typescript
  await db.userSettings.add({
    key: "default",
    contributionEnabled: false,
    contributorId: "",
    contributorIdMode: "anonymous",
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    linkAccount: false,
    consentLog: [],
    onboardingDismissed: false,
  });
```

- [ ] **Step 4: Update `lib/settings.ts` — reset `onboardingDismissed` in `deleteAllLocalData`**

In the `deleteAllLocalData` function, add `onboardingDismissed: false` to the update object so it resets when the user deletes all local data:

```typescript
  await db.userSettings.update("default", {
    contributionEnabled: false,
    contributorId: "",
    contributorIdMode: "anonymous" as const,
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    linkAccount: false,
    onboardingDismissed: false,
    consentLog: [
      ...preservedLog,
      {
        action: "data_deleted" as const,
        detail: "All local data deleted",
        timestamp: new Date().toISOString(),
      },
    ],
  });
```

- [ ] **Step 5: Run existing tests to verify nothing broke**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/lib/store.test.ts test/lib/db.test.ts test/lib/settings.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db.ts lib/store.ts lib/settings.ts
git commit -m "feat: add API types, SharingEvent, and onboardingDismissed to schema"
```

---

### Task 2: API client module

**Files:**
- Create: `lib/api.ts`
- Create: `test/lib/api.test.ts`

- [ ] **Step 1: Write API client tests**

Create `test/lib/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitObservations, getProductStats, deleteContributorData } from "@/lib/api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("submitObservations", () => {
  it("sends POST with correct body and returns response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ accepted: 1, duplicates: 0, rejected: 0 }),
    });

    const body = {
      contributorId: "00000000-0000-0000-0000-000000000001",
      observations: [
        {
          productId: "woolworths:123",
          productName: "Vegemite 380g",
          storeChain: "woolworths" as const,
          priceCents: 750,
          isPersonalised: false,
          observedAt: new Date().toISOString(),
        },
      ],
    };

    const result = await submitObservations(body);
    expect(result.accepted).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/observations"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: "rate_limited", message: "Too many requests" }),
    });

    await expect(submitObservations({
      contributorId: "00000000-0000-0000-0000-000000000001",
      observations: [],
    })).rejects.toThrow();
  });
});

describe("getProductStats", () => {
  it("sends GET with query params and returns stats", async () => {
    const stats = {
      productId: "woolworths:123",
      productName: "Vegemite",
      brand: null,
      storeChain: "woolworths",
      quorum: true,
      currentMedianCents: 750,
      minCents: 700,
      maxCents: 800,
      observationCount: 10,
      contributorCount: 3,
      priceHistory: [],
      promoFrequency: {},
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(stats),
    });

    const result = await getProductStats("woolworths:123", 30, "woolworths");
    expect(result).toEqual(stats);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/products/woolworths%3A123/stats?days=30&chain=woolworths"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "not_found" }),
    });

    const result = await getProductStats("woolworths:999");
    expect(result).toBeNull();
  });
});

describe("deleteContributorData", () => {
  it("sends DELETE and returns deleted count", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deleted: 5 }),
    });

    const result = await deleteContributorData("00000000-0000-0000-0000-000000000001");
    expect(result.deleted).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/contributor/00000000-0000-0000-0000-000000000001"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/lib/api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/api.ts`**

```typescript
import type { SubmitRequest, SubmitResponse, ProductStats } from "./types";

const API_BASE = "https://chook-check-api.nevenit.workers.dev";

export async function submitObservations(
  body: SubmitRequest,
): Promise<SubmitResponse> {
  const res = await fetch(`${API_BASE}/api/observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `API error: ${res.status}`,
    );
  }

  return res.json();
}

export async function getProductStats(
  productId: string,
  days = 30,
  chain?: string,
): Promise<ProductStats | null> {
  const params = new URLSearchParams({ days: String(days) });
  if (chain) params.set("chain", chain);

  const res = await fetch(
    `${API_BASE}/api/products/${encodeURIComponent(productId)}/stats?${params}`,
    { method: "GET" },
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `API error: ${res.status}`,
    );
  }

  return res.json();
}

export async function deleteContributorData(
  contributorId: string,
): Promise<{ deleted: number }> {
  const res = await fetch(
    `${API_BASE}/api/contributor/${encodeURIComponent(contributorId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `API error: ${res.status}`,
    );
  }

  return res.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/lib/api.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/api.ts test/lib/api.test.ts
git commit -m "feat: add API client module with fetch wrapper"
```

---

### Task 3: Background submission handler

**Files:**
- Modify: `entrypoints/background.ts`

No separate test file — the background script uses WXT's `defineBackground` and `browser` globals that require integration testing. The API client is already unit tested, and submission behavior will be verified end-to-end via manual testing.

- [ ] **Step 1: Update `entrypoints/background.ts`**

Replace the full file with:

```typescript
import { db } from "@/lib/db";
import { saveObservation, initDefaults } from "@/lib/store";
import { deleteOlderThan } from "@/lib/retention";
import { getProductHistory, getProductStats } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { submitObservations, getProductStats as getApiStats, deleteContributorData } from "@/lib/api";
import type { PriceObservation, SubmitRequest } from "@/lib/types";

const RETENTION_ALARM = "chook-check-retention";
const RETENTION_DAYS = 365;
const RETENTION_INTERVAL_MINUTES = 1440; // 24 hours

const SUBMIT_ALARM = "chook-check-submit";
const SUBMIT_INTERVAL_MINUTES = 5;
const BATCH_SIZE = 50;
const MAX_AGE_DAYS = 14;

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

function buildSubmitRequest(
  observations: PriceObservation[],
  contributorId: string,
  settings: { shareBrowser: boolean; shareState: boolean; shareCity: boolean; shareStore: boolean },
): SubmitRequest {
  const context: SubmitRequest["context"] = {};
  if (settings.shareBrowser) context.browser = detectBrowser();
  // state, city, store not yet available from scraper — omitted

  const hasContext = Object.keys(context).length > 0;

  return {
    contributorId,
    observations: observations.map((o) => ({
      productId: o.productId,
      productName: o.productName,
      brand: o.brand,
      category: o.category,
      gtin: o.gtin,
      storeChain: o.storeChain,
      priceCents: o.priceCents,
      wasPriceCents: o.wasPriceCents,
      unitPriceCents: o.unitPriceCents,
      unitMeasure: o.unitMeasure,
      promoType: o.promoType,
      isPersonalised: o.isPersonalised,
      observedAt: o.observedAt,
    })),
    ...(hasContext ? { context } : {}),
  };
}

async function handleSubmission(): Promise<void> {
  const settings = await getSettings(db);

  if (!settings.contributionEnabled) return;
  if (!settings.contributorId) return;

  const allUnsubmitted = await db.priceObservations
    .filter((o) => !o.contributed)
    .toArray();

  if (allUnsubmitted.length === 0) return;

  // Filter out observations older than 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString();
  const eligible = allUnsubmitted.filter((o) => o.observedAt >= cutoffStr);

  if (eligible.length === 0) return;

  // Chunk into batches
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const body = buildSubmitRequest(batch, settings.contributorId, settings);

    try {
      const result = await submitObservations(body);

      // Mark as contributed
      const ids = batch.map((o) => o.id!).filter(Boolean);
      await db.priceObservations
        .where("id")
        .anyOf(ids)
        .modify({ contributed: true });

      // Log sharing event
      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: result.accepted,
        status: "success",
      });

      console.log(
        `[Chook Check] Submitted ${result.accepted} observations (${result.duplicates} duplicates)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Chook Check] Submission failed:", message);

      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: batch.length,
        status: "error",
        errorMessage: message,
      });
    }
  }
}

export default defineBackground(() => {
  console.log("[Chook Check] Background service worker started");

  initDefaults(db).catch((err) =>
    console.error("[Chook Check] Failed to initialize defaults:", err),
  );

  // Retention alarm — daily
  browser.alarms.create(RETENTION_ALARM, {
    periodInMinutes: RETENTION_INTERVAL_MINUTES,
  });

  // Submission alarm — every 5 minutes
  browser.alarms.create(SUBMIT_ALARM, {
    periodInMinutes: SUBMIT_INTERVAL_MINUTES,
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RETENTION_ALARM) {
      const deleted = await deleteOlderThan(db, RETENTION_DAYS);
      if (deleted > 0) {
        console.log(
          `[Chook Check] Retention cleanup: deleted ${deleted} old observations`,
        );
      }
    }

    if (alarm.name === SUBMIT_ALARM) {
      await handleSubmission().catch((err) =>
        console.error("[Chook Check] Submission handler error:", err),
      );
    }
  });

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

    if (message.type === "GET_COMMUNITY_STATS" && message.productId) {
      return (async () => {
        try {
          const chain = message.productId.split(":")[0];
          return await getApiStats(message.productId, undefined, chain);
        } catch (err) {
          console.error("[Chook Check] Failed to fetch community stats:", err);
          return null;
        }
      })();
    }

    if (message.type === "DELETE_SERVER_DATA" && message.contributorId) {
      return (async () => {
        return await deleteContributorData(message.contributorId);
      })();
    }
  });
});
```

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run`
Expected: all pass (background script isn't directly tested, but other tests should not break).

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: add batch submission alarm and community stats message handlers"
```

---

### Task 4: Overlay community stats

**Files:**
- Modify: `components/overlay/OverlayRoot.tsx`
- Modify: `components/overlay/OverlayPanel.tsx`
- Modify: `test/components/overlay/overlay.test.tsx`

- [ ] **Step 1: Update overlay tests**

In `test/components/overlay/overlay.test.tsx`, replace the "shows community placeholder" test and add new tests. The full updated file:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/overlay/overlay.test.tsx`
Expected: FAIL — `communityStats` and `communityLoading` props don't exist yet.

- [ ] **Step 3: Update `components/overlay/OverlayPanel.tsx`**

Replace the full file:

```typescript
import { Sparkline } from "./Sparkline";
import { formatPrice } from "../shared/formatPrice";
import type { PriceObservation, ProductStats } from "@/lib/types";

interface OverlayPanelProps {
  productName: string;
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
  currentPriceCents: number;
  onClose: () => void;
  error?: boolean;
  communityStats?: ProductStats | null;
  communityLoading?: boolean;
}

export function OverlayPanel({
  productName,
  history,
  stats,
  currentPriceCents,
  onClose,
  error = false,
  communityStats,
  communityLoading = false,
}: OverlayPanelProps) {
  const prices = history.map((o) => o.priceCents);

  const showCommunity = communityLoading || communityStats != null;

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
      {showCommunity && (
        <div className="cc-panel-community">
          <div className="cc-panel-community-title">Community</div>
          {communityLoading ? (
            <p className="cc-panel-community-loading">Loading...</p>
          ) : communityStats?.quorum ? (
            <div className="cc-panel-community-stats">
              <div className="cc-panel-row">
                <span className="cc-panel-label">Median</span>
                <span className="cc-panel-value">
                  {formatPrice(communityStats.currentMedianCents!)}
                </span>
              </div>
              <div className="cc-panel-row">
                <span className="cc-panel-label">Low</span>
                <span className="cc-panel-value">
                  {formatPrice(communityStats.minCents!)}
                </span>
                <span className="cc-panel-sep"> · </span>
                <span className="cc-panel-label">High</span>
                <span className="cc-panel-value">
                  {formatPrice(communityStats.maxCents!)}
                </span>
              </div>
              <div className="cc-panel-tracked">
                {communityStats.observationCount} observations from{" "}
                {communityStats.contributorCount} contributors
              </div>
              {Object.keys(communityStats.promoFrequency).length > 0 && (
                <div className="cc-panel-promos">
                  {Object.entries(communityStats.promoFrequency).map(
                    ([type, count]) => (
                      <span key={type} className="cc-panel-promo-tag">
                        {type}: {count}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : communityStats ? (
            <p className="cc-panel-community-quorum">
              Not enough community data yet ({communityStats.contributorCount}{" "}
              of 3 contributors needed)
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `components/overlay/OverlayRoot.tsx`**

Replace the full file:

```typescript
import { useState, useEffect } from "react";
import { OverlayBadge } from "./OverlayBadge";
import { OverlayPanel } from "./OverlayPanel";
import type { PriceObservation, ProductStats } from "@/lib/types";

interface ProductData {
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
}

export function OverlayRoot({ productId }: { productId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState(false);
  const [communityStats, setCommunityStats] = useState<ProductStats | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);

  // Fetch local data on mount
  useEffect(() => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 5000),
    );

    Promise.race([
      browser.runtime.sendMessage({ type: "GET_PRODUCT_DATA", productId }),
      timeout,
    ])
      .then((response: ProductData) => {
        setData(response);
      })
      .catch(() => {
        setError(true);
        setData({ history: [], stats: null });
      });
  }, [productId]);

  // Reset community stats when product changes
  useEffect(() => {
    setCommunityStats(null);
    setCommunityLoading(false);
  }, [productId]);

  // Fetch community data when panel expands
  useEffect(() => {
    if (!expanded) return;
    if (communityStats !== null) return; // already fetched

    setCommunityLoading(true);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 5000),
    );

    Promise.race([
      browser.runtime.sendMessage({
        type: "GET_COMMUNITY_STATS",
        productId,
      }),
      timeout,
    ])
      .then((response: ProductStats | null) => {
        setCommunityStats(response);
      })
      .catch(() => {
        // Silently fail — local data still shown
      })
      .finally(() => {
        setCommunityLoading(false);
      });
  }, [expanded, productId, communityStats]);

  if (!data) return null;

  const latestObs =
    data.history.length > 0 ? data.history[data.history.length - 1] : null;
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
          communityStats={communityStats}
          communityLoading={communityLoading}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/overlay/overlay.test.tsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/overlay/OverlayRoot.tsx components/overlay/OverlayPanel.tsx test/components/overlay/overlay.test.tsx
git commit -m "feat: display community stats in overlay panel"
```

---

### Task 5: Sharing log and server deletion in settings

**Files:**
- Modify: `components/settings/SharingLogSection.tsx`
- Modify: `components/settings/DataManagementSection.tsx`
- Modify: `test/components/settings/settings.test.tsx`

- [ ] **Step 1: Update settings test mocks and defaults**

In `test/components/settings/settings.test.tsx`, make these changes first:

1. Update the `db` mock to include `sharingLog`:
```typescript
vi.mock("@/lib/db", () => ({
  db: {
    sharingLog: { toArray: vi.fn().mockResolvedValue([]) },
  },
}));
```

2. Add `onboardingDismissed: false` to the `getSettings` mock return value (add it to the object at line 30-38).

3. Add `onboardingDismissed: false` to the `defaultSettings` constant at line 55-65.

Then update the `SharingLogSection` and `DataManagementSection` test blocks. Replace the `SharingLogSection` describe block:

```typescript
describe("SharingLogSection", () => {
  it("renders empty state", () => {
    render(<SharingLogSection events={[]} />);
    expect(screen.getByText(/no data has been shared/i)).toBeDefined();
  });

  it("renders sharing events", () => {
    const events = [
      { id: 1, timestamp: "2026-03-24T10:00:00Z", observationCount: 5, status: "success" as const },
      { id: 2, timestamp: "2026-03-24T11:00:00Z", observationCount: 3, status: "error" as const, errorMessage: "Network error" },
    ];
    render(<SharingLogSection events={events} />);
    expect(screen.getByText(/5 observations/)).toBeDefined();
    expect(screen.getByText(/Network error/)).toBeDefined();
  });
});
```

Replace the `DataManagementSection` describe block:

```typescript
describe("DataManagementSection", () => {
  it("renders delete local data button", () => {
    render(<DataManagementSection onDataDeleted={() => {}} contributorId="" />);
    expect(
      screen.getByRole("button", { name: /delete all local data/i }),
    ).toBeDefined();
  });

  it("renders disabled server deletion button when no contributorId", () => {
    render(<DataManagementSection onDataDeleted={() => {}} contributorId="" />);
    const btn = screen.getByRole("button", { name: /request server deletion/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("renders enabled server deletion button when contributorId exists", () => {
    render(
      <DataManagementSection
        onDataDeleted={() => {}}
        contributorId="00000000-0000-0000-0000-000000000001"
      />,
    );
    const btn = screen.getByRole("button", { name: /request server deletion/i });
    expect(btn.hasAttribute("disabled")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/settings/settings.test.tsx`
Expected: FAIL — `SharingLogSection` doesn't accept `events` prop yet, `DataManagementSection` doesn't accept `contributorId`.

- [ ] **Step 3: Update `components/settings/SharingLogSection.tsx`**

Replace the full file:

```typescript
import type { SharingEvent } from "@/lib/types";
import styles from "./SharingLogSection.module.css";

interface SharingLogSectionProps {
  events: SharingEvent[];
}

export function SharingLogSection({ events }: SharingLogSectionProps) {
  if (events.length === 0) {
    return (
      <div className={styles.emptyState}>
        No data has been shared yet. Enable contribution above to start helping
        the community.
      </div>
    );
  }

  // Show newest first
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className={styles.logList}>
      {sorted.map((event) => (
        <div key={event.id} className={styles.logEntry}>
          <span className={styles.logTime}>
            {new Date(event.timestamp).toLocaleString()}
          </span>
          <span className={event.status === "success" ? styles.logSuccess : styles.logError}>
            {event.status === "success"
              ? `${event.observationCount} observations shared`
              : `Error: ${event.errorMessage ?? "Unknown error"}`}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update `components/settings/DataManagementSection.tsx`**

Replace the full file:

```typescript
import { useState } from "react";
import { db } from "@/lib/db";
import { deleteAllLocalData } from "@/lib/settings";
import styles from "./DataManagementSection.module.css";

interface DataManagementSectionProps {
  onDataDeleted: () => void;
  contributorId: string;
}

export function DataManagementSection({
  onDataDeleted,
  contributorId,
}: DataManagementSectionProps) {
  const [serverResult, setServerResult] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "This will permanently delete all your tracked price data. Your consent history will be preserved. Continue?",
    );
    if (!confirmed) return;

    await deleteAllLocalData(db);
    onDataDeleted();
  }

  async function handleServerDelete() {
    const confirmed = window.confirm(
      "This will permanently delete all your data from the community server. This cannot be undone. Continue?",
    );
    if (!confirmed) return;

    try {
      const response = await browser.runtime.sendMessage({
        type: "DELETE_SERVER_DATA",
        contributorId,
      });
      setServerResult(`Deleted ${response.deleted} observations from server.`);
    } catch {
      setServerResult("Failed to delete server data. Please try again.");
    }
  }

  return (
    <div>
      <div className={styles.buttons}>
        <button className={styles.deleteButton} onClick={handleDelete}>
          Delete all local data
        </button>
        <button
          className={styles.serverButton}
          disabled={!contributorId}
          onClick={handleServerDelete}
        >
          Request server deletion
        </button>
      </div>
      {serverResult ? (
        <p className={styles.hint}>{serverResult}</p>
      ) : (
        <p className={styles.hint}>
          {contributorId
            ? "Request deletion of all your data from the community server."
            : "Server deletion will be available after you've contributed data."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update `components/settings/SettingsPage.tsx` to pass new props**

In `SettingsPage.tsx`, update the `SharingLogSection` and `DataManagementSection` usages.

Add this state and effect at the top of the component (after the existing `loadData` effect):

```typescript
const [sharingEvents, setSharingEvents] = useState<SharingEvent[]>([]);
```

Add to the `loadData` function, after the existing `Promise.all`:

```typescript
const events = await db.sharingLog.toArray();
setSharingEvents(events);
```

Update the `SharingLogSection` render:

```tsx
<SharingLogSection events={sharingEvents} />
```

Update the `DataManagementSection` render:

```tsx
<DataManagementSection
  onDataDeleted={loadData}
  contributorId={settings.contributorId}
/>
```

Add the import at the top of the file:

```typescript
import type { SharingEvent } from "@/lib/types";
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/settings/settings.test.tsx`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/settings/SharingLogSection.tsx components/settings/DataManagementSection.tsx components/settings/SettingsPage.tsx test/components/settings/settings.test.tsx
git commit -m "feat: wire sharing log display and server deletion button"
```

---

### Task 6: Onboarding banner in popup

**Files:**
- Create: `components/popup/OnboardingBanner.tsx`
- Modify: `entrypoints/popup/App.tsx`
- Create: `test/components/popup/onboarding.test.tsx`

- [ ] **Step 1: Write onboarding tests**

Create `test/components/popup/onboarding.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingBanner } from "../../../components/popup/OnboardingBanner";

// Stub the WXT `browser` global used by the component
beforeAll(() => {
  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => path,
    },
  });
});

describe("OnboardingBanner", () => {
  it("renders when conditions are met", () => {
    render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={false}
        onboardingDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/7 products/)).toBeDefined();
    expect(screen.getByText(/Enable in settings/)).toBeDefined();
  });

  it("does not render when contribution is already enabled", () => {
    const { container } = render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={true}
        onboardingDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("does not render when already dismissed", () => {
    const { container } = render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={false}
        onboardingDismissed={true}
        onDismiss={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("does not render when fewer than 5 products", () => {
    const { container } = render(
      <OnboardingBanner
        distinctProducts={3}
        contributionEnabled={false}
        onboardingDismissed={false}
        onDismiss={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(
      <OnboardingBanner
        distinctProducts={7}
        contributionEnabled={false}
        onboardingDismissed={false}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/popup/onboarding.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/popup/OnboardingBanner.tsx`**

```typescript
const THRESHOLD = 5;

interface OnboardingBannerProps {
  distinctProducts: number;
  contributionEnabled: boolean;
  onboardingDismissed: boolean;
  onDismiss: () => void;
}

export function OnboardingBanner({
  distinctProducts,
  contributionEnabled,
  onboardingDismissed,
  onDismiss,
}: OnboardingBannerProps) {
  if (contributionEnabled || onboardingDismissed || distinctProducts < THRESHOLD) {
    return null;
  }

  return (
    <div
      style={{
        background: "#e8f5e9",
        border: "1px solid #a5d6a7",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 12,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          You've tracked{" "}
          <strong>{distinctProducts} products</strong>! Help other Australians
          by sharing your price observations.
        </div>
        <button
          aria-label="dismiss"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 0 0 8px",
            color: "#666",
          }}
        >
          ✕
        </button>
      </div>
      <a
        href={browser.runtime.getURL("/options.html")}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          marginTop: 8,
          color: "#2e7d32",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Enable in settings →
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Update `entrypoints/popup/App.tsx`**

Add the OnboardingBanner to the popup. Add these imports:

```typescript
import { OnboardingBanner } from "@/components/popup/OnboardingBanner";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "@/lib/store";
```

Add settings state:

```typescript
const [settings, setSettings] = useState<UserSettings | null>(null);
```

Update the `useEffect` to also load settings:

```typescript
useEffect(() => {
  Promise.all([
    getStorageStats(db),
    getRecentObservations(db, 10),
    getSettings(db),
  ])
    .then(([storageStats, recent, userSettings]) => {
      setStats({
        distinctProducts: storageStats.distinctProducts,
        totalObservations: storageStats.totalObservations,
        byChain: storageStats.byChain,
      });
      setObservations(recent);
      setSettings(userSettings);
    })
    .catch(() => setError(true))
    .finally(() => setLoading(false));
}, []);
```

Add dismiss handler (uses `saveSettings` instead of `updateSetting` to avoid polluting the consent log — dismissing the banner is not a consent event):

```typescript
async function handleDismissOnboarding() {
  await saveSettings(db, { onboardingDismissed: true });
  setSettings((prev) => prev ? { ...prev, onboardingDismissed: true } : prev);
}
```

Render the banner after `<PopupHeader />`:

```tsx
{settings && (
  <OnboardingBanner
    distinctProducts={stats.distinctProducts}
    contributionEnabled={settings.contributionEnabled}
    onboardingDismissed={settings.onboardingDismissed}
    onDismiss={handleDismissOnboarding}
  />
)}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run test/components/popup/`
Expected: all pass (both existing popup tests and new onboarding tests).

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/michaelryan/Programming/JavaScript/Chook_Check && npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/popup/OnboardingBanner.tsx entrypoints/popup/App.tsx test/components/popup/onboarding.test.tsx
git commit -m "feat: add onboarding banner encouraging contribution"
```

---

## Post-implementation checklist

After all 6 tasks are complete:

1. Run full test suite: `npx vitest run` — all tests pass
2. Run TypeScript check: `npx tsc --noEmit` — no errors
3. Build the extension: `npx wxt build` — succeeds
4. Load the extension in Chrome:
   - Browse a few Woolworths/Coles product pages → observations saved locally
   - Enable contribution in settings → check console for submission logs after 5 minutes
   - Open overlay → verify community stats section (loading → data or "not enough contributors")
   - Check sharing log in settings → entries appear after submission
   - Click "Request server deletion" → verify confirmation and result
5. Verify onboarding banner appears in popup after tracking 5+ distinct products
6. Verify banner does not reappear after dismissal
