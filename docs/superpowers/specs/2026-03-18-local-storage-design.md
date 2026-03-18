# Local Storage Layer — Phase 3 Design

## Overview

Persist `PriceObservation` data scraped by Phase 2 content scripts into IndexedDB via Dexie.js. Provides write operations (with deduplication), read/query operations, data export, and automatic retention cleanup. All data stays local to the browser.

## Architecture

Dexie.js wraps IndexedDB, giving us typed tables, version-based migrations, and clean query ergonomics. The storage layer is split into focused modules by responsibility: schema definition, write ops, read ops, export, and retention.

### Database Schema

**Dexie class:** `ChookCheckDB extends Dexie`

**Table: `priceObservations`**

| Column | Type | Notes |
|--------|------|-------|
| id | number | Auto-increment primary key |
| productId | string | Store-specific product identifier |
| productName | string | |
| brand | string \| null | |
| category | string \| null | |
| gtin | string \| null | |
| storeChain | "woolworths" \| "coles" | |
| priceCents | number | |
| wasPriceCents | number \| null | |
| unitPriceCents | number \| null | |
| unitMeasure | string \| null | |
| promoType | string \| null | |
| isPersonalised | boolean | |
| pageUrl | string | |
| observedAt | string | ISO 8601 date string |
| contributed | boolean | Always `false` for now |

**Indexes:**
- `++id` — auto-increment primary key
- `productId` — look up all observations for a product
- `storeChain` — filter by retailer
- `observedAt` — range queries for retention cleanup
- `[productId+observedAt]` — compound index for dedup check and product history queries

**Table: `userSettings`**

Single-row table keyed by a fixed string `"default"`. Stores the `UserSettings` interface from `lib/types.ts`. Initialized with defaults on first run via `initDefaults()`.

| Column | Type | Notes |
|--------|------|-------|
| key | string | Always `"default"` |
| ...UserSettings fields | | Spread from the interface |

### Default UserSettings

`initDefaults()` creates the settings row with these values:

| Field | Default | Notes |
|-------|---------|-------|
| contributionEnabled | `false` | Opt-in only |
| contributorId | `""` | Empty until user opts in; generated as UUID at opt-in time |
| contributorIdMode | `"anonymous"` | |
| shareBrowser | `false` | |
| shareState | `false` | |
| shareCity | `false` | |
| shareStore | `false` | |
| linkAccount | `false` | |
| consentLog | `[]` | Empty array |

### Deduplication Strategy

When `saveObservation` receives a new observation:

1. Extract the user's **local calendar date** from the observation's `observedAt` ISO timestamp (Australian prices change at local midnight, not UTC)
2. Query the compound index `[productId+observedAt]` using a **range query** — `where('[productId+observedAt]').between([productId, dayStartISO], [productId, dayEndISO])` — to find any observations for the same product on the same local date
3. If a match exists with the **same `priceCents`** → update `observedAt` timestamp (refresh the existing row)
4. If a match exists with a **different `priceCents`** → insert a new row (price changed mid-day, keep both)
5. If no match → insert new row

Note: `productId` values are already chain-prefixed by the scrapers (e.g., extracted from chain-specific URLs), so the compound index implicitly scopes to a single retailer.

This captures price changes while avoiding duplicate rows from repeated visits to the same product page.

## File Structure

### New files

- **`lib/db.ts`** — Dexie subclass, schema definition, table declarations, single exported instance
- **`lib/store.ts`** — Write operations:
  - `saveObservation(obs: PriceObservation): Promise<void>` — dedup logic + insert/update
  - `saveSettings(settings: Partial<UserSettings>): Promise<void>` — merge-update settings
  - `initDefaults(): Promise<void>` — create default settings row if none exists
- **`lib/data.ts`** — Read operations:
  - `getProductHistory(productId: string): Promise<PriceObservation[]>` — all observations for a product, sorted by date
  - `getRecentObservations(limit?: number): Promise<PriceObservation[]>` — most recent observations across all products
  - `getProductStats(productId: string): Promise<{ min, max, avg, count }>` — price statistics
  - `searchProducts(query: string): Promise<PriceObservation[]>` — search by product name (in-memory filter via `toArray()` then `.filter()` — IndexedDB has no native substring search; fine for local datasets in the low thousands)
  - `getStorageStats(): Promise<{ totalObservations, oldestDate, newestDate, byChain }>` — dashboard stats
- **`lib/export.ts`** — Data export:
  - `exportAsJSON(): Promise<string>` — full dump as JSON
  - `exportAsCSV(): Promise<string>` — full dump as CSV
- **`lib/retention.ts`** — Data lifecycle:
  - `deleteOlderThan(days: number): Promise<number>` — returns count of deleted rows
  - `deleteProduct(productId: string): Promise<number>` — delete all observations for a product
  - `deleteAll(): Promise<void>` — clear all observation data
  - Scheduled cleanup: registered via `browser.alarms` in background script, runs daily, deletes observations older than the configured retention period (default 365 days)

### Modified files

- **`entrypoints/background.ts`** — Wire `saveObservation` into the message handler (fire-and-forget — no return value to content scripts), call `initDefaults()` on startup, register `browser.alarms` for daily retention cleanup

### Data Flow

```
Content Script (scraper)
  → browser.runtime.sendMessage({ type: "PRICE_OBSERVATION", data })
  → Background Service Worker
    → saveObservation(data)
      → dedup check via [productId+observedAt] compound index
      → insert or update in IndexedDB
```

## Testing Strategy

**Test environment:** Vitest with `fake-indexeddb` — Dexie supports this for unit testing without a real browser. Tests must import `fake-indexeddb/auto` in setup (or in each test file) to polyfill the `indexedDB` global into the happy-dom vitest environment.

**Test files:**
- `test/lib/db.test.ts` — Schema creation, table existence, index verification
- `test/lib/store.test.ts` — `saveObservation` (insert, dedup same price, insert different price same day), `saveSettings`, `initDefaults`
- `test/lib/data.test.ts` — `getProductHistory`, `getRecentObservations`, `getProductStats`, `searchProducts`, `getStorageStats`
- `test/lib/export.test.ts` — JSON and CSV export format correctness
- `test/lib/retention.test.ts` — `deleteOlderThan`, `deleteProduct`, `deleteAll`

Each test file gets a fresh Dexie instance (created in `beforeEach`, deleted in `afterEach`) for full isolation.

**Coverage focus:** Deduplication logic gets the most test cases — same product same day same price (update), same product same day different price (insert), different product same day (insert), edge cases around midnight/timezone boundaries.

## Error Handling

**IndexedDB failures:** `saveObservation` catches and logs errors but never throws. A storage failure must not break the scraping pipeline. The content script keeps working; the observation just doesn't persist.

**Quota exceeded:** `saveObservation` catches `QuotaExceededError` specifically and triggers an early retention cleanup (delete oldest 30 days of data), then retries once. If it still fails, log and move on.

**Corrupted database:** Dexie's version-based migrations handle schema changes. If the DB is truly corrupted, log the error. No auto-delete — the user can manually clear via the export/management UI in a future phase.

**Background script lifecycle:** MV3 service workers can be killed at any time. `browser.alarms` persists across restarts, so the daily retention cleanup survives service worker termination. No in-memory state needs preserving.

**No retry queues or complex recovery** — this is local-only storage. If an observation fails to save, the user will see the product again on their next visit.

## Dependencies

- **`dexie`** — IndexedDB wrapper (~15KB minified+gzipped)
- **`fake-indexeddb`** — dev dependency for testing
