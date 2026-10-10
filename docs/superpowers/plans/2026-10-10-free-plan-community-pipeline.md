# Free-Plan Community Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the community API run within Cloudflare Workers Free limits by precomputing public stats and the bulk snapshot, making ingestion set-based, and rewriting raw-data retention to use indexed date ranges.

**Architecture:** Ingestion marks touched products in a `dirty_products` table. An every-minute cron recomputes up to 100 products' public stats with set-based SQL into `product_stats`, applies one retention step, and cleans rate limits. A 30-minute cron assembles `product_stats` into a chunked snapshot with a content-hash ETag. Request handlers only read precomputed rows.

**Tech Stack:** Cloudflare Workers + D1 (SQLite: window functions, `json_each`, `json_extract`), Hono, Zod, Vitest with `@cloudflare/vitest-pool-workers`. Extension: WXT, TypeScript.

**Spec:** No separate spec. The requirements are the 2026-10-10 decisions and measurements in this plan's Context section.

## Context

Load tests on 2026-10-10 against synthetic data (local `wrangler dev`, instrumented D1 counts):

| Measurement                                                | Alpha (30 contributors) | Beta (300 contributors) |
| ---------------------------------------------------------- | ----------------------- | ----------------------- |
| Snapshot request: D1 queries                               | 5,167                   | 8,005                   |
| Snapshot request: rows read (same on a 304)                | 546k                    | 5.5M                    |
| Snapshot size                                              | 7.5 MB                  | 31.6 MB                 |
| Hourly cleanup: queries / rows read                        | ~210 / ~300k            | 297 / 3.25M             |
| Upload of 50 observations: queries (from code, ~3 per row) | ~153                    | ~153                    |

The user chose the **Workers Free plan** and a snapshot containing **only the fields the extension displays**. Free limits: 50 D1 queries per invocation, 10 ms CPU per request or cron run, 5M rows read and 100k rows written per day, 500 MB database. The extension reads `currentMedianCents`, `minCents`, `maxCents`, `observationCount`, `contributorCount`, and `promoFrequency`; 95% of today's snapshot is unused `priceHistory`.

## Global Constraints

- Every request handler and scheduled job stays within `D1_QUERY_BUDGET = 40` D1 queries per invocation (Free allows 50).
- Request handlers never scan `observations_v2`; they read only precomputed tables.
- The snapshot and `/api/v2/products/:id/stats` publish exactly: `productId`, `productName`, `brand`, `storeChain`, `quorum` (always `true`), `currentMedianCents`, `minCents`, `maxCents`, `observationCount`, `contributorCount`, `promoFrequency`.
- A product is public only when its current day exists: the latest UTC day within the last 90 days with at least 5 distinct contributors, using one latest sample per contributor/product/day.
- `currentMedianCents`, `minCents`, `maxCents` come from that current day. `observationCount` and `contributorCount` cover non-quarantined raw rows from the last 180 days. `promoFrequency` covers balanced samples from the last 180 days, with `null` offers keyed as `"none"`.
- Raw observations expire after 180 days. Days with at least 5 contributors are first materialized into `daily_product_aggregates`, kept 3 years and not published.
- Differential-pricing and observer-effect analysis code stays (unit-tested) but is not published by any route.
- API: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test` must pass. Extension: lint, typecheck, format, `npm run test:run`, both builds, and `npm run audit:build` must pass.
- No production deployment, tag, or migration against the remote database.

## Review Focus

1. A batch that repeats one `clientObservationId`, or repeats one already stored: the response counts sum to the batch length and each ID is stored once. (Task 1)
2. A product name with a non-BMP character (emoji) at a snapshot chunk boundary: the served JSON parses and the name is intact. (Task 3)
3. A contributor deletes their data: their products drop below quorum and leave the snapshot after the next refresh and build. (Task 2)
4. Retention deletes one expired day across several cron runs: the day's aggregate is computed once from the complete day, never from the remainder. (Task 4)
5. The latest day has 4 contributors but an earlier day has 5: the current price uses the earlier day. A product whose only qualifying day is 100 days old is not public. (Task 2)

---

### Task 1: Schema, query-budget helper, and set-based ingestion

**Files:**

- Create: `chook-check-api/migrations/0002_free_plan_pipeline.sql`
- Create: `chook-check-api/src/lib/limits.ts`
- Create: `chook-check-api/src/db/dirty-products.ts`
- Create: `chook-check-api/src/lib/ingest.ts`
- Create: `chook-check-api/test/query-budget.ts`
- Create: `chook-check-api/test/ingest.test.ts`
- Modify: `chook-check-api/src/routes/v2-observations.ts` (replace the per-observation loop)
- Modify: `chook-check-api/src/db/queries-v2.ts` (delete `isDuplicateV2`, `shouldQuarantineV2`, `insertObservationV2`)
- Modify: `chook-check-api/test/helpers.ts` (mirror new tables; clean them)
- Modify: `chook-check-api/test/migrations.test.ts` (apply 0002)

**Interfaces:**

- Produces: `D1_QUERY_BUDGET: number` (`src/lib/limits.ts`); `markProductsDirty(db: D1Database, productIds: string[], now: Date): Promise<void>` (`src/db/dirty-products.ts`); `submitObservationsV2(db: D1Database, contributorId: string, mode: "history" | "fairness", observations: ObservationV2Input[], now?: Date): Promise<SubmitResult>` where `SubmitResult = { accepted: number; duplicates: number; rejected: number; reasons: string[] }`; test helper `countQueries(db: D1Database): { db: D1Database; count: () => number }`.
- Tables produced by migration 0002: `dirty_products(product_id PK, marked_at)`, `product_stats(product_id PK, public, stats_json, refreshed_at)`, `snapshot_chunks(generation, seq, body)`, `snapshot_meta(id=1, generation, etag, generated_at, product_count)`, `retention_progress(observation_date PK, materialized_at)`; index `idx_v2_observed`.

- [ ] **Step 1: Create the branch**

```bash
cd chook-check-api && git switch main && git pull --ff-only && git switch -c free-plan-pipeline
```

- [ ] **Step 2: Write the migration**

`migrations/0002_free_plan_pipeline.sql`:

```sql
-- Retention reads observations by time. No v2 query filters by chain or
-- comparison ID, and every index costs a written row on each insert/delete.
CREATE INDEX idx_v2_observed ON observations_v2(client_observed_at);
DROP INDEX idx_v2_chain_time;
DROP INDEX idx_v2_comparison;

-- Products whose public stats need recomputing.
CREATE TABLE dirty_products (
  product_id TEXT PRIMARY KEY,
  marked_at TEXT NOT NULL
);

-- Precomputed public stats; stats_json is the published entry when public.
CREATE TABLE product_stats (
  product_id TEXT PRIMARY KEY,
  public INTEGER NOT NULL CHECK (public IN (0, 1)),
  stats_json TEXT,
  refreshed_at TEXT NOT NULL
);
CREATE INDEX idx_product_stats_refreshed ON product_stats(refreshed_at);

-- The published bulk snapshot, chunked below D1's 2 MB value limit.
CREATE TABLE snapshot_chunks (
  generation INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (generation, seq)
);
CREATE TABLE snapshot_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation INTEGER NOT NULL,
  etag TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  product_count INTEGER NOT NULL
);

-- Expired days already materialized, so a deletion spread over several runs
-- never re-aggregates a partial day.
CREATE TABLE retention_progress (
  observation_date TEXT PRIMARY KEY,
  materialized_at TEXT NOT NULL
);

-- Existing observations need their public stats computed once.
INSERT INTO dirty_products (product_id, marked_at)
SELECT DISTINCT product_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM observations_v2;
```

- [ ] **Step 3: Mirror the schema in test helpers**

In `test/helpers.ts`, append to `SCHEMA_STATEMENTS`:

```ts
  "CREATE INDEX IF NOT EXISTS idx_v2_observed ON observations_v2(client_observed_at)",
  "CREATE TABLE IF NOT EXISTS dirty_products (product_id TEXT PRIMARY KEY, marked_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS product_stats (product_id TEXT PRIMARY KEY, public INTEGER NOT NULL CHECK (public IN (0, 1)), stats_json TEXT, refreshed_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS snapshot_chunks (generation INTEGER NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (generation, seq))",
  "CREATE TABLE IF NOT EXISTS snapshot_meta (id INTEGER PRIMARY KEY CHECK (id = 1), generation INTEGER NOT NULL, etag TEXT NOT NULL, generated_at TEXT NOT NULL, product_count INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS retention_progress (observation_date TEXT PRIMARY KEY, materialized_at TEXT NOT NULL)",
```

and in `cleanDb()` after the existing deletes:

```ts
for (const table of [
  "dirty_products",
  "product_stats",
  "snapshot_chunks",
  "snapshot_meta",
  "retention_progress",
]) {
  await env.DB.exec(`DELETE FROM ${table}`);
}
```

In `test/migrations.test.ts`, import `migration0002 from "../migrations/0002_free_plan_pipeline.sql?raw"`, apply it after 0001, and add:

```ts
for (const table of [
  "dirty_products",
  "product_stats",
  "snapshot_chunks",
  "snapshot_meta",
  "retention_progress",
]) {
  expect(names).toContain(table);
}
```

- [ ] **Step 4: Add the budget constant and the query counter**

`src/lib/limits.ts`:

```ts
/**
 * Workers Free allows 50 D1 queries per invocation. Each handler and scheduled
 * job stays within this budget, leaving headroom for middleware.
 */
export const D1_QUERY_BUDGET = 40;
```

`test/query-budget.ts`:

```ts
/** Wrap a D1 binding and count executed statements. */
export function countQueries(db: D1Database): {
  db: D1Database;
  count: () => number;
} {
  let queries = 0;
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, prop) {
        if (prop === "bind")
          return (...values: unknown[]) => wrap(target.bind(...values));
        if (
          prop === "all" ||
          prop === "run" ||
          prop === "first" ||
          prop === "raw"
        ) {
          return (...args: unknown[]) => {
            queries++;
            return (target[prop] as (...a: unknown[]) => unknown).apply(
              target,
              args,
            );
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  const counted = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrap(target.prepare(sql));
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: counted, count: () => queries };
}
```

- [ ] **Step 5: Write the failing ingestion tests**

`test/ingest.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createContributor } from "../src/lib/auth";
import { submitObservationsV2 } from "../src/lib/ingest";
import { D1_QUERY_BUDGET } from "../src/lib/limits";
import { cleanDb } from "./helpers";
import { countQueries } from "./query-budget";
import { makeV2Observation } from "./v2-helpers";
import type { ObservationV2Input } from "../src/db/queries-v2";

beforeEach(cleanDb);

const obs = (overrides: Record<string, unknown> = {}) =>
  makeV2Observation(overrides) as ObservationV2Input;

async function dirtyProducts(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT product_id FROM dirty_products ORDER BY product_id",
  ).all<{ product_id: string }>();
  return results.map((row) => row.product_id);
}

describe("submitObservationsV2", () => {
  it("stores a 50-observation batch in four queries", async () => {
    const { contributorId } = await createContributor(env.DB);
    const batch = Array.from({ length: 50 }, (_, i) =>
      obs({ productId: `woolworths:${1000 + i}` }),
    );
    const counter = countQueries(env.DB);
    const result = await submitObservationsV2(
      counter.db,
      contributorId,
      "history",
      batch,
    );
    expect(result).toEqual({
      accepted: 50,
      duplicates: 0,
      rejected: 0,
      reasons: [],
    });
    expect(counter.count()).toBeLessThanOrEqual(4);
    expect(counter.count()).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  });

  it("counts stored and repeated IDs as duplicates", async () => {
    const { contributorId } = await createContributor(env.DB);
    const first = obs();
    await submitObservationsV2(env.DB, contributorId, "history", [first]);
    const second = obs({ productId: "woolworths:456" });
    const result = await submitObservationsV2(
      env.DB,
      contributorId,
      "history",
      [first, second, second],
    );
    expect(result).toMatchObject({ accepted: 1, duplicates: 2, rejected: 0 });
    const stored = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM observations_v2",
    ).first<{ n: number }>();
    expect(stored?.n).toBe(2);
  });

  it("quarantines a price far outside the comparable median", async () => {
    for (let i = 0; i < 5; i++) {
      const { contributorId } = await createContributor(env.DB);
      await submitObservationsV2(env.DB, contributorId, "history", [
        obs({ currentPriceCents: 500 }),
      ]);
    }
    await env.DB.exec("DELETE FROM dirty_products");
    const { contributorId } = await createContributor(env.DB);
    const outlier = obs({ currentPriceCents: 3000 });
    const result = await submitObservationsV2(
      env.DB,
      contributorId,
      "history",
      [outlier],
    );
    expect(result).toEqual({
      accepted: 0,
      duplicates: 0,
      rejected: 1,
      reasons: [`${outlier.clientObservationId}: quarantined`],
    });
    const row = await env.DB.prepare(
      "SELECT quarantined, quarantine_reason FROM observations_v2 WHERE client_observation_id = ?",
    )
      .bind(outlier.clientObservationId)
      .first();
    expect(row).toEqual({
      quarantined: 1,
      quarantine_reason: "price_outside_5x_product_median",
    });
    expect(await dirtyProducts()).toEqual([]);
  });

  it("marks accepted products dirty", async () => {
    const { contributorId } = await createContributor(env.DB);
    await submitObservationsV2(env.DB, contributorId, "history", [
      obs({ productId: "coles:2", storeChain: "coles" }),
      obs({ productId: "coles:1", storeChain: "coles" }),
      obs({ productId: "coles:2", storeChain: "coles" }),
    ]);
    expect(await dirtyProducts()).toEqual(["coles:1", "coles:2"]);
  });

  it("stores every v2 field", async () => {
    const { contributorId } = await createContributor(env.DB);
    const full = obs({
      brand: "Brand",
      category: "Dairy",
      gtin: "9300650000016",
      regularPriceCents: 900,
      unitPriceCents: 150,
      unitMeasure: "1L",
      offerType: "special",
      offerTextNormalized: "2 for $6",
      offerId: "offer-1",
      requiredQuantity: 2,
      sourceSurface: "search_result",
      extractionSource: "dom",
      instrumentMode: "user_activated_inline",
      capturePhase: "pre_ui",
      comparisonId: crypto.randomUUID(),
      storeId: "store-9",
      coarseRegion: "QLD",
      fulfilmentMode: "pickup",
      authState: "signed_in",
      loyaltyState: "member_eligible",
      browserFamily: "Firefox",
    });
    await submitObservationsV2(env.DB, contributorId, "fairness", [full]);
    const row = await env.DB.prepare(
      "SELECT * FROM observations_v2 WHERE client_observation_id = ?",
    )
      .bind(full.clientObservationId)
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      schema_version: 2,
      contribution_mode: "fairness",
      contributor_id: contributorId,
      product_id: full.productId,
      product_name: full.productName,
      brand: "Brand",
      category: "Dairy",
      gtin: "9300650000016",
      store_chain: full.storeChain,
      current_price_cents: full.currentPriceCents,
      regular_price_cents: 900,
      unit_price_cents: 150,
      unit_measure: "1L",
      offer_type: "special",
      offer_text_normalized: "2 for $6",
      offer_id: "offer-1",
      required_quantity: 2,
      source_surface: "search_result",
      extraction_source: "dom",
      scraper_version: full.scraperVersion,
      instrument_mode: "user_activated_inline",
      capture_phase: "pre_ui",
      comparison_id: full.comparisonId,
      store_id: "store-9",
      coarse_region: "QLD",
      fulfilment_mode: "pickup",
      auth_state: "signed_in",
      loyalty_state: "member_eligible",
      browser_family: "Firefox",
      client_observed_at: full.clientObservedAt,
      quarantined: 0,
      quarantine_reason: null,
    });
  });
});
```

- [ ] **Step 6: Run the tests and confirm they fail**

Run: `npm test -- test/ingest.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/ingest"`.

- [ ] **Step 7: Implement dirty marking and ingestion**

`src/db/dirty-products.ts`:

```ts
/** Queue products for a public stats refresh; a newer mark replaces an older one. */
export async function markProductsDirty(
  db: D1Database,
  productIds: string[],
  now: Date,
): Promise<void> {
  if (productIds.length === 0) return;
  await db
    .prepare(
      `INSERT INTO dirty_products (product_id, marked_at)
       SELECT value, ?2 FROM json_each(?1) WHERE true
       ON CONFLICT (product_id) DO UPDATE SET marked_at = excluded.marked_at`,
    )
    .bind(JSON.stringify([...new Set(productIds)]), now.toISOString())
    .run();
}
```

`src/lib/ingest.ts`:

```ts
import type { ObservationV2Input } from "../db/queries-v2";
import { markProductsDirty } from "../db/dirty-products";

export interface SubmitResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  reasons: string[];
}

const QUARANTINE_REASON = "price_outside_5x_product_median";

const groupKey = (productId: string, day: string, offer: string) =>
  `${productId}|${day}|${offer}`;

/** Up to 51 latest comparable prices per product/day/offer, from stored rows. */
async function referencePrices(
  db: D1Database,
  observations: ObservationV2Input[],
): Promise<Map<string, number[]>> {
  const wanted = observations.map((o) => [
    o.productId,
    o.clientObservedAt.slice(0, 10),
    o.offerType ?? "",
  ]);
  const { results } = await db
    .prepare(
      `WITH wanted AS (
         SELECT DISTINCT json_extract(value, '$[0]') AS product_id,
                         json_extract(value, '$[1]') AS day,
                         json_extract(value, '$[2]') AS offer
         FROM json_each(?1)
       ),
       ranked AS (
         SELECT w.product_id, w.day, w.offer, o.current_price_cents,
                ROW_NUMBER() OVER (
                  PARTITION BY w.product_id, w.day, w.offer
                  ORDER BY o.client_observed_at DESC
                ) AS rn
         FROM wanted w
         JOIN observations_v2 o
           ON o.product_id = w.product_id
          AND o.client_observed_at >= w.day
          AND o.client_observed_at < date(w.day, '+1 day')
          AND COALESCE(o.offer_type, '') = w.offer
          AND o.quarantined = 0
       )
       SELECT product_id, day, offer, current_price_cents
       FROM ranked WHERE rn <= 51`,
    )
    .bind(JSON.stringify(wanted))
    .all<{
      product_id: string;
      day: string;
      offer: string;
      current_price_cents: number;
    }>();
  const prices = new Map<string, number[]>();
  for (const row of results) {
    const key = groupKey(row.product_id, row.day, row.offer);
    prices.set(key, [...(prices.get(key) ?? []), row.current_price_cents]);
  }
  return prices;
}

function quarantineReason(
  observation: ObservationV2Input,
  reference: Map<string, number[]>,
): string | null {
  const prices = [
    ...(reference.get(
      groupKey(
        observation.productId,
        observation.clientObservedAt.slice(0, 10),
        observation.offerType ?? "",
      ),
    ) ?? []),
  ].sort((a, b) => a - b);
  if (prices.length < 5) return null;
  const median = prices[Math.floor(prices.length / 2)];
  return observation.currentPriceCents < median * 0.2 ||
    observation.currentPriceCents > median * 5
    ? QUARANTINE_REASON
    : null;
}

/**
 * Store a validated batch in four D1 queries regardless of its size.
 * Quarantine compares against rows stored before this batch.
 */
export async function submitObservationsV2(
  db: D1Database,
  contributorId: string,
  mode: "history" | "fairness",
  observations: ObservationV2Input[],
  now = new Date(),
): Promise<SubmitResult> {
  const { results: existing } = await db
    .prepare(
      `SELECT client_observation_id FROM observations_v2
       WHERE contributor_id = ?1
         AND client_observation_id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(
      contributorId,
      JSON.stringify(observations.map((o) => o.clientObservationId)),
    )
    .all<{ client_observation_id: string }>();
  const seen = new Set(existing.map((row) => row.client_observation_id));
  const fresh: ObservationV2Input[] = [];
  for (const observation of observations) {
    if (seen.has(observation.clientObservationId)) continue;
    seen.add(observation.clientObservationId);
    fresh.push(observation);
  }
  const duplicates = observations.length - fresh.length;
  if (fresh.length === 0) {
    return { accepted: 0, duplicates, rejected: 0, reasons: [] };
  }

  const reference = await referencePrices(db, fresh);
  const rows = fresh.map((observation) => ({
    ...observation,
    quarantineReason: quarantineReason(observation, reference),
  }));
  await db
    .prepare(
      `INSERT INTO observations_v2 (
         schema_version, client_observation_id, contribution_mode, contributor_id,
         product_id, product_name, brand, category, gtin, store_chain,
         current_price_cents, regular_price_cents, unit_price_cents, unit_measure,
         offer_type, offer_text_normalized, offer_id, required_quantity,
         source_surface, extraction_source, scraper_version, instrument_mode,
         capture_phase, comparison_id, store_id, coarse_region, fulfilment_mode,
         auth_state, loyalty_state, browser_family, client_observed_at, submitted_at,
         quarantined, quarantine_reason
       )
       SELECT 2, json_extract(value, '$.clientObservationId'), ?2, ?1,
              json_extract(value, '$.productId'), json_extract(value, '$.productName'),
              json_extract(value, '$.brand'), json_extract(value, '$.category'),
              json_extract(value, '$.gtin'), json_extract(value, '$.storeChain'),
              json_extract(value, '$.currentPriceCents'),
              json_extract(value, '$.regularPriceCents'),
              json_extract(value, '$.unitPriceCents'),
              json_extract(value, '$.unitMeasure'),
              json_extract(value, '$.offerType'),
              json_extract(value, '$.offerTextNormalized'),
              json_extract(value, '$.offerId'),
              json_extract(value, '$.requiredQuantity'),
              json_extract(value, '$.sourceSurface'),
              json_extract(value, '$.extractionSource'),
              json_extract(value, '$.scraperVersion'),
              json_extract(value, '$.instrumentMode'),
              json_extract(value, '$.capturePhase'),
              json_extract(value, '$.comparisonId'),
              json_extract(value, '$.storeId'), json_extract(value, '$.coarseRegion'),
              json_extract(value, '$.fulfilmentMode'), json_extract(value, '$.authState'),
              json_extract(value, '$.loyaltyState'), json_extract(value, '$.browserFamily'),
              json_extract(value, '$.clientObservedAt'), ?3,
              json_extract(value, '$.quarantineReason') IS NOT NULL,
              json_extract(value, '$.quarantineReason')
       FROM json_each(?4) WHERE true
       ON CONFLICT (contributor_id, client_observation_id) DO NOTHING`,
    )
    .bind(contributorId, mode, now.toISOString(), JSON.stringify(rows))
    .run();

  const accepted = rows.filter((row) => !row.quarantineReason);
  await markProductsDirty(
    db,
    accepted.map((row) => row.productId),
    now,
  );
  const rejected = rows.filter((row) => row.quarantineReason);
  return {
    accepted: accepted.length,
    duplicates,
    rejected: rejected.length,
    reasons: rejected.map((row) => `${row.clientObservationId}: quarantined`),
  };
}
```

Delete `isDuplicateV2`, `shouldQuarantineV2`, and `insertObservationV2` from `src/db/queries-v2.ts` (keep `ObservationV2Input` and the row interfaces).

- [ ] **Step 8: Use it in the route**

In `src/routes/v2-observations.ts`, replace the three query imports with `import { submitObservationsV2 } from "../lib/ingest";` and replace everything from `const request = c.req.valid("json");` to the end of the handler with:

```ts
    const request = c.req.valid("json");
    const { accepted, duplicates, rejected, reasons } =
      await submitObservationsV2(
        c.env.DB,
        contributorId,
        request.mode,
        request.observations,
      );
    return c.json(
      {
        accepted,
        duplicates,
        rejected,
        ...(reasons.length ? { reasons } : {}),
      },
      201,
    );
  },
);
```

- [ ] **Step 9: Run the full API suite**

Run: `npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: the new tests pass; existing observation, validation, and rate-limit tests still pass. Snapshot and stats tests also still pass because their routes are unchanged in this task.

- [ ] **Step 10: Commit**

```bash
git add migrations/0002_free_plan_pipeline.sql src/lib/limits.ts src/db/dirty-products.ts src/lib/ingest.ts src/routes/v2-observations.ts src/db/queries-v2.ts test/query-budget.ts test/ingest.test.ts test/helpers.ts test/migrations.test.ts
git commit -m "feat: ingest observation batches in four queries"
```

### Task 2: Precomputed product stats

**Files:**

- Create: `chook-check-api/src/lib/product-stats.ts`
- Create: `chook-check-api/test/product-stats.test.ts`
- Modify: `chook-check-api/src/db/queries-v2.ts` (`deleteContributorV2` marks products dirty first)

**Interfaces:**

- Consumes: `dirty_products`, `product_stats` (Task 1); `D1_QUERY_BUDGET`; `countQueries`.
- Produces: `refreshProductStats(db: D1Database, now?: Date): Promise<number>` (products refreshed); `SnapshotProduct` interface; constants `STATS_BATCH_SIZE = 100`, `DIRTY_REFRESH_INTERVAL_MS = 6h`, `STALE_REFRESH_INTERVAL_MS = 24h`.

- [ ] **Step 1: Write the failing tests**

`test/product-stats.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { refreshProductStats } from "../src/lib/product-stats";
import { markProductsDirty } from "../src/db/dirty-products";
import { deleteContributorV2 } from "../src/db/queries-v2";
import { D1_QUERY_BUDGET } from "../src/lib/limits";
import { cleanDb } from "./helpers";
import { countQueries } from "./query-budget";

beforeEach(cleanDb);

const NOW = new Date();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (msBeforeNow: number) =>
  new Date(NOW.getTime() - msBeforeNow).toISOString();

async function insertRow(row: {
  contributor: string;
  price: number;
  observedAt: string;
  productId?: string;
  name?: string;
  offerType?: string | null;
}) {
  await env.DB.prepare(
    `INSERT INTO observations_v2 (
       schema_version, client_observation_id, contribution_mode, contributor_id,
       product_id, product_name, store_chain, current_price_cents, offer_type,
       source_surface, extraction_source, scraper_version, instrument_mode,
       capture_phase, fulfilment_mode, auth_state, loyalty_state,
       client_observed_at, submitted_at)
     VALUES (2, ?, 'history', ?, ?, ?, 'coles', ?, ?, 'product_page', 'json_ld',
             '2.2.0', 'silent', 'baseline', 'unknown', 'unknown', 'unknown', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      row.contributor,
      row.productId ?? "coles:1",
      row.name ?? "Milk",
      row.price,
      row.offerType ?? null,
      row.observedAt,
      row.observedAt,
    )
    .run();
}

async function stats(productId = "coles:1") {
  const row = await env.DB.prepare(
    "SELECT public, stats_json FROM product_stats WHERE product_id = ?",
  )
    .bind(productId)
    .first<{ public: number; stats_json: string | null }>();
  return (
    row && {
      public: row.public,
      stats: row.stats_json && JSON.parse(row.stats_json),
    }
  );
}

describe("refreshProductStats", () => {
  it("publishes the latest day with at least five contributors", async () => {
    for (const [i, price] of [500, 510, 520, 530, 540].entries()) {
      await insertRow({ contributor: `c${i}`, price, observedAt: at(2 * DAY) });
    }
    for (let i = 0; i < 4; i++) {
      await insertRow({
        contributor: `c${i}`,
        price: 900,
        observedAt: at(HOUR),
        name: "Milk 2L",
      });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    expect(await refreshProductStats(env.DB, NOW)).toBe(1);
    expect(await stats()).toEqual({
      public: 1,
      stats: {
        productId: "coles:1",
        productName: "Milk 2L",
        brand: null,
        storeChain: "coles",
        quorum: true,
        currentMedianCents: 520,
        minCents: 500,
        maxCents: 540,
        observationCount: 9,
        contributorCount: 5,
        promoFrequency: { none: 1 },
      },
    });
  });

  it("uses each contributor's latest sample and averages even medians", async () => {
    await insertRow({
      contributor: "c0",
      price: 100,
      observedAt: at(3 * HOUR),
    });
    for (const [i, price] of [600, 600, 610, 620, 630, 640].entries()) {
      await insertRow({ contributor: `c${i}`, price, observedAt: at(HOUR) });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await refreshProductStats(env.DB, NOW);
    expect((await stats())?.stats).toMatchObject({
      currentMedianCents: 615,
      minCents: 600,
      maxCents: 640,
    });
  });

  it("is not public when the only qualifying day is older than 90 days", async () => {
    for (let i = 0; i < 5; i++) {
      await insertRow({
        contributor: `c${i}`,
        price: 500,
        observedAt: at(100 * DAY),
      });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await refreshProductStats(env.DB, NOW);
    expect(await stats()).toEqual({ public: 0, stats: null });
  });

  it("computes promo frequency over balanced samples", async () => {
    for (let i = 0; i < 5; i++) {
      await insertRow({
        contributor: `c${i}`,
        price: 500,
        observedAt: at(HOUR),
        offerType: i < 2 ? "special" : null,
      });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await refreshProductStats(env.DB, NOW);
    expect((await stats())?.stats.promoFrequency).toEqual({
      special: 0.4,
      none: 0.6,
    });
  });

  it("refreshes a dirty product at most every six hours", async () => {
    for (let i = 0; i < 5; i++) {
      await insertRow({
        contributor: `c${i}`,
        price: 500,
        observedAt: at(HOUR),
      });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await refreshProductStats(env.DB, NOW);
    await markProductsDirty(
      env.DB,
      ["coles:1"],
      new Date(NOW.getTime() + 60_000),
    );
    expect(
      await refreshProductStats(env.DB, new Date(NOW.getTime() + HOUR)),
    ).toBe(0);
    expect(
      await refreshProductStats(env.DB, new Date(NOW.getTime() + 7 * HOUR)),
    ).toBe(1);
    const dirty = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM dirty_products",
    ).first<{ n: number }>();
    expect(dirty?.n).toBe(0);
  });

  it("keeps a product dirty when it is marked after the run started", async () => {
    await insertRow({ contributor: "c0", price: 500, observedAt: at(HOUR) });
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await markProductsDirty(
      env.DB,
      ["coles:1"],
      new Date(NOW.getTime() + 5_000),
    );
    await refreshProductStats(env.DB, NOW);
    const dirty = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM dirty_products",
    ).first<{ n: number }>();
    expect(dirty?.n).toBe(1);
  });

  it("refreshes stale stats daily so old current days expire", async () => {
    for (let i = 0; i < 5; i++) {
      await insertRow({
        contributor: `c${i}`,
        price: 500,
        observedAt: at(89 * DAY),
      });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await refreshProductStats(env.DB, NOW);
    expect((await stats())?.public).toBe(1);
    await refreshProductStats(env.DB, new Date(NOW.getTime() + 2 * DAY));
    expect((await stats())?.public).toBe(0);
  });

  it("drops a product below quorum after a contributor deletes their data", async () => {
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare(
        "INSERT INTO contributors (id, submit_token_hash, deletion_token_hash, created_at) VALUES (?, ?, ?, ?)",
      )
        .bind(`c${i}`, `s${i}`, `d${i}`, NOW.toISOString())
        .run();
      await insertRow({
        contributor: `c${i}`,
        price: 500,
        observedAt: at(HOUR),
      });
    }
    await markProductsDirty(env.DB, ["coles:1"], NOW);
    await refreshProductStats(env.DB, NOW);
    expect((await stats())?.public).toBe(1);
    await deleteContributorV2(env.DB, "c0");
    await refreshProductStats(env.DB, new Date(Date.now() + 7 * HOUR));
    expect((await stats())?.public).toBe(0);
  });

  it("refreshes a full batch within the query budget", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `coles:${i + 10}`);
    for (const productId of ids) {
      await insertRow({
        contributor: "c0",
        price: 500,
        observedAt: at(HOUR),
        productId,
      });
    }
    await markProductsDirty(env.DB, ids, NOW);
    const counter = countQueries(env.DB);
    expect(await refreshProductStats(counter.db, NOW)).toBe(100);
    expect(counter.count()).toBeLessThanOrEqual(7);
    expect(counter.count()).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  });
});
```

Note: `deleteContributorV2` stamps its dirty mark with the real clock, which is why `NOW` is the current time and the deletion test refreshes at `Date.now()` plus seven hours.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- test/product-stats.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/product-stats"`.

- [ ] **Step 3: Implement the refresh**

`src/lib/product-stats.ts`:

```ts
export const STATS_BATCH_SIZE = 100;
export const DIRTY_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const STALE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RAW_WINDOW_DAYS = 180;
const CURRENT_WINDOW_DAYS = 90;
const PUBLIC_QUORUM = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The only fields published per product; the extension displays them all. */
export interface SnapshotProduct {
  productId: string;
  productName: string;
  brand: string | null;
  storeChain: string;
  quorum: true;
  currentMedianCents: number;
  minCents: number;
  maxCents: number;
  observationCount: number;
  contributorCount: number;
  promoFrequency: Record<string, number>;
}

const ago = (now: Date, ms: number) =>
  new Date(now.getTime() - ms).toISOString();

async function selectProducts(db: D1Database, now: Date): Promise<string[]> {
  const { results: dirty } = await db
    .prepare(
      `SELECT d.product_id FROM dirty_products d
       LEFT JOIN product_stats s ON s.product_id = d.product_id
       WHERE s.refreshed_at IS NULL OR s.refreshed_at <= ?1
       ORDER BY d.marked_at LIMIT ?2`,
    )
    .bind(ago(now, DIRTY_REFRESH_INTERVAL_MS), STATS_BATCH_SIZE)
    .all<{ product_id: string }>();
  const ids = new Set(dirty.map((row) => row.product_id));
  if (ids.size < STATS_BATCH_SIZE) {
    // Windows slide even without new data, so stale stats are recomputed daily.
    const { results: stale } = await db
      .prepare(
        `SELECT product_id FROM product_stats
         WHERE refreshed_at <= ?1 ORDER BY refreshed_at LIMIT ?2`,
      )
      .bind(ago(now, STALE_REFRESH_INTERVAL_MS), STATS_BATCH_SIZE - ids.size)
      .all<{ product_id: string }>();
    for (const row of stale) ids.add(row.product_id);
  }
  return [...ids];
}

/** Recompute public stats for up to one batch of products in seven queries. */
export async function refreshProductStats(
  db: D1Database,
  now = new Date(),
): Promise<number> {
  const productIds = await selectProducts(db, now);
  if (productIds.length === 0) return 0;
  const ids = JSON.stringify(productIds);
  const rawSince = ago(now, RAW_WINDOW_DAYS * DAY_MS);
  const currentSince = ago(now, CURRENT_WINDOW_DAYS * DAY_MS);

  // SQLite takes bare columns from the row holding MAX(client_observed_at).
  const summary = db
    .prepare(
      `SELECT product_id, COUNT(*) AS observation_count,
              COUNT(DISTINCT contributor_id) AS contributor_count,
              MAX(client_observed_at) AS latest_at,
              product_name, brand, store_chain
       FROM observations_v2
       WHERE product_id IN (SELECT value FROM json_each(?1))
         AND client_observed_at >= ?2 AND quarantined = 0
       GROUP BY product_id`,
    )
    .bind(ids, rawSince)
    .all<{
      product_id: string;
      observation_count: number;
      contributor_count: number;
      product_name: string;
      brand: string | null;
      store_chain: string;
    }>();
  const current = db
    .prepare(
      `WITH balanced AS (
         SELECT product_id, substr(client_observed_at, 1, 10) AS day,
                current_price_cents,
                ROW_NUMBER() OVER (
                  PARTITION BY product_id, contributor_id, substr(client_observed_at, 1, 10)
                  ORDER BY client_observed_at DESC
                ) AS rn
         FROM observations_v2
         WHERE product_id IN (SELECT value FROM json_each(?1))
           AND client_observed_at >= ?2 AND quarantined = 0
       ),
       latest AS (SELECT product_id, day, current_price_cents FROM balanced WHERE rn = 1),
       qualifying AS (
         SELECT product_id, MAX(day) AS day FROM (
           SELECT product_id, day FROM latest
           GROUP BY product_id, day HAVING COUNT(*) >= ?3
         ) GROUP BY product_id
       ),
       ranked AS (
         SELECT l.product_id, l.current_price_cents,
                ROW_NUMBER() OVER (PARTITION BY l.product_id ORDER BY l.current_price_cents) AS pos,
                COUNT(*) OVER (PARTITION BY l.product_id) AS n
         FROM latest l
         JOIN qualifying q ON q.product_id = l.product_id AND q.day = l.day
       )
       SELECT product_id,
              AVG(CASE WHEN pos IN ((n + 1) / 2, (n + 2) / 2) THEN current_price_cents END) AS median_cents,
              MIN(current_price_cents) AS min_cents,
              MAX(current_price_cents) AS max_cents
       FROM ranked GROUP BY product_id`,
    )
    .bind(ids, currentSince, PUBLIC_QUORUM)
    .all<{
      product_id: string;
      median_cents: number;
      min_cents: number;
      max_cents: number;
    }>();
  const promos = db
    .prepare(
      `WITH balanced AS (
         SELECT product_id, offer_type,
                ROW_NUMBER() OVER (
                  PARTITION BY product_id, contributor_id, substr(client_observed_at, 1, 10)
                  ORDER BY client_observed_at DESC
                ) AS rn
         FROM observations_v2
         WHERE product_id IN (SELECT value FROM json_each(?1))
           AND client_observed_at >= ?2 AND quarantined = 0
       )
       SELECT product_id, COALESCE(offer_type, 'none') AS offer, COUNT(*) AS n
       FROM balanced WHERE rn = 1 GROUP BY product_id, offer`,
    )
    .bind(ids, rawSince)
    .all<{ product_id: string; offer: string; n: number }>();
  const [summaryRows, currentRows, promoRows] = await Promise.all([
    summary,
    current,
    promos,
  ]);

  const currentById = new Map(
    currentRows.results.map((row) => [row.product_id, row]),
  );
  const promoCounts = new Map<string, Record<string, number>>();
  for (const row of promoRows.results) {
    promoCounts.set(row.product_id, {
      ...promoCounts.get(row.product_id),
      [row.offer]: row.n,
    });
  }
  const entries = productIds.map((productId) => {
    const s = summaryRows.results.find((row) => row.product_id === productId);
    const c = currentById.get(productId);
    if (!s || !c) return { productId, public: 0, statsJson: null };
    const counts = promoCounts.get(productId) ?? {};
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const product: SnapshotProduct = {
      productId,
      productName: s.product_name,
      brand: s.brand,
      storeChain: s.store_chain,
      quorum: true,
      currentMedianCents: c.median_cents,
      minCents: c.min_cents,
      maxCents: c.max_cents,
      observationCount: s.observation_count,
      contributorCount: s.contributor_count,
      promoFrequency: Object.fromEntries(
        Object.entries(counts).map(([offer, n]) => [offer, n / total]),
      ),
    };
    return { productId, public: 1, statsJson: JSON.stringify(product) };
  });

  await db
    .prepare(
      `INSERT INTO product_stats (product_id, public, stats_json, refreshed_at)
       SELECT json_extract(value, '$.productId'), json_extract(value, '$.public'),
              json_extract(value, '$.statsJson'), ?2
       FROM json_each(?1) WHERE true
       ON CONFLICT (product_id) DO UPDATE SET
         public = excluded.public,
         stats_json = excluded.stats_json,
         refreshed_at = excluded.refreshed_at`,
    )
    .bind(JSON.stringify(entries), now.toISOString())
    .run();
  // Marks made after this run started stay queued for the next refresh.
  await db
    .prepare(
      `DELETE FROM dirty_products
       WHERE product_id IN (SELECT value FROM json_each(?1)) AND marked_at <= ?2`,
    )
    .bind(ids, now.toISOString())
    .run();
  return productIds.length;
}
```

In `src/db/queries-v2.ts`, at the top of `deleteContributorV2` before its `DELETE`, add:

```ts
await db
  .prepare(
    `INSERT INTO dirty_products (product_id, marked_at)
       SELECT DISTINCT product_id, ?2 FROM observations_v2 WHERE contributor_id = ?1
       ON CONFLICT (product_id) DO UPDATE SET marked_at = excluded.marked_at`,
  )
  .bind(contributorId, new Date().toISOString())
  .run();
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- test/product-stats.test.ts`
Expected: PASS (9 tests). If the summary's bare columns are not taken from the latest row, the first test fails on `productName`; fix with a `ROW_NUMBER() ... ORDER BY client_observed_at DESC` CTE instead of relying on bare columns.

- [ ] **Step 5: Full suite, lint, typecheck, format, commit**

```bash
npm test && npm run lint && npm run typecheck && npm run format:check
git add src/lib/product-stats.ts src/db/queries-v2.ts test/product-stats.test.ts
git commit -m "feat: precompute public product stats in batches"
```

### Task 3: Snapshot build and read-only routes

**Files:**

- Create: `chook-check-api/src/lib/snapshot.ts`
- Create: `chook-check-api/test/snapshot.test.ts`
- Modify: `chook-check-api/src/routes/v2-snapshots.ts` (serve stored chunks)
- Modify: `chook-check-api/src/routes/v2-products.ts` (serve `product_stats`)
- Modify: `chook-check-api/test/products-v2.test.ts` (refresh and build before reading; remove signal route tests)
- Modify: `chook-check-api/src/db/queries-v2.ts` (delete `getProductRowsV2`, `getDailyProductAggregates`, `listPublicProductIdsV2`)
- Modify: `chook-check-api/src/lib/aggregation-v2.ts` (delete `aggregateProductV2` and now-unused imports)

**Interfaces:**

- Consumes: `product_stats`, `snapshot_chunks`, `snapshot_meta`; `refreshProductStats`; `hashToken(text: string): Promise<string>` from `src/lib/crypto.ts`.
- Produces: `buildSnapshot(db: D1Database, now?: Date, chunkChars?: number): Promise<{ changed: boolean; productCount: number }>`; `chunkText(text: string, size: number): string[]`; `SNAPSHOT_CHUNK_CHARS = 500_000`; `SNAPSHOT_CRON = "*/30 * * * *"`.

- [ ] **Step 1: Write the failing tests**

`test/snapshot.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { buildSnapshot, chunkText } from "../src/lib/snapshot";
import { D1_QUERY_BUDGET } from "../src/lib/limits";
import { cleanDb } from "./helpers";
import { countQueries } from "./query-budget";

beforeEach(cleanDb);

const NOW = new Date();
const product = (id: string, name = "Milk") => ({
  productId: id,
  productName: name,
  brand: null,
  storeChain: "coles",
  quorum: true,
  currentMedianCents: 500,
  minCents: 450,
  maxCents: 550,
  observationCount: 12,
  contributorCount: 6,
  promoFrequency: { none: 1 },
});

async function putStats(id: string, isPublic: boolean, name?: string) {
  await env.DB.prepare(
    "INSERT INTO product_stats (product_id, public, stats_json, refreshed_at) VALUES (?, ?, ?, ?)",
  )
    .bind(
      id,
      isPublic ? 1 : 0,
      isPublic ? JSON.stringify(product(id, name)) : null,
      NOW.toISOString(),
    )
    .run();
}
const get = (path: string, headers: Record<string, string> = {}) =>
  SELF.fetch(`http://localhost${path}`, {
    headers: { "CF-Connecting-IP": "198.51.100.9", ...headers },
  });

describe("chunkText", () => {
  it("never splits a surrogate pair", () => {
    const chunks = chunkText("a🌶b", 2);
    expect(chunks.join("")).toBe("a🌶b");
    for (const chunk of chunks) expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe("bulk snapshot", () => {
  it("serves an empty snapshot before the first build", async () => {
    const response = await get("/api/v2/snapshots/products");
    expect(response.status).toBe(200);
    expect((await response.json<{ products: unknown[] }>()).products).toEqual(
      [],
    );
  });

  it("serves only public products and revalidates with the ETag", async () => {
    await putStats("coles:1", true);
    await putStats("coles:2", false);
    await buildSnapshot(env.DB, NOW);
    const response = await get("/api/v2/snapshots/products");
    const etag = response.headers.get("ETag");
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect((await response.json<{ products: unknown[] }>()).products).toEqual([
      product("coles:1"),
    ]);
    const revalidated = await get("/api/v2/snapshots/products", {
      "If-None-Match": etag!,
    });
    expect(revalidated.status).toBe(304);
  });

  it("keeps the ETag when the published content is unchanged", async () => {
    await putStats("coles:1", true);
    expect((await buildSnapshot(env.DB, NOW)).changed).toBe(true);
    expect(
      (await buildSnapshot(env.DB, new Date(NOW.getTime() + 60_000))).changed,
    ).toBe(false);
  });

  it("reassembles small chunks without corrupting names", async () => {
    await putStats("coles:1", true, "Jalapeño 🌶 Chips");
    await buildSnapshot(env.DB, NOW, 7);
    const body = await (
      await get("/api/v2/snapshots/products")
    ).json<{
      products: Array<{ productName: string }>;
    }>();
    expect(body.products[0].productName).toBe("Jalapeño 🌶 Chips");
  });

  it("keeps only the current and previous generation", async () => {
    await putStats("coles:1", true);
    await buildSnapshot(env.DB, NOW);
    await putStats("coles:2", true);
    await buildSnapshot(env.DB, NOW);
    await putStats("coles:3", true);
    await buildSnapshot(env.DB, NOW);
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT generation FROM snapshot_chunks ORDER BY generation",
    ).all<{ generation: number }>();
    expect(results.map((row) => row.generation)).toEqual([2, 3]);
  });

  it("builds within the query budget", async () => {
    for (let i = 0; i < 50; i++) await putStats(`coles:${i}`, true);
    const counter = countQueries(env.DB);
    await buildSnapshot(counter.db, NOW);
    expect(counter.count()).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  });
});

describe("per-product stats", () => {
  it("serves public stats and hides other products", async () => {
    await putStats("coles:1", true);
    await putStats("coles:2", false);
    const found = await get("/api/v2/products/coles%3A1/stats");
    expect(await found.json()).toEqual(product("coles:1"));
    expect((await get("/api/v2/products/coles%3A2/stats")).status).toBe(404);
    expect((await get("/api/v2/products/coles%3A3/stats")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- test/snapshot.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/snapshot"`.

- [ ] **Step 3: Implement the snapshot build**

`src/lib/snapshot.ts`:

```ts
import { hashToken } from "./crypto";

/** Characters per stored chunk; at most 1.5 MB of UTF-8, below D1's 2 MB limit. */
export const SNAPSHOT_CHUNK_CHARS = 500_000;
/** The cron trigger that publishes the snapshot (see wrangler.toml). */
export const SNAPSHOT_CRON = "*/30 * * * *";

/** Split text into chunks without separating a UTF-16 surrogate pair. */
export function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    if (end === start) end = start + 2;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * Publish public product stats as a new snapshot generation when its content
 * changed. The ETag hashes the product list only, so rebuilding identical
 * content does not make clients download it again.
 */
export async function buildSnapshot(
  db: D1Database,
  now = new Date(),
  chunkChars = SNAPSHOT_CHUNK_CHARS,
): Promise<{ changed: boolean; productCount: number }> {
  const { results } = await db
    .prepare(
      `SELECT stats_json FROM product_stats WHERE public = 1 ORDER BY product_id`,
    )
    .all<{ stats_json: string }>();
  const products = `[${results.map((row) => row.stats_json).join(",")}]`;
  const etag = await hashToken(products);
  const meta = await db
    .prepare(`SELECT generation, etag FROM snapshot_meta WHERE id = 1`)
    .first<{ generation: number; etag: string }>();
  if (meta?.etag === etag)
    return { changed: false, productCount: results.length };

  const generation = (meta?.generation ?? 0) + 1;
  const body = `{"generatedAt":${JSON.stringify(now.toISOString())},"products":${products}}`;
  for (const [seq, chunk] of chunkText(body, chunkChars).entries()) {
    await db
      .prepare(
        `INSERT INTO snapshot_chunks (generation, seq, body) VALUES (?1, ?2, ?3)`,
      )
      .bind(generation, seq, chunk)
      .run();
  }
  await db
    .prepare(
      `INSERT INTO snapshot_meta (id, generation, etag, generated_at, product_count)
       VALUES (1, ?1, ?2, ?3, ?4)
       ON CONFLICT (id) DO UPDATE SET
         generation = excluded.generation, etag = excluded.etag,
         generated_at = excluded.generated_at, product_count = excluded.product_count`,
    )
    .bind(generation, etag, now.toISOString(), results.length)
    .run();
  // Keep the previous generation for requests that read meta before the switch.
  await db
    .prepare(`DELETE FROM snapshot_chunks WHERE generation < ?1`)
    .bind(generation - 1)
    .run();
  return { changed: true, productCount: results.length };
}
```

`src/routes/v2-snapshots.ts` (replace the file):

```ts
import { Hono } from "hono";
import type { App } from "../lib/types";
import { getRateLimit } from "../middleware/rate-limit";

const v2Snapshots = new Hono<App>();

v2Snapshots.get("/products", getRateLimit, async (c) => {
  const meta = await c.env.DB.prepare(
    `SELECT generation, etag FROM snapshot_meta WHERE id = 1`,
  ).first<{ generation: number; etag: string }>();
  if (!meta) return c.json({ generatedAt: null, products: [] });
  const etag = `"${meta.etag}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  };
  if (c.req.header("If-None-Match") === etag) {
    return c.body(null, 304, headers);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT body FROM snapshot_chunks WHERE generation = ?1 ORDER BY seq`,
  )
    .bind(meta.generation)
    .all<{ body: string }>();
  return c.body(results.map((row) => row.body).join(""), 200, {
    ...headers,
    "Content-Type": "application/json; charset=UTF-8",
  });
});

export { v2Snapshots };
```

`src/routes/v2-products.ts` (replace the file):

```ts
import { Hono } from "hono";
import type { App } from "../lib/types";
import { getRateLimit } from "../middleware/rate-limit";

const v2Products = new Hono<App>();

v2Products.get("/:productId/stats", getRateLimit, async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT stats_json FROM product_stats WHERE product_id = ?1 AND public = 1`,
  )
    .bind(c.req.param("productId"))
    .first<{ stats_json: string }>();
  if (!row) {
    return c.json(
      { error: "not_found", message: "No public stats for this product" },
      404,
    );
  }
  return c.body(row.stats_json, 200, {
    "Content-Type": "application/json; charset=UTF-8",
  });
});

export { v2Products };
```

Delete `getProductRowsV2`, `getDailyProductAggregates`, `listPublicProductIdsV2` from `src/db/queries-v2.ts`, and `aggregateProductV2` from `src/lib/aggregation-v2.ts`, with any imports lint then reports unused (`median`, `promoFrequency`, `ProductStats`, `DailyProductAggregateRow`). Keep `analyseDifferentialPricing`, `analyseObserverEffect`, and everything they use.

- [ ] **Step 4: Update the route-level product tests**

In `test/products-v2.test.ts`:

- import `{ env }` from `cloudflare:test`, `refreshProductStats` and `buildSnapshot`;
- add `const publish = async (msLater = 0) => { await refreshProductStats(env.DB, new Date(Date.now() + msLater)); await buildSnapshot(env.DB); };`
- **five-contributor threshold:** after 4 contributors call `publish()` and expect `/stats` to return 404; after the fifth call `publish(7 * 60 * 60 * 1000)` and expect 200 with `quorum: true`;
- **latest day median:** keep the seeding, call `publish()`, expect `currentMedianCents` 520, and delete the `priceHistory` assertion;
- **bulk snapshot:** call `publish()` after each seeding round (use `publish(7 * 60 * 60 * 1000)` for the second) and keep the existing expectations;
- **delete** the "labels persistent differences only after strict matched thresholds" and "keeps inline observer-effect pairs separate and thresholded" tests. `test/measurement-v2.test.ts` covers both analyses directly, and neither is published any more.

In `test/cron.test.ts`, delete the last five lines of "retains a three-year public daily aggregate before deleting raw rows" (the `/stats` fetch and its `priceHistory` assertions); history is no longer published. Task 4 replaces this block.

- [ ] **Step 5: Run everything and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run format:check
git add src/lib/snapshot.ts src/routes/v2-snapshots.ts src/routes/v2-products.ts src/db/queries-v2.ts src/lib/aggregation-v2.ts test/snapshot.test.ts test/products-v2.test.ts test/cron.test.ts
git commit -m "feat: serve precomputed snapshot and product stats"
```

Expected before commit: all API tests pass.

### Task 4: Indexed retention and cron wiring

**Files:**

- Modify: `chook-check-api/src/cron.ts` (replace `cleanupRawObservations` with `runRetentionStep`)
- Modify: `chook-check-api/src/index.ts` (scheduled handler)
- Modify: `chook-check-api/wrangler.toml` (two cron triggers)
- Modify: `chook-check-api/test/cron.test.ts`

**Interfaces:**

- Consumes: `retention_progress`, `daily_product_aggregates`, `idx_v2_observed`; `refreshProductStats`; `buildSnapshot`.
- Produces: `runRetentionStep(db: D1Database, now?: Date, options?: { chunkSize?: number; maxChunks?: number }): Promise<number>` (rows deleted).

- [ ] **Step 1: Write the failing tests**

Replace the `cleanupRawObservations` describe block in `test/cron.test.ts` with the following, remove the `cleanupRawObservations` import, and remove any imports lint then reports unused:

```ts
import { runRetentionStep } from "../src/cron";
import worker from "../src/index";
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { D1_QUERY_BUDGET } from "../src/lib/limits";
import { SNAPSHOT_CRON } from "../src/lib/snapshot";
import { countQueries } from "./query-budget";

const DAY = 24 * 60 * 60 * 1000;

async function insertAged(contributor: string, price: number, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * DAY).toISOString();
  await env.DB.prepare(
    `INSERT INTO observations_v2 (
       schema_version, client_observation_id, contribution_mode, contributor_id,
       product_id, product_name, store_chain, current_price_cents,
       source_surface, extraction_source, scraper_version, instrument_mode,
       capture_phase, fulfilment_mode, auth_state, loyalty_state,
       client_observed_at, submitted_at)
     VALUES (2, ?, 'history', ?, 'woolworths:123', 'Vegemite', 'woolworths', ?,
             'product_page', 'json_ld', '2.2.0', 'silent', 'baseline',
             'unknown', 'unknown', 'unknown', ?, ?)`,
  )
    .bind(crypto.randomUUID(), contributor, price, at, at)
    .run();
}
const aggregate = () =>
  env.DB.prepare(
    `SELECT median_price_cents, min_price_cents, max_price_cents, contributor_count
     FROM daily_product_aggregates`,
  ).first();
const rawCount = async () =>
  (
    await env.DB.prepare("SELECT COUNT(*) AS n FROM observations_v2").first<{
      n: number;
    }>()
  )?.n;

describe("runRetentionStep", () => {
  it("deletes expired raw observations", async () => {
    await insertAged("c0", 500, 181);
    expect(await runRetentionStep(env.DB)).toBe(1);
    expect(await rawCount()).toBe(0);
  });

  it("keeps observations that have not expired", async () => {
    await insertAged("c0", 500, 179);
    expect(await runRetentionStep(env.DB)).toBe(0);
    expect(await rawCount()).toBe(1);
  });

  it("materializes a public daily aggregate before deleting", async () => {
    for (const [i, price] of [500, 600, 700, 800, 900].entries()) {
      await insertAged(`c${i}`, price, 181);
    }
    expect(await runRetentionStep(env.DB)).toBe(5);
    expect(await aggregate()).toEqual({
      median_price_cents: 700,
      min_price_cents: 500,
      max_price_cents: 900,
      contributor_count: 5,
    });
  });

  it("aggregates a day once even when deletion spans runs", async () => {
    for (const [i, price] of [100, 200, 300, 400, 500, 600, 700].entries()) {
      await insertAged(`c${i}`, price, 181);
    }
    const options = { chunkSize: 2, maxChunks: 1 };
    expect(await runRetentionStep(env.DB, new Date(), options)).toBe(2);
    const first = await aggregate();
    expect(first).toMatchObject({
      median_price_cents: 400,
      contributor_count: 7,
    });
    while (((await rawCount()) ?? 0) > 0) {
      await runRetentionStep(env.DB, new Date(), options);
    }
    await runRetentionStep(env.DB, new Date(), options);
    expect(await aggregate()).toEqual(first);
    const progress = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM retention_progress",
    ).first<{ n: number }>();
    expect(progress?.n).toBe(0);
  });

  it("removes daily aggregates older than three years", async () => {
    await env.DB.prepare(
      `INSERT INTO daily_product_aggregates (
         product_id, observation_date, product_name, store_chain,
         median_price_cents, min_price_cents, max_price_cents,
         observation_count, contributor_count, created_at)
       VALUES ('coles:1', '2020-01-01', 'Old', 'coles', 1, 1, 1, 5, 5, '2020-01-01')`,
    ).run();
    await runRetentionStep(env.DB);
    expect(await aggregate()).toBeNull();
  });

  it("processes a day within the query budget", async () => {
    for (let i = 0; i < 5; i++) await insertAged(`c${i}`, 500, 181);
    const counter = countQueries(env.DB);
    await runRetentionStep(counter.db);
    expect(counter.count()).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  });
});

describe("scheduled handler", () => {
  it("publishes a snapshot on the snapshot cron", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled!(
      { cron: SNAPSHOT_CRON, scheduledTime: Date.now(), noRetry() {} },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const meta = await env.DB.prepare(
      "SELECT product_count FROM snapshot_meta",
    ).first();
    expect(meta).toEqual({ product_count: 0 });
  });

  it("refreshes stats and applies retention on the minute cron", async () => {
    await insertAged("c0", 500, 181);
    await env.DB.prepare(
      "INSERT INTO dirty_products (product_id, marked_at) VALUES ('woolworths:123', ?)",
    )
      .bind(new Date().toISOString())
      .run();
    const ctx = createExecutionContext();
    await worker.scheduled!(
      { cron: "* * * * *", scheduledTime: Date.now(), noRetry() {} },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(await rawCount()).toBe(0);
    const stats = await env.DB.prepare(
      "SELECT public FROM product_stats",
    ).first();
    expect(stats).toEqual({ public: 0 });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- test/cron.test.ts`
Expected: FAIL, `runRetentionStep` is not exported.

- [ ] **Step 3: Implement retention**

In `src/cron.ts`, delete `RAW_RETENTION_DAYS` through the end of `cleanupRawObservations` (and the `median` import), keep `cleanupRateLimits`, and add:

```ts
const RAW_RETENTION_DAYS = 180;
const AGGREGATE_RETENTION_DAYS = 3 * 365;
const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_CHUNK_SIZE = 1000;
export const RETENTION_MAX_CHUNKS = 5;

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Expire raw observations one UTC day at a time. Days with at least five
 * contributors are aggregated once before any of their rows are deleted.
 */
export async function runRetentionStep(
  db: D1Database,
  now = new Date(),
  {
    chunkSize = RETENTION_CHUNK_SIZE,
    maxChunks = RETENTION_MAX_CHUNKS,
  }: { chunkSize?: number; maxChunks?: number } = {},
): Promise<number> {
  const rawCutoff = isoDate(now.getTime() - RAW_RETENTION_DAYS * DAY_MS);
  const aggregateCutoff = isoDate(
    now.getTime() - AGGREGATE_RETENTION_DAYS * DAY_MS,
  );
  await db
    .prepare(`DELETE FROM daily_product_aggregates WHERE observation_date < ?1`)
    .bind(aggregateCutoff)
    .run();

  const oldest = await db
    .prepare(`SELECT MIN(client_observed_at) AS oldest FROM observations_v2`)
    .first<{ oldest: string | null }>();
  const day = oldest?.oldest?.slice(0, 10);
  // Progress for days with no rows left (e.g. the last chunk was exactly full).
  await db
    .prepare(`DELETE FROM retention_progress WHERE observation_date < ?1`)
    .bind(day ?? rawCutoff)
    .run();
  if (!day || day >= rawCutoff) return 0;
  const nextDay = isoDate(Date.parse(`${day}T00:00:00Z`) + DAY_MS);

  const progress = await db
    .prepare(
      `SELECT 1 AS done FROM retention_progress WHERE observation_date = ?1`,
    )
    .bind(day)
    .first();
  if (!progress) {
    if (day >= aggregateCutoff) {
      await db
        .prepare(
          `WITH latest AS (
             SELECT product_id, product_name, brand, store_chain,
                    current_price_cents, client_observed_at,
                    ROW_NUMBER() OVER (
                      PARTITION BY product_id, contributor_id
                      ORDER BY client_observed_at DESC
                    ) AS rn
             FROM observations_v2
             WHERE client_observed_at >= ?1 AND client_observed_at < ?2
               AND quarantined = 0
           ),
           ranked AS (
             SELECT *,
                    ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY current_price_cents) AS pos,
                    COUNT(*) OVER (PARTITION BY product_id) AS n,
                    ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY client_observed_at DESC) AS recency
             FROM latest WHERE rn = 1
           )
           INSERT INTO daily_product_aggregates (
             product_id, observation_date, product_name, brand, store_chain,
             median_price_cents, min_price_cents, max_price_cents,
             observation_count, contributor_count, created_at
           )
           SELECT product_id, ?1,
                  MAX(CASE WHEN recency = 1 THEN product_name END),
                  MAX(CASE WHEN recency = 1 THEN brand END),
                  MAX(CASE WHEN recency = 1 THEN store_chain END),
                  AVG(CASE WHEN pos IN ((n + 1) / 2, (n + 2) / 2) THEN current_price_cents END),
                  MIN(current_price_cents), MAX(current_price_cents),
                  COUNT(*), COUNT(*), ?3
           FROM ranked WHERE true
           GROUP BY product_id
           HAVING COUNT(*) >= 5
           ON CONFLICT (product_id, observation_date) DO UPDATE SET
             product_name = excluded.product_name,
             brand = excluded.brand,
             store_chain = excluded.store_chain,
             median_price_cents = excluded.median_price_cents,
             min_price_cents = excluded.min_price_cents,
             max_price_cents = excluded.max_price_cents,
             observation_count = excluded.observation_count,
             contributor_count = excluded.contributor_count,
             created_at = excluded.created_at`,
        )
        .bind(day, nextDay, now.toISOString())
        .run();
    }
    await db
      .prepare(
        `INSERT INTO retention_progress (observation_date, materialized_at) VALUES (?1, ?2)`,
      )
      .bind(day, now.toISOString())
      .run();
  }

  let deleted = 0;
  for (let chunk = 0; chunk < maxChunks; chunk++) {
    const result = await db
      .prepare(
        `DELETE FROM observations_v2 WHERE id IN (
           SELECT id FROM observations_v2
           WHERE client_observed_at >= ?1 AND client_observed_at < ?2
           LIMIT ?3)`,
      )
      .bind(day, nextDay, chunkSize)
      .run();
    const changes = result.meta.changes ?? 0;
    deleted += changes;
    if (changes < chunkSize) {
      await db
        .prepare(`DELETE FROM retention_progress WHERE observation_date = ?1`)
        .bind(day)
        .run();
      break;
    }
  }
  return deleted;
}
```

- [ ] **Step 4: Wire the scheduled handler and triggers**

In `src/index.ts`, replace the cron import with:

```ts
import { cleanupRateLimits, runRetentionStep } from "./cron";
import { refreshProductStats } from "./lib/product-stats";
import { buildSnapshot, SNAPSHOT_CRON } from "./lib/snapshot";
```

Do not add named exports to `src/index.ts`; Workers may treat them as entrypoints.

and the `scheduled` handler with:

```ts
  scheduled: async (controller, env) => {
    // Separate invocations keep each job within Workers Free CPU and query limits.
    if (controller.cron === SNAPSHOT_CRON) {
      await buildSnapshot(env.DB);
      return;
    }
    await cleanupRateLimits(env.DB);
    await runRetentionStep(env.DB);
    await refreshProductStats(env.DB);
  },
```

In `wrangler.toml`:

```toml
[triggers]
crons = ["* * * * *", "*/30 * * * *"]
```

- [ ] **Step 5: Run everything and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run format:check
git add src/cron.ts src/index.ts wrangler.toml test/cron.test.ts
git commit -m "feat: expire raw data by indexed day and schedule precomputation"
```

### Task 5: Extension snapshot type

**Files:**

- Modify: `Chook-Check/lib/types.ts` (`ProductStats`)
- Modify: `Chook-Check/test/components/overlay/overlay.test.tsx`, `Chook-Check/test/lib/settings.test.ts` (drop `priceHistory` from fixtures)

**Interfaces:**

- Consumes: the published field list in Global Constraints.
- Produces: `ProductStats` with exactly those fields; `CommunitySnapshot extends ProductStats { downloadedAt: string }` unchanged.

- [ ] **Step 1: Branch and change the type**

```bash
cd Chook-Check && git switch main && git pull --ff-only && git switch -c snapshot-display-fields
```

In `lib/types.ts`, remove `priceHistory` and `differentialSignal` from `ProductStats`. Then run `npm run typecheck`; delete `DifferentialSignal` (and any other interface) only if typecheck or lint reports it unused.

- [ ] **Step 2: Fix fixtures**

Delete the `priceHistory: [],` lines in `test/components/overlay/overlay.test.tsx` (two) and `test/lib/settings.test.ts` (one).

- [ ] **Step 3: Verify and commit**

```bash
npm run lint && npm run typecheck && npm run format:check && npm run test:run && npm run build && npm run build:firefox && npm run audit:build
git add lib/types.ts test/components/overlay/overlay.test.tsx test/lib/settings.test.ts
git commit -m "refactor: match the community snapshot's published fields"
```

### Task 6: Measure, document, and record

**Files:**

- Modify: `chook-check-api/README.md`
- Modify: `Chook-Check/docs/METHODOLOGY.md`, `Chook-Check/PRIVACY.md`, `Chook-Check/docs/RELEASE_VALIDATION.md`, `Chook-Check/docs/superpowers/plans/2026-09-06-release-readiness.md`

**Interfaces:**

- Consumes: the finished API branch; the scratchpad load-test kit (`gen.py`, instrumented API copy) from 2026-10-10.

- [ ] **Step 1: Re-run the alpha load test**

Recreate the scratch database with migrations 0000–0002 (`wrangler d1 migrations apply chook-check --local --persist-to <scratch>/state`), generate 30 contributors with `gen.py`, then mark every product dirty:

```sql
INSERT INTO dirty_products (product_id, marked_at)
SELECT DISTINCT product_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM observations_v2;
```

Copy the new API to the scratch directory, add the same counting wrapper to `fetch` and `scheduled` (log `controller.cron` with the stats), and run `wrangler dev --test-scheduled`. Trigger `* * * * *` until `dirty_products` is empty (about 26 runs), then `*/30 * * * *` once. Record per invocation: queries, rows read, rows written, wall time for: a maintenance run, the snapshot build, `GET /api/v2/snapshots/products` (200 and 304), `GET /api/v2/products/:id/stats`, and a 50-observation upload. Every invocation must be within 40 queries.

- [ ] **Step 2: Document the operating envelope**

API `README.md`: replace the aggregation and deployment text that describes per-request computation with: the two cron triggers; stats refreshed at most every 6 hours per product and daily when stale; snapshot republished every 30 minutes only when content changes; the published field list; signals and history are computed by tested code but not published; and a "Workers Free operating envelope" table from Step 1 with the daily budget arithmetic (rows read, rows written, database size) and the resulting contributor ceiling.

`METHODOLOGY.md`: "current" means the latest UTC day within 90 days with at least five contributors; counts cover 180 days; public outputs exclude price history and signals for now.

`PRIVACY.md`: the community snapshot contains only per-product aggregate fields (list them).

`RELEASE_VALIDATION.md`: add "Community API load test" with the before table from this plan's Context and the after numbers from Step 1. In the readiness plan, tick the Phase 5 measurement item and note the supported volume.

- [ ] **Step 3: Verify and commit both repos**

Run each repo's full checks (Global Constraints). Commit the API docs on `free-plan-pipeline` with `docs: document the Workers Free operating envelope`, and the extension docs on `snapshot-display-fields` with `docs: record community API load test results`.

- [ ] **Step 4: Open PRs and wait for CI**

Push both branches, open one PR per repo, and confirm CI passes. Do not merge, tag, or deploy.
