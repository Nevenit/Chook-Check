# Community Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Chook Check community API — a Cloudflare Worker + D1 backend that accepts price observations and serves community stats.

**Architecture:** Hono HTTP framework on Cloudflare Workers with D1 (SQLite at edge). Zod for input validation, sliding-window rate limiting via D1, crowd quorum (3 contributors) before surfacing stats. Separate repo at `/Users/michaelryan/Programming/JavaScript/chook-check-api`.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Zod, `@hono/zod-validator`, `@cloudflare/vitest-pool-workers`, Vitest

---

## File Structure

```
/Users/michaelryan/Programming/JavaScript/chook-check-api/
  src/
    index.ts                — Hono app, route registration, CORS, error handler
    routes/
      observations.ts       — POST /api/observations
      products.ts           — GET /api/products/:productId/stats, GET /api/products/search
      trends.ts             — GET /api/trends
      contributor.ts        — DELETE /api/contributor/:contributorId
    middleware/
      rate-limit.ts         — Sliding window rate limiter using D1
    db/
      queries.ts            — Parameterized D1 query functions
    lib/
      types.ts              — Bindings, API request/response types
      schemas.ts            — Zod validation schemas for all endpoints
      aggregation.ts        — median, promoFrequency, trendChange
  migrations/
    0000_create_tables.sql  — observations + rate_limits tables
  test/
    helpers.ts              — Shared test utilities (seed data, cleanup)
    aggregation.test.ts     — Unit tests for pure aggregation functions
    observations.test.ts    — POST /api/observations integration tests
    products.test.ts        — GET stats + search integration tests
    trends.test.ts          — GET /api/trends integration tests
    contributor.test.ts     — DELETE integration tests
    rate-limit.test.ts      — Rate limiting integration tests
  wrangler.toml
  vitest.config.ts
  tsconfig.json
  package.json
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `src/lib/types.ts`
- Create: `src/index.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create the project directory and initialize**

```bash
mkdir -p /Users/michaelryan/Programming/JavaScript/chook-check-api
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git init
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "chook-check-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hono": "^4",
    "zod": "^3",
    "@hono/zod-validator": "^0.4"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8",
    "@cloudflare/workers-types": "^4",
    "typescript": "^5",
    "vitest": "~2.1",
    "wrangler": "^4"
  }
}
```

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npm install`

Note: `@cloudflare/vitest-pool-workers` pins Vitest to ~2.1 — do not use Vitest 3.x with it.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "paths": {
      "@/*": ["./src/*"]
    },
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Create `wrangler.toml`**

```toml
name = "chook-check-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "chook-check"
database_id = "local"
migrations_dir = "migrations"
```

Note: `database_id = "local"` is a placeholder for local dev. The real ID is set after `wrangler d1 create` during deployment.

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          d1Databases: {
            DB: {
              migrationsDir: "./migrations",
            },
          },
        },
      },
    },
  },
});
```

- [ ] **Step 6: Create `src/lib/types.ts`**

```typescript
export type Bindings = {
  DB: D1Database;
};

export type App = {
  Bindings: Bindings;
};
```

- [ ] **Step 7: Create `src/index.ts`**

Minimal Hono app with CORS, error handling, and a health endpoint:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { App } from "./lib/types";

const app = new Hono<App>();

// CORS — wildcard origin for browser extension compatibility
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Global error handler
app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      error: "server_error",
      message: "An unexpected error occurred",
    },
    500,
  );
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
```

- [ ] **Step 8: Create `.gitignore`**

```
node_modules/
dist/
.wrangler/
.dev.vars
```

- [ ] **Step 9: Verify the app starts**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx wrangler dev --local`
Expected: Worker starts and responds to `curl http://localhost:8787/health` with `{"status":"ok"}`

Stop the dev server after verifying.

- [ ] **Step 10: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add -A
git commit -m "chore: scaffold project with Hono, D1, and Vitest"
```

---

### Task 2: D1 schema and migration

**Files:**
- Create: `migrations/0000_create_tables.sql`

- [ ] **Step 1: Create the migration file**

Create `migrations/0000_create_tables.sql`:

```sql
-- Observations table
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  gtin TEXT,
  store_chain TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  was_price_cents INTEGER,
  unit_price_cents INTEGER,
  unit_measure TEXT,
  promo_type TEXT,
  is_personalised INTEGER NOT NULL DEFAULT 0,
  contributor_id TEXT NOT NULL,
  browser TEXT,
  state TEXT,
  city TEXT,
  store_name TEXT,
  observed_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE INDEX idx_observations_product_id ON observations(product_id);
CREATE INDEX idx_observations_contributor_id ON observations(contributor_id);
CREATE INDEX idx_observations_store_chain ON observations(store_chain);
CREATE INDEX idx_observations_observed_at ON observations(observed_at);
CREATE INDEX idx_observations_product_observed ON observations(product_id, observed_at);

-- Rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  PRIMARY KEY (key, endpoint)
);
```

- [ ] **Step 2: Verify migration applies locally**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx wrangler d1 migrations apply chook-check --local`
Expected: Migration applied successfully.

- [ ] **Step 3: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add migrations/
git commit -m "feat: add D1 schema — observations and rate_limits tables"
```

---

### Task 3: Types, Zod schemas, and aggregation helpers

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/schemas.ts`
- Create: `src/lib/aggregation.ts`
- Create: `test/aggregation.test.ts`

- [ ] **Step 1: Write aggregation tests**

Create `test/aggregation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { median, promoFrequency, trendChange } from "../src/lib/aggregation";

describe("median", () => {
  it("returns the middle value for odd-length arrays", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("returns average of two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the single value for length-1 arrays", () => {
    expect(median([42])).toBe(42);
  });

  it("returns 0 for empty arrays", () => {
    expect(median([])).toBe(0);
  });

  it("handles unsorted input", () => {
    expect(median([5, 1, 3, 9, 7])).toBe(5);
  });
});

describe("promoFrequency", () => {
  it("calculates proportions for each promo type", () => {
    const types = ["member_price", "member_price", "none", "half_price", "none"];
    const result = promoFrequency(types);
    expect(result["member_price"]).toBeCloseTo(0.4);
    expect(result["half_price"]).toBeCloseTo(0.2);
    expect(result["none"]).toBeCloseTo(0.4);
  });

  it("returns empty object for empty array", () => {
    expect(promoFrequency([])).toEqual({});
  });

  it("handles null promo types by using 'none'", () => {
    const types = [null, "member_price", null];
    const result = promoFrequency(types);
    expect(result["none"]).toBeCloseTo(2 / 3);
    expect(result["member_price"]).toBeCloseTo(1 / 3);
  });
});

describe("trendChange", () => {
  it("calculates positive change", () => {
    const result = trendChange(450, 400);
    expect(result.changePercent).toBeCloseTo(12.5);
    expect(result.direction).toBe("up");
  });

  it("calculates negative change", () => {
    const result = trendChange(400, 450);
    expect(result.changePercent).toBeCloseTo(-11.11, 1);
    expect(result.direction).toBe("down");
  });

  it("returns zero change for equal prices", () => {
    const result = trendChange(500, 500);
    expect(result.changePercent).toBe(0);
    expect(result.direction).toBe("up");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/aggregation.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/aggregation.ts`**

```typescript
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function promoFrequency(
  promoTypes: (string | null)[],
): Record<string, number> {
  if (promoTypes.length === 0) return {};
  const counts: Record<string, number> = {};
  for (const type of promoTypes) {
    const key = type ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = promoTypes.length;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) {
    result[key] = count / total;
  }
  return result;
}

export function trendChange(
  currentMedian: number,
  previousMedian: number,
): { changePercent: number; direction: "up" | "down" } {
  if (previousMedian === 0) {
    return { changePercent: 0, direction: "up" };
  }
  const changePercent =
    ((currentMedian - previousMedian) / previousMedian) * 100;
  return {
    changePercent,
    direction: changePercent >= 0 ? "up" : "down",
  };
}
```

- [ ] **Step 4: Create `src/lib/schemas.ts`**

```typescript
import { z } from "zod";

const fourteenDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString();
};

export const observationSchema = z.object({
  productId: z.string().min(1).max(100),
  productName: z.string().min(1).max(200),
  brand: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  gtin: z.string().max(20).nullable().optional(),
  storeChain: z.enum(["woolworths", "coles"]),
  priceCents: z.number().int().positive().lt(1_000_000),
  wasPriceCents: z.number().int().positive().lt(1_000_000).nullable().optional(),
  unitPriceCents: z.number().int().positive().lt(1_000_000).nullable().optional(),
  unitMeasure: z.string().max(50).nullable().optional(),
  promoType: z.string().max(50).nullable().optional(),
  isPersonalised: z.boolean(),
  observedAt: z
    .string()
    .datetime()
    .refine((val) => new Date(val).getTime() >= new Date(fourteenDaysAgo()).getTime(), {
      message: "observedAt must be within the last 14 days",
    })
    .refine((val) => new Date(val).getTime() <= Date.now(), {
      message: "observedAt must not be in the future",
    }),
});

export const submitObservationsSchema = z.object({
  contributorId: z.string().uuid(),
  observations: z.array(observationSchema).min(1).max(50),
  context: z
    .object({
      browser: z.string().max(50).optional(),
      state: z.string().max(20).optional(),
      city: z.string().max(100).optional(),
      store: z.string().max(200).optional(),
    })
    .optional(),
});

export const productStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  chain: z.enum(["woolworths", "coles"]).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  chain: z.enum(["woolworths", "coles"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const trendsQuerySchema = z.object({
  period: z.enum(["1d", "7d", "14d", "30d"]).default("7d"),
  chain: z.enum(["woolworths", "coles"]).optional(),
  category: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

- [ ] **Step 5: Update `src/lib/types.ts`** with API response types

Replace the file with:

```typescript
export type Bindings = {
  DB: D1Database;
};

export type App = {
  Bindings: Bindings;
};

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
  priceHistory: DayBucket[];
  promoFrequency: Record<string, number>;
}

export interface DayBucket {
  date: string;
  medianCents: number;
  minCents: number;
  maxCents: number;
}

export interface SearchResult {
  productId: string;
  productName: string;
  brand: string | null;
  storeChain: string;
  latestMedianCents: number | null;
  observationCount: number;
}

export interface TrendResult {
  productId: string;
  productName: string;
  brand: string | null;
  storeChain: string;
  changePercent: number;
  direction: "up" | "down";
  currentMedianCents: number;
  previousMedianCents: number;
}
```

- [ ] **Step 6: Run aggregation tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/aggregation.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/lib/ test/aggregation.test.ts
git commit -m "feat: add types, Zod schemas, and aggregation helpers"
```

---

### Task 4: Database query functions

**Files:**
- Create: `src/db/queries.ts`

This module contains all parameterized D1 queries. Each function takes a `D1Database` and returns typed results. No separate test file — queries are tested through the route integration tests in Tasks 6–9.

- [ ] **Step 1: Create `src/db/queries.ts`**

```typescript
import type { DayBucket } from "../lib/types";
import { median, promoFrequency, trendChange } from "../lib/aggregation";

// --- Observations ---

export interface InsertObservation {
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  gtin: string | null;
  storeChain: string;
  priceCents: number;
  wasPriceCents: number | null;
  unitPriceCents: number | null;
  unitMeasure: string | null;
  promoType: string | null;
  isPersonalised: boolean;
  contributorId: string;
  browser: string | null;
  state: string | null;
  city: string | null;
  storeName: string | null;
  observedAt: string;
}

/** Check if a duplicate observation exists (same contributor, product, UTC day, price). */
export async function isDuplicate(
  db: D1Database,
  contributorId: string,
  productId: string,
  observedAt: string,
  priceCents: number,
): Promise<boolean> {
  const utcDate = observedAt.slice(0, 10); // "YYYY-MM-DD"
  const result = await db
    .prepare(
      `SELECT 1 FROM observations
       WHERE contributor_id = ? AND product_id = ?
         AND substr(observed_at, 1, 10) = ? AND price_cents = ?
       LIMIT 1`,
    )
    .bind(contributorId, productId, utcDate, priceCents)
    .first();
  return result !== null;
}

/** Insert a single observation. */
export async function insertObservation(
  db: D1Database,
  obs: InsertObservation,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO observations (
        product_id, product_name, brand, category, gtin, store_chain,
        price_cents, was_price_cents, unit_price_cents, unit_measure,
        promo_type, is_personalised, contributor_id,
        browser, state, city, store_name, observed_at, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      obs.productId,
      obs.productName,
      obs.brand,
      obs.category,
      obs.gtin,
      obs.storeChain,
      obs.priceCents,
      obs.wasPriceCents,
      obs.unitPriceCents,
      obs.unitMeasure,
      obs.promoType,
      obs.isPersonalised ? 1 : 0,
      obs.contributorId,
      obs.browser,
      obs.state,
      obs.city,
      obs.storeName,
      obs.observedAt,
      new Date().toISOString(),
    )
    .run();
}

// --- Product Stats ---

const QUORUM = 3;

interface ObservationRow {
  price_cents: number;
  promo_type: string | null;
  observed_at: string;
  contributor_id: string;
  product_name: string;
  brand: string | null;
  store_chain: string;
}

/** Get product stats with crowd quorum enforcement. */
export async function getProductStats(
  db: D1Database,
  productId: string,
  days: number,
  chain?: string,
) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  let sql = `SELECT price_cents, promo_type, observed_at, contributor_id,
                    product_name, brand, store_chain
             FROM observations
             WHERE product_id = ? AND observed_at >= ?`;
  const params: unknown[] = [productId, sinceStr];

  if (chain) {
    sql += ` AND store_chain = ?`;
    params.push(chain);
  }

  sql += ` ORDER BY observed_at ASC`;

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<ObservationRow>();

  if (!results || results.length === 0) return null;

  const contributors = new Set(results.map((r) => r.contributor_id));
  const quorum = contributors.size >= QUORUM;

  const prices = results.map((r) => r.price_cents);
  const latestRow = results[results.length - 1];

  // Group by UTC date for price history
  const byDate = new Map<string, number[]>();
  for (const row of results) {
    const date = row.observed_at.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row.price_cents);
  }

  const priceHistory: DayBucket[] = [];
  for (const [date, dayPrices] of byDate) {
    priceHistory.push({
      date,
      medianCents: median(dayPrices),
      minCents: Math.min(...dayPrices),
      maxCents: Math.max(...dayPrices),
    });
  }

  return {
    productId,
    productName: latestRow.product_name,
    brand: latestRow.brand,
    storeChain: latestRow.store_chain,
    quorum,
    currentMedianCents: quorum ? median(prices) : null,
    minCents: quorum ? Math.min(...prices) : null,
    maxCents: quorum ? Math.max(...prices) : null,
    observationCount: results.length,
    contributorCount: contributors.size,
    priceHistory: quorum ? priceHistory : [],
    promoFrequency: quorum
      ? promoFrequency(results.map((r) => r.promo_type))
      : {},
  };
}

// --- Search ---

interface SearchRow {
  product_id: string;
  product_name: string;
  brand: string | null;
  store_chain: string;
  cnt: number;
  contributor_cnt: number;
}

export async function searchProducts(
  db: D1Database,
  query: string,
  limit: number,
  chain?: string,
) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString();
  const likeTerm = `%${query}%`;

  let sql = `SELECT product_id, product_name, brand, store_chain,
                    COUNT(*) as cnt,
                    COUNT(DISTINCT contributor_id) as contributor_cnt
             FROM observations
             WHERE observed_at >= ?
               AND (product_name LIKE ? OR brand LIKE ?)`;
  const params: unknown[] = [sinceStr, likeTerm, likeTerm];

  if (chain) {
    sql += ` AND store_chain = ?`;
    params.push(chain);
  }

  sql += ` GROUP BY product_id
           HAVING contributor_cnt >= ?
           ORDER BY cnt DESC
           LIMIT ?`;
  params.push(QUORUM, limit);

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<SearchRow>();

  if (!results) return [];

  // Compute median for each product
  const searchResults = [];
  for (const row of results) {
    const priceRows = await db
      .prepare(
        `SELECT price_cents FROM observations
         WHERE product_id = ? AND observed_at >= ?`,
      )
      .bind(row.product_id, sinceStr)
      .all<{ price_cents: number }>();

    searchResults.push({
      productId: row.product_id,
      productName: row.product_name,
      brand: row.brand,
      storeChain: row.store_chain,
      latestMedianCents: median(
        (priceRows.results ?? []).map((r) => r.price_cents),
      ),
      observationCount: row.cnt,
    });
  }

  return searchResults;
}

// --- Trends ---

interface TrendRow {
  product_id: string;
  product_name: string;
  brand: string | null;
  store_chain: string;
}

export async function getTrends(
  db: D1Database,
  periodDays: number,
  limit: number,
  chain?: string,
  category?: string,
) {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - periodDays);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - periodDays);

  const currentStartStr = currentStart.toISOString();
  const previousStartStr = previousStart.toISOString();
  const nowStr = now.toISOString();

  // Get all products with observations in the full window
  let sql = `SELECT DISTINCT product_id, product_name, brand, store_chain
             FROM observations
             WHERE observed_at >= ?`;
  const params: unknown[] = [previousStartStr];

  if (chain) {
    sql += ` AND store_chain = ?`;
    params.push(chain);
  }
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  const { results: products } = await db
    .prepare(sql)
    .bind(...params)
    .all<TrendRow>();

  if (!products || products.length === 0) return [];

  const trends = [];

  for (const product of products) {
    // Current period observations
    const currentObs = await db
      .prepare(
        `SELECT price_cents, contributor_id FROM observations
         WHERE product_id = ? AND observed_at >= ? AND observed_at <= ?`,
      )
      .bind(product.product_id, currentStartStr, nowStr)
      .all<{ price_cents: number; contributor_id: string }>();

    // Previous period observations
    const prevObs = await db
      .prepare(
        `SELECT price_cents, contributor_id FROM observations
         WHERE product_id = ? AND observed_at >= ? AND observed_at < ?`,
      )
      .bind(product.product_id, previousStartStr, currentStartStr)
      .all<{ price_cents: number; contributor_id: string }>();

    const currentResults = currentObs.results ?? [];
    const prevResults = prevObs.results ?? [];

    // Check quorum in both periods
    const currentContributors = new Set(currentResults.map((r) => r.contributor_id));
    const prevContributors = new Set(prevResults.map((r) => r.contributor_id));

    if (currentContributors.size < QUORUM || prevContributors.size < QUORUM) {
      continue;
    }

    if (currentResults.length === 0 || prevResults.length === 0) continue;

    const currentMedian = median(currentResults.map((r) => r.price_cents));
    const prevMedian = median(prevResults.map((r) => r.price_cents));

    if (currentMedian === prevMedian) continue;

    const change = trendChange(currentMedian, prevMedian);

    trends.push({
      productId: product.product_id,
      productName: product.product_name,
      brand: product.brand,
      storeChain: product.store_chain,
      changePercent: Math.round(change.changePercent * 100) / 100,
      direction: change.direction,
      currentMedianCents: currentMedian,
      previousMedianCents: prevMedian,
    });
  }

  // Sort by absolute change, take top N
  trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  return trends.slice(0, limit);
}

// --- Contributor Deletion ---

export async function deleteContributor(
  db: D1Database,
  contributorId: string,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM observations WHERE contributor_id = ?`)
    .bind(contributorId)
    .run();
  return result.meta?.changes ?? 0;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/db/
git commit -m "feat: add parameterized D1 query functions"
```

---

### Task 5: Rate limiting middleware

**Files:**
- Create: `src/middleware/rate-limit.ts`
- Create: `test/helpers.ts`
- Create: `test/rate-limit.test.ts`

- [ ] **Step 1: Create `test/helpers.ts`**

```typescript
import { env } from "cloudflare:test";

/** Clean all tables between tests. */
export async function cleanDb() {
  await env.DB.exec("DELETE FROM observations");
  await env.DB.exec("DELETE FROM rate_limits");
}
```

- [ ] **Step 2: Create `src/middleware/rate-limit.ts`**

```typescript
import { createMiddleware } from "hono/factory";
import type { App } from "../lib/types";

interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyFn: (c: any) => string | null;
}

export function rateLimit(config: RateLimitConfig) {
  return createMiddleware<App>(async (c, next) => {
    const key = config.keyFn(c);
    if (!key) {
      return next();
    }

    const db = c.env.DB;
    const endpoint = `${c.req.method} ${c.req.routePath}`;
    const now = Date.now();

    const row = await db
      .prepare(
        `SELECT count, window_start FROM rate_limits WHERE key = ? AND endpoint = ?`,
      )
      .bind(key, endpoint)
      .first<{ count: number; window_start: string }>();

    if (!row) {
      await db
        .prepare(
          `INSERT INTO rate_limits (key, endpoint, count, window_start) VALUES (?, ?, 1, ?)`,
        )
        .bind(key, endpoint, new Date(now).toISOString())
        .run();
      return next();
    }

    const windowStart = new Date(row.window_start).getTime();
    const windowAge = now - windowStart;

    if (windowAge > config.windowMs) {
      await db
        .prepare(
          `UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ? AND endpoint = ?`,
        )
        .bind(new Date(now).toISOString(), key, endpoint)
        .run();
      return next();
    }

    if (row.count >= config.limit) {
      const retryAfter = Math.ceil((config.windowMs - windowAge) / 1000);
      return c.json(
        {
          error: "rate_limited",
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        },
        429,
        { "Retry-After": String(retryAfter) },
      );
    }

    await db
      .prepare(
        `UPDATE rate_limits SET count = count + 1 WHERE key = ? AND endpoint = ?`,
      )
      .bind(key, endpoint)
      .run();

    return next();
  });
}

// Pre-configured rate limiters
const ONE_HOUR = 60 * 60 * 1000;

/** 60 requests/hour keyed by contributor ID from validated JSON body. */
export const postRateLimit = rateLimit({
  limit: 60,
  windowMs: ONE_HOUR,
  keyFn: (c) => {
    try {
      const data = c.req.valid("json");
      return data?.contributorId ?? null;
    } catch {
      return null;
    }
  },
});

/** 120 requests/hour keyed by IP for GET endpoints. */
export const getRateLimit = rateLimit({
  limit: 120,
  windowMs: ONE_HOUR,
  keyFn: (c) =>
    c.req.header("CF-Connecting-IP") ??
    c.req.header("x-forwarded-for") ??
    "unknown",
});

/** 5 requests/hour keyed by contributor ID in URL param. */
export const deleteRateLimit = rateLimit({
  limit: 5,
  windowMs: ONE_HOUR,
  keyFn: (c) => c.req.param("contributorId") ?? null,
});
```

- [ ] **Step 3: Write rate limit tests**

Create `test/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF } from "cloudflare:test";
import { cleanDb } from "./helpers";

beforeEach(async () => {
  await cleanDb();
});

const validBody = {
  contributorId: "00000000-0000-0000-0000-000000000001",
  observations: [
    {
      productId: "woolworths:1",
      productName: "Test Product",
      storeChain: "woolworths",
      priceCents: 500,
      isPersonalised: false,
      observedAt: new Date().toISOString(),
    },
  ],
};

describe("rate limiting", () => {
  it("allows requests within the limit", async () => {
    const res = await SELF.fetch("http://localhost/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
  });

  it("returns 429 when POST limit exceeded", async () => {
    // Submit 61 requests (limit is 60/hour)
    for (let i = 0; i < 60; i++) {
      await SELF.fetch("http://localhost/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
    }
    const res = await SELF.fetch("http://localhost/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(429);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("rate_limited");
  });

  it("includes Retry-After header on 429", async () => {
    for (let i = 0; i < 60; i++) {
      await SELF.fetch("http://localhost/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
    }
    const res = await SELF.fetch("http://localhost/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
```

Note: Rate limit tests depend on the POST /api/observations route existing. They will be run after Task 6 wires up that route.

- [ ] **Step 4: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/middleware/ test/helpers.ts test/rate-limit.test.ts
git commit -m "feat: add sliding-window rate limiting middleware"
```

---

### Task 6: POST /api/observations

**Files:**
- Create: `src/routes/observations.ts`
- Modify: `src/index.ts` — register the route
- Create: `test/observations.test.ts`

- [ ] **Step 1: Write observation tests**

Create `test/observations.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { cleanDb } from "./helpers";

beforeEach(async () => {
  await cleanDb();
});

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    contributorId: "00000000-0000-0000-0000-000000000001",
    observations: [
      {
        productId: "woolworths:123",
        productName: "Vegemite 380g",
        brand: "Vegemite",
        category: "Spreads",
        storeChain: "woolworths",
        priceCents: 750,
        isPersonalised: false,
        observedAt: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

async function postObs(body: unknown) {
  return SELF.fetch("http://localhost/api/observations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/observations", () => {
  it("accepts a valid single observation", async () => {
    const res = await postObs(makeBody());
    expect(res.status).toBe(201);
    const json = await res.json<{ accepted: number }>();
    expect(json.accepted).toBe(1);
    expect(json.duplicates).toBe(0);
  });

  it("accepts a batch of observations", async () => {
    const body = makeBody({
      observations: [
        {
          productId: "woolworths:1",
          productName: "Product A",
          storeChain: "woolworths",
          priceCents: 500,
          isPersonalised: false,
          observedAt: new Date().toISOString(),
        },
        {
          productId: "woolworths:2",
          productName: "Product B",
          storeChain: "coles",
          priceCents: 600,
          isPersonalised: false,
          observedAt: new Date().toISOString(),
        },
      ],
    });
    const res = await postObs(body);
    expect(res.status).toBe(201);
    const json = await res.json<{ accepted: number }>();
    expect(json.accepted).toBe(2);
  });

  it("deduplicates same contributor + product + day + price", async () => {
    const body = makeBody();
    await postObs(body);
    const res = await postObs(body);
    expect(res.status).toBe(201);
    const json = await res.json<{ accepted: number; duplicates: number }>();
    expect(json.accepted).toBe(0);
    expect(json.duplicates).toBe(1);
  });

  it("rejects invalid contributorId", async () => {
    const res = await postObs(makeBody({ contributorId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    const json = await res.json<{ error: string }>();
    expect(json.error).toBe("validation_error");
  });

  it("rejects empty observations array", async () => {
    const res = await postObs(makeBody({ observations: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects negative price", async () => {
    const body = makeBody({
      observations: [
        {
          productId: "woolworths:1",
          productName: "Test",
          storeChain: "woolworths",
          priceCents: -100,
          isPersonalised: false,
          observedAt: new Date().toISOString(),
        },
      ],
    });
    const res = await postObs(body);
    expect(res.status).toBe(400);
  });

  it("rejects observations older than 14 days", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 15);
    const body = makeBody({
      observations: [
        {
          productId: "woolworths:1",
          productName: "Test",
          storeChain: "woolworths",
          priceCents: 500,
          isPersonalised: false,
          observedAt: old.toISOString(),
        },
      ],
    });
    const res = await postObs(body);
    expect(res.status).toBe(400);
  });

  it("stores context fields when provided", async () => {
    const body = makeBody({
      context: { browser: "Chrome", state: "VIC" },
    });
    const res = await postObs(body);
    expect(res.status).toBe(201);

    // Verify in DB
    const row = await env.DB.prepare(
      "SELECT browser, state FROM observations LIMIT 1",
    ).first<{ browser: string; state: string }>();
    expect(row?.browser).toBe("Chrome");
    expect(row?.state).toBe("VIC");
  });
});
```

- [ ] **Step 2: Create `src/routes/observations.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { App } from "../lib/types";
import { submitObservationsSchema } from "../lib/schemas";
import { isDuplicate, insertObservation } from "../db/queries";
import { postRateLimit } from "../middleware/rate-limit";

const observations = new Hono<App>();

observations.post(
  "/",
  zValidator("json", submitObservationsSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details: result.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
        400,
      );
    }
  }),
  postRateLimit,
  async (c) => {
    const { contributorId, observations: obs, context } = c.req.valid("json");
    const db = c.env.DB;

    let accepted = 0;
    let duplicates = 0;
    const rejected = 0;
    const reasons: string[] = [];

    for (const o of obs) {
      const dup = await isDuplicate(
        db,
        contributorId,
        o.productId,
        o.observedAt,
        o.priceCents,
      );
      if (dup) {
        duplicates++;
        continue;
      }

      await insertObservation(db, {
        productId: o.productId,
        productName: o.productName,
        brand: o.brand ?? null,
        category: o.category ?? null,
        gtin: o.gtin ?? null,
        storeChain: o.storeChain,
        priceCents: o.priceCents,
        wasPriceCents: o.wasPriceCents ?? null,
        unitPriceCents: o.unitPriceCents ?? null,
        unitMeasure: o.unitMeasure ?? null,
        promoType: o.promoType ?? null,
        isPersonalised: o.isPersonalised,
        contributorId,
        browser: context?.browser ?? null,
        state: context?.state ?? null,
        city: context?.city ?? null,
        storeName: context?.store ?? null,
        observedAt: o.observedAt,
      });
      accepted++;
    }

    return c.json(
      {
        accepted,
        duplicates,
        rejected,
        ...(reasons.length > 0 ? { reasons } : {}),
      },
      201,
    );
  },
);

export { observations };
```

- [ ] **Step 3: Wire the route into `src/index.ts`**

Add after the health check in `src/index.ts`:

```typescript
import { observations } from "./routes/observations";

app.route("/api/observations", observations);
```

- [ ] **Step 4: Run observation tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/observations.test.ts`
Expected: all pass.

- [ ] **Step 5: Run rate limit tests (now that the route exists)**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/rate-limit.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/routes/observations.ts src/index.ts test/observations.test.ts
git commit -m "feat: add POST /api/observations with dedup and validation"
```

---

### Task 7: GET /api/products/:productId/stats and GET /api/products/search

**Files:**
- Create: `src/routes/products.ts`
- Modify: `src/index.ts` — register the route
- Create: `test/products.test.ts`

- [ ] **Step 1: Write product tests**

Create `test/products.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { cleanDb } from "./helpers";

beforeEach(async () => {
  await cleanDb();
});

/** Seed observations from N distinct contributors. */
async function seedProduct(
  productId: string,
  productName: string,
  contributorCount: number,
  priceCents: number = 750,
) {
  for (let i = 0; i < contributorCount; i++) {
    const cid = `00000000-0000-0000-0000-00000000000${i + 1}`;
    await env.DB.prepare(
      `INSERT INTO observations (product_id, product_name, brand, store_chain,
        price_cents, is_personalised, contributor_id, promo_type, observed_at, submitted_at)
       VALUES (?, ?, 'TestBrand', 'woolworths', ?, 0, ?, 'none', ?, ?)`,
    )
      .bind(
        productId,
        productName,
        priceCents + i * 10,
        cid,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
  }
}

describe("GET /api/products/:productId/stats", () => {
  it("returns product stats when quorum is met", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 3);
    const res = await SELF.fetch(
      "http://localhost/api/products/woolworths:123/stats",
    );
    expect(res.status).toBe(200);
    const json = await res.json<{
      quorum: boolean;
      currentMedianCents: number;
      contributorCount: number;
    }>();
    expect(json.quorum).toBe(true);
    expect(json.currentMedianCents).toBeTypeOf("number");
    expect(json.contributorCount).toBe(3);
  });

  it("returns quorum=false when fewer than 3 contributors", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 2);
    const res = await SELF.fetch(
      "http://localhost/api/products/woolworths:123/stats",
    );
    expect(res.status).toBe(200);
    const json = await res.json<{
      quorum: boolean;
      currentMedianCents: number | null;
    }>();
    expect(json.quorum).toBe(false);
    expect(json.currentMedianCents).toBeNull();
  });

  it("returns 404 for unknown product", async () => {
    const res = await SELF.fetch(
      "http://localhost/api/products/woolworths:999/stats",
    );
    expect(res.status).toBe(404);
  });

  it("returns price history bucketed by day", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 3);
    const res = await SELF.fetch(
      "http://localhost/api/products/woolworths:123/stats",
    );
    const json = await res.json<{ priceHistory: unknown[] }>();
    expect(json.priceHistory.length).toBeGreaterThan(0);
  });

  it("filters by chain when specified", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 3);
    const res = await SELF.fetch(
      "http://localhost/api/products/woolworths:123/stats?chain=coles",
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/products/search", () => {
  it("finds products by name", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 3);
    const res = await SELF.fetch(
      "http://localhost/api/products/search?q=vegemite",
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ results: unknown[] }>();
    expect(json.results.length).toBe(1);
  });

  it("returns empty results when no quorum", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 2);
    const res = await SELF.fetch(
      "http://localhost/api/products/search?q=vegemite",
    );
    const json = await res.json<{ results: unknown[] }>();
    expect(json.results.length).toBe(0);
  });

  it("rejects search query shorter than 2 chars", async () => {
    const res = await SELF.fetch(
      "http://localhost/api/products/search?q=v",
    );
    expect(res.status).toBe(400);
  });

  it("filters by chain", async () => {
    await seedProduct("woolworths:123", "Vegemite 380g", 3);
    const res = await SELF.fetch(
      "http://localhost/api/products/search?q=vegemite&chain=coles",
    );
    const json = await res.json<{ results: unknown[] }>();
    expect(json.results.length).toBe(0);
  });
});
```

- [ ] **Step 2: Create `src/routes/products.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { App } from "../lib/types";
import { productStatsQuerySchema, searchQuerySchema } from "../lib/schemas";
import { getProductStats, searchProducts } from "../db/queries";
import { getRateLimit } from "../middleware/rate-limit";

const products = new Hono<App>();

products.get(
  "/:productId/stats",
  getRateLimit,
  zValidator("query", productStatsQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "validation_error",
          message: "Invalid query parameters",
          details: result.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
        400,
      );
    }
  }),
  async (c) => {
    const productId = c.req.param("productId");
    const { days, chain } = c.req.valid("query");
    const stats = await getProductStats(c.env.DB, productId, days, chain);
    if (!stats) {
      return c.json(
        {
          error: "not_found",
          message: "No observations found for this product",
        },
        404,
      );
    }
    return c.json(stats);
  },
);

products.get(
  "/search",
  getRateLimit,
  zValidator("query", searchQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "validation_error",
          message: "Invalid query parameters",
          details: result.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
        400,
      );
    }
  }),
  async (c) => {
    const { q, chain, limit } = c.req.valid("query");
    const results = await searchProducts(c.env.DB, q, limit, chain);
    return c.json({ results });
  },
);

export { products };
```

- [ ] **Step 3: Wire into `src/index.ts`**

Add:
```typescript
import { products } from "./routes/products";

app.route("/api/products", products);
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/products.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/routes/products.ts src/index.ts test/products.test.ts
git commit -m "feat: add product stats and search endpoints"
```

---

### Task 8: GET /api/trends

**Files:**
- Create: `src/routes/trends.ts`
- Modify: `src/index.ts` — register the route
- Create: `test/trends.test.ts`

- [ ] **Step 1: Write trends tests**

Create `test/trends.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { cleanDb } from "./helpers";

beforeEach(async () => {
  await cleanDb();
});

/** Seed observations in a specific time period. */
async function seedInPeriod(
  productId: string,
  productName: string,
  priceCents: number,
  daysAgo: number,
  contributorCount: number,
) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  for (let i = 0; i < contributorCount; i++) {
    const cid = `00000000-0000-0000-0000-00000000000${i + 1}`;
    await env.DB.prepare(
      `INSERT INTO observations (product_id, product_name, brand, category, store_chain,
        price_cents, is_personalised, contributor_id, observed_at, submitted_at)
       VALUES (?, ?, 'Brand', 'Dairy', 'coles', ?, 0, ?, ?, ?)`,
    )
      .bind(
        productId,
        productName,
        priceCents,
        cid,
        date.toISOString(),
        new Date().toISOString(),
      )
      .run();
  }
}

describe("GET /api/trends", () => {
  it("returns price trends with quorum in both periods", async () => {
    // Previous period (8-14 days ago): price 400
    await seedInPeriod("coles:1", "Milk 2L", 400, 10, 3);
    // Current period (0-7 days ago): price 450
    await seedInPeriod("coles:1", "Milk 2L", 450, 2, 3);

    const res = await SELF.fetch("http://localhost/api/trends?period=7d");
    expect(res.status).toBe(200);
    const json = await res.json<{
      trends: { direction: string; changePercent: number }[];
    }>();
    expect(json.trends.length).toBe(1);
    expect(json.trends[0].direction).toBe("up");
    expect(json.trends[0].changePercent).toBeGreaterThan(0);
  });

  it("returns empty when quorum not met", async () => {
    await seedInPeriod("coles:1", "Milk 2L", 400, 10, 2);
    await seedInPeriod("coles:1", "Milk 2L", 450, 2, 2);

    const res = await SELF.fetch("http://localhost/api/trends?period=7d");
    const json = await res.json<{ trends: unknown[] }>();
    expect(json.trends.length).toBe(0);
  });

  it("filters by chain", async () => {
    await seedInPeriod("coles:1", "Milk 2L", 400, 10, 3);
    await seedInPeriod("coles:1", "Milk 2L", 450, 2, 3);

    const res = await SELF.fetch(
      "http://localhost/api/trends?period=7d&chain=woolworths",
    );
    const json = await res.json<{ trends: unknown[] }>();
    expect(json.trends.length).toBe(0);
  });

  it("filters by category", async () => {
    await seedInPeriod("coles:1", "Milk 2L", 400, 10, 3);
    await seedInPeriod("coles:1", "Milk 2L", 450, 2, 3);

    const res = await SELF.fetch(
      "http://localhost/api/trends?period=7d&category=Dairy",
    );
    const json = await res.json<{ trends: unknown[] }>();
    expect(json.trends.length).toBe(1);
  });
});
```

- [ ] **Step 2: Create `src/routes/trends.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { App } from "../lib/types";
import { trendsQuerySchema } from "../lib/schemas";
import { getTrends } from "../db/queries";
import { getRateLimit } from "../middleware/rate-limit";

const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

const trends = new Hono<App>();

trends.get(
  "/",
  getRateLimit,
  zValidator("query", trendsQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "validation_error",
          message: "Invalid query parameters",
          details: result.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
        400,
      );
    }
  }),
  async (c) => {
    const { period, chain, category, limit } = c.req.valid("query");
    const periodDays = PERIOD_DAYS[period];
    const results = await getTrends(c.env.DB, periodDays, limit, chain, category);
    return c.json({ trends: results });
  },
);

export { trends };
```

- [ ] **Step 3: Wire into `src/index.ts`**

Add:
```typescript
import { trends } from "./routes/trends";

app.route("/api/trends", trends);
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/trends.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/routes/trends.ts src/index.ts test/trends.test.ts
git commit -m "feat: add trends endpoint with period comparison"
```

---

### Task 9: DELETE /api/contributor/:contributorId

**Files:**
- Create: `src/routes/contributor.ts`
- Modify: `src/index.ts` — register the route
- Create: `test/contributor.test.ts`

- [ ] **Step 1: Write contributor deletion tests**

Create `test/contributor.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { cleanDb } from "./helpers";

beforeEach(async () => {
  await cleanDb();
});

const CONTRIBUTOR_ID = "00000000-0000-0000-0000-000000000001";

async function seedObservations(count: number) {
  for (let i = 0; i < count; i++) {
    await env.DB.prepare(
      `INSERT INTO observations (product_id, product_name, store_chain,
        price_cents, is_personalised, contributor_id, observed_at, submitted_at)
       VALUES (?, ?, 'woolworths', 500, 0, ?, ?, ?)`,
    )
      .bind(
        `woolworths:${i}`,
        `Product ${i}`,
        CONTRIBUTOR_ID,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
  }
}

describe("DELETE /api/contributor/:contributorId", () => {
  it("deletes all observations for a contributor", async () => {
    await seedObservations(5);
    const res = await SELF.fetch(
      `http://localhost/api/contributor/${CONTRIBUTOR_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ deleted: number }>();
    expect(json.deleted).toBe(5);

    // Verify DB is clean
    const row = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM observations WHERE contributor_id = ?",
    )
      .bind(CONTRIBUTOR_ID)
      .first<{ cnt: number }>();
    expect(row?.cnt).toBe(0);
  });

  it("returns deleted=0 for unknown contributor", async () => {
    const res = await SELF.fetch(
      `http://localhost/api/contributor/${CONTRIBUTOR_ID}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ deleted: number }>();
    expect(json.deleted).toBe(0);
  });

  it("does not delete other contributors' data", async () => {
    await seedObservations(3);
    await env.DB.prepare(
      `INSERT INTO observations (product_id, product_name, store_chain,
        price_cents, is_personalised, contributor_id, observed_at, submitted_at)
       VALUES ('woolworths:99', 'Other', 'woolworths', 500, 0,
        '00000000-0000-0000-0000-000000000002', ?, ?)`,
    )
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();

    await SELF.fetch(
      `http://localhost/api/contributor/${CONTRIBUTOR_ID}`,
      { method: "DELETE" },
    );

    const row = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM observations",
    ).first<{ cnt: number }>();
    expect(row?.cnt).toBe(1);
  });
});
```

- [ ] **Step 2: Create `src/routes/contributor.ts`**

```typescript
import { Hono } from "hono";
import type { App } from "../lib/types";
import { deleteContributor } from "../db/queries";
import { deleteRateLimit } from "../middleware/rate-limit";

const contributor = new Hono<App>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

contributor.delete("/:contributorId", deleteRateLimit, async (c) => {
  const contributorId = c.req.param("contributorId");
  if (!UUID_RE.test(contributorId)) {
    return c.json(
      { error: "validation_error", message: "contributorId must be a valid UUID" },
      400,
    );
  }
  const deleted = await deleteContributor(c.env.DB, contributorId);
  return c.json({ deleted });
});

export { contributor };
```

- [ ] **Step 3: Wire into `src/index.ts`**

Add:
```typescript
import { contributor } from "./routes/contributor";

app.route("/api/contributor", contributor);
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run test/contributor.test.ts`
Expected: all pass.

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/michaelryan/Programming/JavaScript/chook-check-api && npx vitest run`
Expected: all tests pass across all files.

- [ ] **Step 6: Commit**

```bash
cd /Users/michaelryan/Programming/JavaScript/chook-check-api
git add src/routes/contributor.ts src/index.ts test/contributor.test.ts
git commit -m "feat: add contributor deletion endpoint"
```

---

## Post-implementation checklist

After all 9 tasks are complete:

1. Run full test suite: `npx vitest run` — all tests pass
2. Run TypeScript check: `npx tsc --noEmit` — no errors
3. Start local dev: `npx wrangler dev --local` — Worker starts
4. Manual test with curl:
   - `POST /api/observations` with valid body → 201
   - `GET /api/products/:id/stats` → 200 (or 404)
   - `GET /api/products/search?q=test` → 200
   - `GET /api/trends` → 200
   - `DELETE /api/contributor/:id` → 200
   - `GET /health` → 200
5. Verify CORS headers present on responses
6. Verify rate limiting returns 429 after limit exceeded
