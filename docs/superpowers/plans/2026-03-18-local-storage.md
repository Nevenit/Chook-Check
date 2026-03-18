# Local Storage Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist scraped PriceObservation data into IndexedDB via Dexie.js with deduplication, query/export operations, and automatic retention cleanup.

**Architecture:** Dexie.js wraps IndexedDB with typed tables and version-based migrations. Storage layer is split by responsibility: `db.ts` (schema), `store.ts` (writes + dedup), `data.ts` (reads), `export.ts` (JSON/CSV), `retention.ts` (cleanup). Background service worker wires it all together.

**Tech Stack:** TypeScript, Dexie.js, WXT, Vitest + happy-dom + fake-indexeddb for testing.

**Spec:** `docs/superpowers/specs/2026-03-18-local-storage-design.md`

---

### Task 1: Install dependencies and test setup

**Files:**
- Modify: `package.json`
- Modify: `test/setup.ts`
- Create: `test/helpers.ts`

- [ ] **Step 1: Install dexie and fake-indexeddb**

```bash
npm install dexie
npm install --save-dev fake-indexeddb
```

- [ ] **Step 2: Add fake-indexeddb to test setup**

In `test/setup.ts`, add the import so all tests have the IndexedDB polyfill available in the happy-dom environment:

```typescript
// Vitest global setup
// Polyfill IndexedDB for Dexie tests (no-op in tests that don't use it)
import "fake-indexeddb/auto";
```

- [ ] **Step 3: Create shared test helper for building observations**

Create `test/helpers.ts` — a factory function used by store, data, export, and retention tests:

```typescript
import type { PriceObservation } from "../lib/types";

export function makeObservation(
  overrides: Partial<PriceObservation> = {},
): PriceObservation {
  return {
    productId: "test-product-1",
    productName: "Test Product",
    brand: null,
    category: null,
    gtin: null,
    storeChain: "woolworths",
    priceCents: 350,
    wasPriceCents: null,
    unitPriceCents: null,
    unitMeasure: null,
    promoType: null,
    isPersonalised: false,
    pageUrl: "https://www.woolworths.com.au/shop/productdetails/123",
    observedAt: "2026-03-18T12:00:00.000Z",
    contributed: false,
    ...overrides,
  };
}
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All 66 existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json test/setup.ts test/helpers.ts
git commit -m "chore: add dexie and fake-indexeddb dependencies, test helpers"
```

---

### Task 2: Database schema — `lib/db.ts`

**Files:**
- Create: `lib/db.ts`
- Create: `test/lib/db.test.ts`

- [ ] **Step 1: Write failing tests for database schema**

Create `test/lib/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB");
});

afterEach(async () => {
  await db.delete();
});

describe("ChookCheckDB", () => {
  it("creates the priceObservations table", async () => {
    await db.open();
    expect(db.priceObservations).toBeDefined();
  });

  it("creates the userSettings table", async () => {
    await db.open();
    expect(db.userSettings).toBeDefined();
  });

  it("has the correct indexes on priceObservations", async () => {
    await db.open();
    const schema = db.priceObservations.schema;
    const indexNames = schema.indexes.map((idx) => idx.name);
    expect(indexNames).toContain("productId");
    expect(indexNames).toContain("storeChain");
    expect(indexNames).toContain("observedAt");
    expect(indexNames).toContain("[productId+observedAt]");
  });

  it("auto-increments the id on priceObservations", async () => {
    await db.open();
    expect(db.priceObservations.schema.primKey.auto).toBe(true);
  });

  it("uses 'key' as primary key on userSettings", async () => {
    await db.open();
    expect(db.userSettings.schema.primKey.name).toBe("key");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/db.test.ts`
Expected: FAIL — cannot import `ChookCheckDB` (module does not exist)

- [ ] **Step 3: Implement the database schema**

Create `lib/db.ts`:

```typescript
import Dexie, { type EntityTable } from "dexie";
import type { PriceObservation, UserSettings } from "./types";

export type StoredSettings = UserSettings & { key: string };

export class ChookCheckDB extends Dexie {
  priceObservations!: EntityTable<PriceObservation, "id">;
  userSettings!: EntityTable<StoredSettings, "key">;

  constructor(name = "ChookCheckDB") {
    super(name);
    this.version(1).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
    });
  }
}

export const db = new ChookCheckDB();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/db.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Verify all tests pass (no regressions)**

Run: `npx vitest run`
Expected: All tests pass (existing 66 + new 5)

- [ ] **Step 6: Lint**

Run: `npx eslint lib/db.ts test/lib/db.test.ts`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts test/lib/db.test.ts
git commit -m "feat: add Dexie database schema with priceObservations and userSettings tables"
```

---

### Task 3: Write operations — `saveObservation` with deduplication

**Files:**
- Create: `lib/store.ts`
- Create: `test/lib/store.test.ts`

- [ ] **Step 1: Write failing tests for saveObservation**

Create `test/lib/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { saveObservation } from "../../lib/store";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_store");
});

afterEach(async () => {
  await db.delete();
});

describe("saveObservation", () => {
  it("inserts a new observation into an empty database", async () => {
    const obs = makeObservation();
    await saveObservation(db, obs);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].productId).toBe("test-product-1");
    expect(all[0].priceCents).toBe(350);
  });

  it("deduplicates same product, same day, same price — updates observedAt", async () => {
    const obs1 = makeObservation({
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-18T14:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].observedAt).toBe("2026-03-18T14:00:00.000Z");
  });

  it("inserts new row when same product, same day, different price", async () => {
    const obs1 = makeObservation({
      priceCents: 350,
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      priceCents: 300,
      observedAt: "2026-03-18T14:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
    const prices = all.map((o) => o.priceCents).sort();
    expect(prices).toEqual([300, 350]);
  });

  it("inserts new row for different product on same day", async () => {
    const obs1 = makeObservation({
      productId: "product-a",
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      productId: "product-b",
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
  });

  it("inserts new row for same product on different days", async () => {
    const obs1 = makeObservation({
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-19T12:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
  });

  it("does not throw on storage errors — logs and continues", async () => {
    // Delete the database to force errors on subsequent operations
    await db.delete();

    const obs = makeObservation();
    // Should not throw — errors are caught and logged
    await expect(saveObservation(db, obs)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/store.test.ts`
Expected: FAIL — cannot import `saveObservation` (module does not exist)

- [ ] **Step 3: Implement saveObservation with dedup logic**

Create `lib/store.ts`:

```typescript
import type { ChookCheckDB } from "./db";
import type { PriceObservation } from "./types";

/**
 * Computes the local calendar day boundaries for a given ISO timestamp.
 * Uses the browser's local timezone (correct for Australian users).
 */
function getLocalDayBounds(isoTimestamp: string): {
  start: string;
  end: string;
} {
  const date = new Date(isoTimestamp);
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  );
  return {
    start: dayStart.toISOString(),
    end: dayEnd.toISOString(),
  };
}

/**
 * Saves a price observation with deduplication.
 * - Same product + same local day + same price → update observedAt
 * - Same product + same local day + different price → insert new row
 * - No match → insert new row
 *
 * Never throws — logs errors and continues so the scraping pipeline is not broken.
 */
export async function saveObservation(
  db: ChookCheckDB,
  obs: PriceObservation,
): Promise<void> {
  try {
    const { start, end } = getLocalDayBounds(obs.observedAt);

    const existing = await db.priceObservations
      .where("[productId+observedAt]")
      .between([obs.productId, start], [obs.productId, end], true, false)
      .toArray();

    const samePriceMatch = existing.find(
      (e) => e.priceCents === obs.priceCents,
    );

    if (samePriceMatch) {
      await db.priceObservations.update(samePriceMatch.id!, {
        observedAt: obs.observedAt,
      });
    } else {
      await db.priceObservations.add(obs);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.error(
        "[Chook Check] Storage quota exceeded, attempting emergency cleanup",
      );
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        await db.priceObservations
          .where("observedAt")
          .below(cutoff.toISOString())
          .delete();
        await db.priceObservations.add(obs);
      } catch {
        console.error(
          "[Chook Check] Storage quota exceeded after cleanup, observation dropped",
        );
      }
    } else {
      console.error("[Chook Check] Failed to save observation:", error);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/store.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Lint**

Run: `npx eslint lib/store.ts test/lib/store.test.ts`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts test/lib/store.test.ts
git commit -m "feat: add saveObservation with calendar-day deduplication"
```

---

### Task 4: Write operations — settings (initDefaults, saveSettings)

**Files:**
- Modify: `lib/store.ts`
- Modify: `test/lib/store.test.ts`

- [ ] **Step 1: Add failing tests for settings operations**

Append to `test/lib/store.test.ts`, after the existing `saveObservation` describe block:

```typescript
import { saveObservation, initDefaults, saveSettings } from "../../lib/store";

// ... (update the existing import line above to include initDefaults, saveSettings)

describe("initDefaults", () => {
  it("creates default settings row on first call", async () => {
    await initDefaults(db);

    const settings = await db.userSettings.get("default");
    expect(settings).toBeDefined();
    expect(settings!.contributionEnabled).toBe(false);
    expect(settings!.contributorId).toBe("");
    expect(settings!.contributorIdMode).toBe("anonymous");
    expect(settings!.shareBrowser).toBe(false);
    expect(settings!.shareState).toBe(false);
    expect(settings!.shareCity).toBe(false);
    expect(settings!.shareStore).toBe(false);
    expect(settings!.linkAccount).toBe(false);
    expect(settings!.consentLog).toEqual([]);
  });

  it("does not overwrite existing settings on second call", async () => {
    await initDefaults(db);
    await db.userSettings.update("default", { contributionEnabled: true });

    await initDefaults(db);

    const settings = await db.userSettings.get("default");
    expect(settings!.contributionEnabled).toBe(true);
  });
});

describe("saveSettings", () => {
  it("updates a single field in existing settings", async () => {
    await initDefaults(db);
    await saveSettings(db, { contributionEnabled: true });

    const settings = await db.userSettings.get("default");
    expect(settings!.contributionEnabled).toBe(true);
    expect(settings!.contributorIdMode).toBe("anonymous");
  });

  it("creates defaults first if no settings exist, then applies changes", async () => {
    await saveSettings(db, { shareCity: true });

    const settings = await db.userSettings.get("default");
    expect(settings!.shareCity).toBe(true);
    expect(settings!.contributionEnabled).toBe(false);
  });
});
```

Note: Update the import line at the top of the file to include `initDefaults` and `saveSettings`.

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `npx vitest run test/lib/store.test.ts`
Expected: FAIL — `initDefaults` and `saveSettings` are not exported from `lib/store`

- [ ] **Step 3: Implement initDefaults and saveSettings**

Add to `lib/store.ts`, after the existing `saveObservation` function. Also add the `UserSettings` import:

```typescript
import type { ChookCheckDB } from "./db";
import type { PriceObservation, UserSettings } from "./types";

// ... (existing saveObservation code stays)

/**
 * Creates the default UserSettings row if it doesn't already exist.
 * Called once on background script startup.
 */
export async function initDefaults(db: ChookCheckDB): Promise<void> {
  const existing = await db.userSettings.get("default");
  if (existing) return;

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
  });
}

/**
 * Merge-updates user settings. Creates defaults first if needed.
 */
export async function saveSettings(
  db: ChookCheckDB,
  settings: Partial<UserSettings>,
): Promise<void> {
  const existing = await db.userSettings.get("default");
  if (!existing) {
    await initDefaults(db);
  }
  await db.userSettings.update("default", settings);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/store.test.ts`
Expected: All 10 tests PASS (6 saveObservation + 2 initDefaults + 2 saveSettings)

- [ ] **Step 5: Lint**

Run: `npx eslint lib/store.ts test/lib/store.test.ts`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts test/lib/store.test.ts
git commit -m "feat: add initDefaults and saveSettings for user preferences"
```

---

### Task 5: Read operations — `lib/data.ts`

**Files:**
- Create: `lib/data.ts`
- Create: `test/lib/data.test.ts`

- [ ] **Step 1: Write failing tests for all read operations**

Create `test/lib/data.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import {
  getProductHistory,
  getRecentObservations,
  getProductStats,
  searchProducts,
  getStorageStats,
} from "../../lib/data";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_data");
});

afterEach(async () => {
  await db.delete();
});

describe("getProductHistory", () => {
  it("returns observations for a specific product sorted by date", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({
        productId: "prod-1",
        observedAt: "2026-03-18T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-1",
        observedAt: "2026-03-16T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-2",
        observedAt: "2026-03-17T12:00:00.000Z",
      }),
    ]);

    const history = await getProductHistory(db, "prod-1");
    expect(history).toHaveLength(2);
    expect(history[0].observedAt).toBe("2026-03-16T12:00:00.000Z");
    expect(history[1].observedAt).toBe("2026-03-18T12:00:00.000Z");
  });

  it("returns empty array for unknown product", async () => {
    const history = await getProductHistory(db, "nonexistent");
    expect(history).toEqual([]);
  });
});

describe("getRecentObservations", () => {
  it("returns observations ordered by most recent first", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({
        productId: "a",
        observedAt: "2026-03-16T12:00:00.000Z",
      }),
      makeObservation({
        productId: "b",
        observedAt: "2026-03-18T12:00:00.000Z",
      }),
      makeObservation({
        productId: "c",
        observedAt: "2026-03-17T12:00:00.000Z",
      }),
    ]);

    const recent = await getRecentObservations(db, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].productId).toBe("b");
    expect(recent[1].productId).toBe("c");
  });

  it("defaults to 50 results", async () => {
    const recent = await getRecentObservations(db);
    expect(recent).toEqual([]);
  });
});

describe("getProductStats", () => {
  it("computes min, max, avg, count for a product", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({
        productId: "prod-1",
        priceCents: 200,
        observedAt: "2026-03-16T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-1",
        priceCents: 400,
        observedAt: "2026-03-17T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-1",
        priceCents: 300,
        observedAt: "2026-03-18T12:00:00.000Z",
      }),
    ]);

    const stats = await getProductStats(db, "prod-1");
    expect(stats).toEqual({ min: 200, max: 400, avg: 300, count: 3 });
  });

  it("rounds average to nearest integer", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({
        productId: "prod-2",
        priceCents: 100,
        observedAt: "2026-03-16T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-2",
        priceCents: 200,
        observedAt: "2026-03-17T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-2",
        priceCents: 200,
        observedAt: "2026-03-18T12:00:00.000Z",
      }),
    ]);

    const stats = await getProductStats(db, "prod-2");
    expect(stats).toEqual({ min: 100, max: 200, avg: 167, count: 3 });
  });

  it("returns null for unknown product", async () => {
    const stats = await getProductStats(db, "nonexistent");
    expect(stats).toBeNull();
  });
});

describe("searchProducts", () => {
  it("finds observations by product name substring (case-insensitive)", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productName: "Woolworths Full Cream Milk 2L" }),
      makeObservation({
        productId: "prod-2",
        productName: "Coles Skim Milk 1L",
      }),
      makeObservation({
        productId: "prod-3",
        productName: "Cadbury Chocolate Block",
      }),
    ]);

    const results = await searchProducts(db, "milk");
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.productName);
    expect(names).toContain("Woolworths Full Cream Milk 2L");
    expect(names).toContain("Coles Skim Milk 1L");
  });

  it("returns empty array when no match", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productName: "Cadbury Chocolate Block" }),
    ]);

    const results = await searchProducts(db, "bread");
    expect(results).toEqual([]);
  });
});

describe("getStorageStats", () => {
  it("returns stats with observations present", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({
        storeChain: "woolworths",
        observedAt: "2026-03-16T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-2",
        storeChain: "woolworths",
        observedAt: "2026-03-18T12:00:00.000Z",
      }),
      makeObservation({
        productId: "prod-3",
        storeChain: "coles",
        observedAt: "2026-03-17T12:00:00.000Z",
      }),
    ]);

    const stats = await getStorageStats(db);
    expect(stats.totalObservations).toBe(3);
    expect(stats.oldestDate).toBe("2026-03-16T12:00:00.000Z");
    expect(stats.newestDate).toBe("2026-03-18T12:00:00.000Z");
    expect(stats.byChain).toEqual({ woolworths: 2, coles: 1 });
  });

  it("returns zeroed stats for empty database", async () => {
    const stats = await getStorageStats(db);
    expect(stats).toEqual({
      totalObservations: 0,
      oldestDate: null,
      newestDate: null,
      byChain: {},
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/data.test.ts`
Expected: FAIL — cannot import from `lib/data` (module does not exist)

- [ ] **Step 3: Implement all read operations**

Create `lib/data.ts`:

```typescript
import type { ChookCheckDB } from "./db";
import type { PriceObservation } from "./types";

export async function getProductHistory(
  db: ChookCheckDB,
  productId: string,
): Promise<PriceObservation[]> {
  return db.priceObservations
    .where("productId")
    .equals(productId)
    .sortBy("observedAt");
}

export async function getRecentObservations(
  db: ChookCheckDB,
  limit = 50,
): Promise<PriceObservation[]> {
  return db.priceObservations
    .orderBy("observedAt")
    .reverse()
    .limit(limit)
    .toArray();
}

export async function getProductStats(
  db: ChookCheckDB,
  productId: string,
): Promise<{ min: number; max: number; avg: number; count: number } | null> {
  const observations = await db.priceObservations
    .where("productId")
    .equals(productId)
    .toArray();

  if (observations.length === 0) return null;

  const prices = observations.map((o) => o.priceCents);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    count: observations.length,
  };
}

export async function searchProducts(
  db: ChookCheckDB,
  query: string,
): Promise<PriceObservation[]> {
  const lowerQuery = query.toLowerCase();
  return db.priceObservations
    .filter((obs) => obs.productName.toLowerCase().includes(lowerQuery))
    .toArray();
}

export async function getStorageStats(db: ChookCheckDB): Promise<{
  totalObservations: number;
  oldestDate: string | null;
  newestDate: string | null;
  byChain: Record<string, number>;
}> {
  const total = await db.priceObservations.count();

  if (total === 0) {
    return {
      totalObservations: 0,
      oldestDate: null,
      newestDate: null,
      byChain: {},
    };
  }

  const oldest = await db.priceObservations.orderBy("observedAt").first();
  const newest = await db.priceObservations
    .orderBy("observedAt")
    .reverse()
    .first();

  const byChain: Record<string, number> = {};
  const woolworths = await db.priceObservations
    .where("storeChain")
    .equals("woolworths")
    .count();
  const coles = await db.priceObservations
    .where("storeChain")
    .equals("coles")
    .count();
  if (woolworths > 0) byChain.woolworths = woolworths;
  if (coles > 0) byChain.coles = coles;

  return {
    totalObservations: total,
    oldestDate: oldest?.observedAt ?? null,
    newestDate: newest?.observedAt ?? null,
    byChain,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/data.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Lint**

Run: `npx eslint lib/data.ts test/lib/data.test.ts`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/data.ts test/lib/data.test.ts
git commit -m "feat: add read operations for product history, search, and stats"
```

---

### Task 6: Data export — `lib/export.ts`

**Files:**
- Create: `lib/export.ts`
- Create: `test/lib/export.test.ts`

- [ ] **Step 1: Write failing tests for JSON and CSV export**

Create `test/lib/export.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { exportAsJSON, exportAsCSV } from "../../lib/export";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_export");
});

afterEach(async () => {
  await db.delete();
});

describe("exportAsJSON", () => {
  it("exports all observations as formatted JSON", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "prod-1", priceCents: 350 }),
      makeObservation({ productId: "prod-2", priceCents: 500 }),
    ]);

    const json = await exportAsJSON(db);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].productId).toBe("prod-1");
    expect(parsed[1].productId).toBe("prod-2");
  });

  it("returns empty array JSON for empty database", async () => {
    const json = await exportAsJSON(db);
    expect(JSON.parse(json)).toEqual([]);
  });
});

describe("exportAsCSV", () => {
  it("exports observations with header row and data rows", async () => {
    await db.priceObservations.add(
      makeObservation({
        productId: "prod-1",
        productName: "Test Product",
        priceCents: 350,
        storeChain: "woolworths",
      }),
    );

    const csv = await exportAsCSV(db);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "id,productId,productName,brand,category,gtin,storeChain,priceCents,wasPriceCents,unitPriceCents,unitMeasure,promoType,isPersonalised,pageUrl,observedAt,contributed",
    );
    expect(lines).toHaveLength(2);
    // Verify field ordering by checking positional values
    const fields = lines[1].split(",");
    expect(fields[1]).toBe("prod-1");           // productId
    expect(fields[2]).toBe("Test Product");     // productName
    expect(fields[6]).toBe("woolworths");       // storeChain
    expect(fields[7]).toBe("350");              // priceCents
  });

  it("escapes fields containing commas", async () => {
    await db.priceObservations.add(
      makeObservation({
        productName: "Milk, Full Cream 2L",
      }),
    );

    const csv = await exportAsCSV(db);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Milk, Full Cream 2L"');
  });

  it("returns empty string for empty database", async () => {
    const csv = await exportAsCSV(db);
    expect(csv).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/export.test.ts`
Expected: FAIL — cannot import from `lib/export` (module does not exist)

- [ ] **Step 3: Implement JSON and CSV export**

Create `lib/export.ts`:

```typescript
import type { ChookCheckDB } from "./db";
import type { PriceObservation } from "./types";

const CSV_HEADERS = [
  "id",
  "productId",
  "productName",
  "brand",
  "category",
  "gtin",
  "storeChain",
  "priceCents",
  "wasPriceCents",
  "unitPriceCents",
  "unitMeasure",
  "promoType",
  "isPersonalised",
  "pageUrl",
  "observedAt",
  "contributed",
] as const;

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAsJSON(db: ChookCheckDB): Promise<string> {
  const observations = await db.priceObservations.toArray();
  return JSON.stringify(observations, null, 2);
}

export async function exportAsCSV(db: ChookCheckDB): Promise<string> {
  const observations = await db.priceObservations.toArray();
  if (observations.length === 0) return "";

  const rows = observations.map((obs) =>
    CSV_HEADERS.map((h) =>
      escapeCsvField(obs[h as keyof PriceObservation]),
    ).join(","),
  );

  return [CSV_HEADERS.join(","), ...rows].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/export.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Lint**

Run: `npx eslint lib/export.ts test/lib/export.test.ts`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/export.ts test/lib/export.test.ts
git commit -m "feat: add JSON and CSV data export functions"
```

---

### Task 7: Retention and cleanup — `lib/retention.ts`

**Files:**
- Create: `lib/retention.ts`
- Create: `test/lib/retention.test.ts`

- [ ] **Step 1: Write failing tests for retention operations**

Create `test/lib/retention.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { deleteOlderThan, deleteProduct, deleteAll } from "../../lib/retention";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_retention");
});

afterEach(async () => {
  await db.delete();
});

describe("deleteOlderThan", () => {
  it("deletes observations older than the specified number of days", async () => {
    const now = new Date();
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 400);
    const recentDate = new Date(now);
    recentDate.setDate(recentDate.getDate() - 100);

    await db.priceObservations.bulkAdd([
      makeObservation({
        productId: "old",
        observedAt: oldDate.toISOString(),
      }),
      makeObservation({
        productId: "recent",
        observedAt: recentDate.toISOString(),
      }),
    ]);

    const deleted = await deleteOlderThan(db, 365);
    expect(deleted).toBe(1);

    const remaining = await db.priceObservations.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].productId).toBe("recent");
  });

  it("returns 0 when nothing to delete", async () => {
    await db.priceObservations.add(
      makeObservation({ observedAt: new Date().toISOString() }),
    );

    const deleted = await deleteOlderThan(db, 365);
    expect(deleted).toBe(0);
  });
});

describe("deleteProduct", () => {
  it("deletes all observations for a specific product", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({
        productId: "target",
        observedAt: "2026-03-16T12:00:00.000Z",
      }),
      makeObservation({
        productId: "target",
        observedAt: "2026-03-17T12:00:00.000Z",
      }),
      makeObservation({
        productId: "keep",
        observedAt: "2026-03-18T12:00:00.000Z",
      }),
    ]);

    const deleted = await deleteProduct(db, "target");
    expect(deleted).toBe(2);

    const remaining = await db.priceObservations.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].productId).toBe("keep");
  });
});

describe("deleteAll", () => {
  it("removes all observations from the table", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "a" }),
      makeObservation({ productId: "b" }),
      makeObservation({ productId: "c" }),
    ]);

    await deleteAll(db);

    const remaining = await db.priceObservations.toArray();
    expect(remaining).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/retention.test.ts`
Expected: FAIL — cannot import from `lib/retention` (module does not exist)

- [ ] **Step 3: Implement retention operations**

Create `lib/retention.ts`:

```typescript
import type { ChookCheckDB } from "./db";

/**
 * Deletes observations older than the specified number of days.
 * Returns the number of deleted rows.
 */
export async function deleteOlderThan(
  db: ChookCheckDB,
  days: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.priceObservations
    .where("observedAt")
    .below(cutoff.toISOString())
    .delete();
}

/**
 * Deletes all observations for a specific product.
 * Returns the number of deleted rows.
 */
export async function deleteProduct(
  db: ChookCheckDB,
  productId: string,
): Promise<number> {
  return db.priceObservations
    .where("productId")
    .equals(productId)
    .delete();
}

/**
 * Clears all observation data.
 */
export async function deleteAll(db: ChookCheckDB): Promise<void> {
  await db.priceObservations.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/retention.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Verify all tests pass (no regressions)**

Run: `npx vitest run`
Expected: All tests pass (existing 66 + new 33)

- [ ] **Step 6: Lint**

Run: `npx eslint lib/retention.ts test/lib/retention.test.ts`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add lib/retention.ts test/lib/retention.test.ts
git commit -m "feat: add retention operations for data lifecycle management"
```

---

### Task 8: Wire background service worker

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Update background script to use storage layer**

Replace the contents of `entrypoints/background.ts`:

```typescript
import { db } from "@/lib/db";
import { saveObservation, initDefaults } from "@/lib/store";
import { deleteOlderThan } from "@/lib/retention";

const RETENTION_ALARM = "chook-check-retention";
const RETENTION_DAYS = 365;
const RETENTION_INTERVAL_MINUTES = 1440; // 24 hours

export default defineBackground(() => {
  console.log("[Chook Check] Background service worker started");

  initDefaults(db).catch((err) =>
    console.error("[Chook Check] Failed to initialize defaults:", err),
  );

  browser.alarms.create(RETENTION_ALARM, {
    periodInMinutes: RETENTION_INTERVAL_MINUTES,
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
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "PRICE_OBSERVATION" && message.data) {
      const { productName, priceCents, storeChain } = message.data;
      console.log(
        `[Chook Check] ${storeChain}: ${productName} — $${(priceCents / 100).toFixed(2)}`,
      );
      saveObservation(db, message.data);
    }
  });
});
```

- [ ] **Step 2: Verify the extension builds for Chrome**

Run: `npx wxt build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify the extension builds for Firefox**

Run: `npx wxt build -b firefox`
Expected: Build succeeds with no errors

- [ ] **Step 4: Run all tests to confirm no regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Lint entire project**

Run: `npx eslint .`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: wire storage layer into background service worker with retention alarm"
```
