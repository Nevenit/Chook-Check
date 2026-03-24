# Phase 7: Community Backend — Design Spec

## Goal

Build a public API for submitting and querying community price observations. Cloudflare Worker + D1, deployed as a separate repository. Essential anti-gaming protections (rate limiting, crowd quorum, input validation) — trust scoring, attestation, and outlier detection deferred to a later iteration.

## Architecture

Separate repo (`chook-check-api`). Hono HTTP framework on Cloudflare Workers. D1 (SQLite at edge) for storage. No IP logging in observations.

### File Structure

```
src/
  index.ts              — Hono app, route registration, D1 binding
  routes/
    observations.ts     — POST /api/observations
    products.ts         — GET /api/products/:productId/stats, GET /api/products/search
    trends.ts           — GET /api/trends
    contributor.ts      — DELETE /api/contributor/:contributorId
  middleware/
    rate-limit.ts       — Sliding window rate limiter using D1
    validate.ts         — Zod schema validation middleware
  db/
    schema.sql          — D1 table definitions and indexes
    queries.ts          — Parameterized query functions
    migrations/         — D1 migration files
  lib/
    types.ts            — Shared TypeScript types
    aggregation.ts      — Median, promo frequency, trend calculations
wrangler.toml           — D1 binding, environment config
test/
  observations.test.ts  — Submit + dedup tests
  products.test.ts      — Stats + search tests
  trends.test.ts        — Trend calculation tests
  contributor.test.ts   — Deletion tests
  rate-limit.test.ts    — Rate limiting tests
  validation.test.ts    — Input validation tests
vitest.config.ts
package.json
tsconfig.json
```

## Data Layer

### `observations` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto-increment |
| product_id | TEXT NOT NULL | e.g. `woolworths:123456` |
| product_name | TEXT NOT NULL | |
| brand | TEXT | nullable |
| category | TEXT | nullable |
| gtin | TEXT | nullable, barcode — useful for cross-chain matching |
| store_chain | TEXT NOT NULL | `woolworths` or `coles` |
| price_cents | INTEGER NOT NULL | |
| was_price_cents | INTEGER | nullable, stored for future use (not surfaced in current endpoints) |
| unit_price_cents | INTEGER | nullable |
| unit_measure | TEXT | nullable |
| promo_type | TEXT | nullable |
| is_personalised | INTEGER NOT NULL | 0 or 1 (JSON uses `boolean`, converted at query layer) |
| contributor_id | TEXT NOT NULL | anonymous UUID or hashed email |
| browser | TEXT | nullable, only if user opted in |
| state | TEXT | nullable, e.g. "VIC" |
| city | TEXT | nullable |
| store_name | TEXT | nullable, free-text store name e.g. "Coles Fitzroy" |
| observed_at | TEXT NOT NULL | ISO 8601 |
| submitted_at | TEXT NOT NULL | server-generated ISO 8601 timestamp |

**Why `INTEGER PK` not ULID:** A single D1 database with auto-increment is simpler and sufficient. No distributed ID generation needed. If we later need idempotent retries or external observation references, we can add a ULID column via migration.

**Why `store_name` not `store_id`:** The extension sends a free-text store name scraped from the page. There is no structured store ID available from Woolworths/Coles. Aggregation by store uses string matching, which is imperfect but reflects the data we actually have.

**`pageUrl` is intentionally omitted** from the API schema. The extension captures it locally but sending it to the server would be a privacy leak.

**Future schema additions:** `trust_score REAL` and `attestation TEXT` columns will be added via D1 migrations when trust scoring and attestation are implemented.

Indexes: `product_id`, `contributor_id`, `store_chain`, `observed_at`, composite `[product_id, observed_at]`.

No separate products table. Product metadata is denormalized onto observations — product info is derived from the most recent observation when querying. This keeps the write path simple (just insert) and is appropriate for the expected data volume.

### `rate_limits` table

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT NOT NULL | contributor ID or IP |
| endpoint | TEXT NOT NULL | e.g. "POST /observations" |
| count | INTEGER NOT NULL | requests in current window |
| window_start | TEXT NOT NULL | ISO 8601 |

Primary key: `PRIMARY KEY (key, endpoint)`.

## API Endpoints

### HTTP Status Codes

All endpoints follow these conventions:
- `200` — successful GET or DELETE
- `201` — successful POST (observations accepted)
- `400` — invalid input (validation failure)
- `404` — resource not found (unknown product ID returns 404, not empty 200)
- `429` — rate limit exceeded
- `500` — unexpected server error

### Error Response Format

All error responses use a consistent envelope:
```json
{
  "error": "validation_error",
  "message": "priceCents must be a positive integer",
  "details": ["priceCents: Expected number, received string"]
}
```

`error` is a machine-readable code: `validation_error`, `rate_limited`, `not_found`, `server_error`.
`message` is a human-readable summary.
`details` is an optional array of specific issues (used for validation errors).

### POST /api/observations

Submit a batch of price observations.

**Request body:**
```json
{
  "contributorId": "uuid-string",
  "observations": [
    {
      "productId": "woolworths:123456",
      "productName": "Vegemite 380g",
      "brand": "Vegemite",
      "category": "Spreads",
      "gtin": "9300650000001",
      "storeChain": "woolworths",
      "priceCents": 750,
      "wasPriceCents": 900,
      "unitPriceCents": 1974,
      "unitMeasure": "per 100g",
      "promoType": "member_price",
      "isPersonalised": false,
      "observedAt": "2026-03-24T10:30:00Z"
    }
  ],
  "context": {
    "browser": "Chrome",
    "state": "VIC",
    "city": "Melbourne",
    "store": "Woolworths Fitzroy"
  }
}
```

- `context` is optional. Fields within it are optional. Context applies to the whole batch.
- Array: 1–50 observations per request.
- Deduplication: same contributor + product_id + same UTC calendar day + same price = skip. This is similar to but not identical to the local dedup in `lib/store.ts` (which uses local timezone and updates the existing record rather than skipping).
- **Response (201):** `{ accepted: number, duplicates: number, rejected: number, reasons?: string[] }`
  - `accepted`: observations successfully inserted.
  - `duplicates`: observations skipped due to dedup.
  - `rejected`: observations that failed per-item validation (e.g., price out of range). `reasons` lists the specific issues when `rejected > 0`.
- Rate limit: 60 requests/hour per contributor ID.

### GET /api/products/:productId/stats

Community stats for a single product.

**Query params:** `?days=30&chain=woolworths` (both optional; defaults: 30 days, all chains; max `days`: 90).

**Response (200):**
```json
{
  "productId": "woolworths:123456",
  "productName": "Vegemite 380g",
  "brand": "Vegemite",
  "storeChain": "woolworths",
  "quorum": true,
  "currentMedianCents": 750,
  "minCents": 700,
  "maxCents": 900,
  "observationCount": 47,
  "contributorCount": 5,
  "priceHistory": [
    { "date": "2026-03-20", "medianCents": 750, "minCents": 700, "maxCents": 800 }
  ],
  "promoFrequency": {
    "member_price": 0.4,
    "half_price": 0.1,
    "none": 0.5
  }
}
```

- **Crowd quorum:** If fewer than 3 distinct contributors, `quorum` is `false` and all price fields are `null`. The extension uses `quorum` to decide whether to display community data.
- `priceHistory` is bucketed by day within the requested period.
- `promoFrequency` is the proportion of observations with each promo type.
- Returns `404` if no observations exist for the product ID at all.

### GET /api/products/search

Search products by name or brand.

**Query params:** `?q=vegemite&chain=woolworths&limit=20`
- `q` required, min 2 characters.
- `chain` optional, filters by store chain.
- `limit` optional, default 20, max 50.

**Response (200):**
```json
{
  "results": [
    {
      "productId": "woolworths:123456",
      "productName": "Vegemite 380g",
      "brand": "Vegemite",
      "storeChain": "woolworths",
      "latestMedianCents": 750,
      "observationCount": 47
    }
  ]
}
```

- Searches `product_name` and `brand` using `LIKE '%term%'` (case-insensitive via D1's `COLLATE NOCASE`). Leading-wildcard LIKE cannot use indexes — acceptable at current data volumes. FTS5 can be added via migration if search performance becomes a concern.
- Results from the most recent 30 days, ordered by observation count descending.
- Only includes products meeting crowd quorum. Returns empty `results` array if no products meet quorum.

### GET /api/trends

Biggest price changes over a period.

**Query params:** `?period=7d&chain=coles&category=dairy&limit=20`
- `period` optional, default `7d`. Supported: `1d`, `7d`, `14d`, `30d`.
- `chain` optional.
- `category` optional.
- `limit` optional, default 20, max 50.

**Response (200):**
```json
{
  "trends": [
    {
      "productId": "coles:789",
      "productName": "Full Cream Milk 2L",
      "brand": "Coles",
      "storeChain": "coles",
      "changePercent": 12.5,
      "direction": "up",
      "currentMedianCents": 450,
      "previousMedianCents": 400
    }
  ]
}
```

- Compares median price in the current period vs the previous period of equal length.
- Only includes products meeting crowd quorum in both periods. Returns empty `trends` array if no products qualify.
- Ordered by absolute `changePercent` descending.
- This query computes medians over two time windows for every qualifying product. At small data volumes this is fine as a direct query. If performance degrades, pre-aggregated daily summary tables can be added later.

### DELETE /api/contributor/:contributorId

Delete all data for a contributor (supports the "Request server deletion" button in settings).

**Response (200):** `{ deleted: number }`

- Permanently removes all observations with this contributor ID.
- Returns `{ deleted: 0 }` if no observations found (not a 404 — the contributor may have already been deleted).
- Rate limit: 5 requests/hour per contributor ID.

## Rate Limiting

Sliding window approach using the `rate_limits` D1 table. Implemented as Hono middleware that runs before each handler.

**Logic:**
1. Derive key: contributor ID (from request body for POST, from URL param for DELETE) or `CF-Connecting-IP` header (for GET endpoints).
2. Read current count and window_start for the key + endpoint combination.
3. If window has expired (> 1 hour old), reset count to 1 and update window_start.
4. If count exceeds the limit, return `429 Too Many Requests` with `Retry-After` header (seconds until window resets).
5. Otherwise, increment count and proceed to handler.

**CORS preflight (`OPTIONS`) requests bypass rate limiting entirely.**

**Limits:**
| Endpoint | Key | Limit |
|----------|-----|-------|
| POST /api/observations | contributor ID | 60/hour |
| GET /api/products/* | IP | 120/hour |
| GET /api/trends | IP | 120/hour |
| DELETE /api/contributor/* | contributor ID | 5/hour |

IP is read from `CF-Connecting-IP` (provided by Cloudflare). IP is used transiently for rate limiting only — never stored in the observations table.

## Input Validation

Zod schemas validate all incoming requests. Invalid requests get a `400` with the standard error envelope.

**Key validations:**
- `price_cents`: positive integer, < 1,000,000 ($10,000 sanity cap)
- `store_chain`: must be `"woolworths"` or `"coles"`
- `observed_at`: valid ISO 8601, within the last 14 days (allows for batch submissions with retry after offline periods)
- `contributor_id`: valid UUID format
- String field max lengths: product_name 200, brand 100, category 100, store_name 200, gtin 20
- `observations` array: 1–50 items
- Search `q` param: 2–100 characters
- `days` param: 1–90

## Aggregation Helpers

Utility functions in `lib/aggregation.ts`:

- **`median(values: number[]): number`** — sorted middle value (or average of two middle values for even counts). Used everywhere instead of mean for outlier resistance.
- **`promoFrequency(observations): Record<string, number>`** — proportion of observations with each promo_type value.
- **`trendChange(currentMedian, previousMedian): { changePercent, direction }`** — percentage change and direction.

These are pure functions, independently testable.

## Decisions

- **`INTEGER PK` for observations.** Single D1 instance, no distributed ID generation needed. Simpler than ULIDs. Can add a ULID column later if needed for external references.
- **No separate products table.** Product metadata denormalized onto observations. Appropriate for expected data volume. Product info derived from most recent observation.
- **No IP logging.** Privacy-first: IP only used transiently for GET rate limiting, never persisted to observations.
- **No trust scoring / attestation / outlier detection.** Deferred to a later iteration. Can be applied retroactively to existing data.
- **Crowd quorum = 3 contributors.** Stats hidden below this threshold. Prevents single-contributor manipulation.
- **Separate repo.** Different license from the extension. Clean deployment boundary.
- **Hono framework.** Lightweight, built for Workers, good middleware support.
- **Zod for validation.** Type-safe schema validation, good error messages.
- **UTC for server-side dedup.** "Same calendar day" uses UTC boundaries, not Australian local time. Simple, deterministic, avoids timezone inference.
- **14-day submission window.** Accepts observations up to 14 days old to accommodate offline periods and batch retry in Phase 8.

## Testing Strategy

Integration tests using Cloudflare's `unstable_dev` API (Miniflare) — spins up a local worker with an in-memory D1 instance. Vitest as the test runner.

**Test coverage:**
- **Observations:** submit single + batch, deduplication, per-item rejection with reasons, invalid input rejected
- **Product stats:** correct median/min/max, price history bucketing, promo frequency, quorum enforcement (< 3 contributors returns null), 404 for unknown product
- **Search:** name matching, brand matching, chain filtering, limit, empty results when no quorum
- **Trends:** correct period comparison, direction detection, quorum in both periods, empty when no products qualify
- **Contributor deletion:** all observations removed, correct count returned, `{ deleted: 0 }` for unknown contributor
- **Rate limiting:** requests within limit succeed, over-limit returns 429, window resets after expiry, OPTIONS bypasses rate limit
- **Input validation:** bad prices, missing fields, future dates, dates older than 14 days, oversized strings, invalid UUIDs
- **Error format:** all error responses match the standard envelope

## CORS

The Worker needs to allow requests from the browser extension. Hono's CORS middleware configured with:
- `origin: "*"` — extensions make requests from `chrome-extension://` and `moz-extension://` origins, which vary per install. Wildcard is the practical choice.
- Allowed methods: GET, POST, DELETE, OPTIONS.
- Allowed headers: Content-Type.

Future addition: `Authorization` or `X-Attestation` headers when attestation is implemented.
