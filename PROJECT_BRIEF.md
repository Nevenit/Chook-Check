# Chook Check — Project Brief & Build Plan

> **Browser extension for tracking Australian supermarket prices, detecting personalised pricing, and empowering consumers through community data.**
>
> *"Just doing a quick chook check before heading to Woolies."*

## Table of Contents

- [Vision](#vision)
- [Prior Art](#prior-art)
- [Privacy Model](#privacy-model)
- [Data Model](#data-model)
- [Architecture](#architecture)
- [Scraping Strategy](#scraping-strategy)
- [Cross-Chain Comparison](#cross-chain-comparison)
- [Data Integrity & Anti-Gaming](#data-integrity--anti-gaming)
- [UI/UX Overview](#ui-ux-overview)
- [Backend Design](#backend-design)
- [Build Phases](#build-phases)
- [Claude Code Session Prompts](#claude-code-session-prompts)
- [Technical Decisions](#technical-decisions)
- [Open Questions](#open-questions)

---

## Vision

Australian supermarkets (Woolworths and Coles) increasingly use personalised pricing, loyalty-tier promotions, and dynamic offers. The same product can cost different amounts depending on who's looking, where they are, and what account they're logged into.

Chook Check makes this visible. It passively captures prices as users browse, stores history locally, and — with opt-in community sharing — lets people compare what they're paying against what everyone else pays.

**Core goals:**

1. Track price history per product over time for the individual user.
2. Detect and surface personalised pricing — are you paying more than others?
3. Compare prices across Woolworths and Coles, especially home brand equivalents.
4. Build a community dataset that benefits all Australian grocery shoppers.
5. Be radically transparent about privacy — collect nothing by default, let users choose exactly what to share.
6. Open source everything — extension, backend, analysis methodology.

---

## Prior Art

Several extensions have tackled Australian supermarket price tracking. Understanding what exists (and what's missing) is important context for this project.

### Coles Trend / Woolworths Trend (by Adam Williamson / "Price Check Guy")

The closest existing tool. Launched mid-2024, went viral on TikTok, and reached ~10,000 Chrome users. Shows a bar chart of the last 10 price changes directly on Coles and Woolworths product pages. Well-received by users and proved strong demand for this kind of tool.

**However:** The Chrome version of Coles Trend was removed from the Chrome Web Store in January 2025, and the Coles extension was delisted in September 2025. As of late 2025, users on Whirlpool reported the extensions hadn't been loading properly for months. The project is closed-source (no public GitHub repo despite community requests), run by a single developer, and backed by a company (DataHoldings) with a minimal web presence. The Firefox versions may still be listed but the project appears largely unmaintained.

### HotAuDeals Helper

A Chrome extension providing historical price data for Coles, Woolworths, and Chemist Warehouse. Had issues with product ID matching across states (was only fetching NSW prices). Also closed-source.

### What none of them do

Every existing extension does fundamentally the same thing: show a single price history sourced from the store's own data or a central scrape. None of them tackle:

- **Personalised pricing detection** — comparing what *you* see vs what *others* see for the same product
- **Community-contributed data** — crowd-sourced prices from real logged-in users rather than a single scrape source
- **Cross-chain comparison** — is the Coles home brand milk cheaper than the Woolworths equivalent?
- **Privacy-first, open-source model** — all existing options are closed-source with unclear data practices
- **Sustainability** — single-developer, closed-source projects are fragile (as Coles Trend's delisting proves)

### Our opportunity

There's proven demand (10,000+ users, TikTok virality) but the existing solutions have failed on sustainability and trust. Chook Check builds on the idea that Coles Trend popularised while solving its weaknesses: open source, community-driven, privacy-first, and designed to survive contributor turnover.

---

## Privacy Model

### Two Modes

**Default — Read-only community access**
On install, the extension stores all price observations locally in the browser (IndexedDB). Users can see their own history, trends, and alerts. They can also read community aggregate data (median prices, trend direction, personalisation signals) via the API. Nothing is sent to the server. No account needed.

**Opt-in — Contribute to the community**
Users are encouraged to contribute their price observations to the shared dataset. When they opt in, they see a clear settings panel where they choose exactly what context to share alongside the core price data. They can change these settings or stop contributing at any time.

### Contribution Settings

When a user opts in to contribute, the following is always shared (the minimum useful observation):

| Field | Example | Why |
|-------|---------|-----|
| Product ID | `woolworths:123456` | Identifies the product |
| Product name | `Vegemite 380g` | Human-readable label |
| Brand | `Vegemite` | Brand-level analysis |
| Category | `Spreads` | Category-level analysis |
| Store chain | `woolworths` | Which supermarket |
| Price (cents) | `650` | The observed price |
| Unit price (cents) | `1710` | Per-kg/per-litre price |
| Unit measure | `per kg` | Unit context |
| Promo type | `member_price` | What kind of promotion, if any |
| Is personalised | `true` | Was this in a "for you" section |
| Timestamp | `2026-03-17T10:30:00Z` | When it was observed |
| Contributor ID | `a1b2c3d4-...` | Random UUID per install |

**Optional context toggles (each independent, user chooses):**

| Toggle | Default | What it shares | Why it's useful | Privacy note |
|--------|---------|---------------|-----------------|--------------|
| Share my browser | **On** | `firefox`, `chrome`, etc. | Detect browser-based pricing | Near-zero privacy cost |
| Share my state | Off | `VIC`, `WA`, etc. | State-level price differences | Low specificity |
| Share my city/region | Off | `Melbourne`, `Perth`, etc. | Regional price patterns | Medium specificity |
| Share my specific store | Off | Store ID / name | Store-level comparison | People nearby could infer where you shop |
| Link my account | Off | Hashed supermarket login | Cross-session personalisation detection | See "Account Linking" below |

### Account Linking

When "Link my account" is enabled, the extension takes the user's supermarket login email (visible on the page when logged in), hashes it using Argon2id with a fixed project-wide salt, and uses the result as the contributor ID instead of the random UUID.

**What this enables:** Grouping observations from the same supermarket account across different browser installs/devices. If the same account hash sees different prices in different contexts, that's strong evidence of contextual personalisation.

**What we tell the user:** "This lets us detect if you're being shown different prices in different situations. We can't reverse the hash to get your email, but someone who already knows your email could verify it matches your contributor ID."

**Two contributor ID modes:**
- Anonymous (default): random UUIDv4 generated on install. No cross-install correlation.
- Account-linked: Argon2id hash of supermarket email. Consistent across installs.

### Data the Extension Never Collects

- Real name, email address, or any login credentials
- Loyalty card numbers
- IP address (stripped at the edge before storage)
- Browsing history outside Woolworths/Coles product pages
- Cart contents, order history, or purchase data
- Any data from non-Woolworths/Coles websites

### User Controls

- View all locally stored data at any time
- Export local data as JSON/CSV
- One-click stop contributing
- One-click delete all local data
- One-click request server-side deletion of all contributed data (by contributor ID)
- Change optional toggles at any time (changes apply to future observations only)
- Consent audit log visible to the user (when they opted in, what toggles were on/off, when they changed)

---

## Data Model

### Local Storage (IndexedDB via Dexie.js)

```typescript
interface PriceObservation {
  id: number;                    // auto-increment
  productId: string;             // e.g. "woolworths:123456" or "coles:789012"
  productName: string;
  brand: string;
  category: string;
  storeChain: "woolworths" | "coles";
  priceCents: number;            // always store as integer cents
  wasPriceCents: number | null;  // crossed-out "was" price if on special
  unitPriceCents: number | null; // per-kg / per-litre in cents
  unitMeasure: string | null;    // "per kg", "per 100ml", "each", etc.
  promoType: string | null;      // "member_price", "half_price", "special", "everyday_low", etc.
  isPersonalised: boolean;       // appeared in personalised offers section
  pageUrl: string;               // the product page URL
  observedAt: string;            // ISO 8601 timestamp
  contributed: boolean;          // has this been sent to the community API
}

interface UserSettings {
  contributionEnabled: boolean;
  contributorId: string;         // UUIDv4 or account hash
  contributorIdMode: "anonymous" | "account_linked";

  // Optional sharing toggles
  shareBrowser: boolean;         // default: true
  shareState: boolean;           // default: false
  shareCity: boolean;            // default: false
  shareStore: boolean;           // default: false
  linkAccount: boolean;          // default: false

  // Consent audit trail
  consentLog: ConsentEvent[];
}

interface ConsentEvent {
  action: "opted_in" | "opted_out" | "toggle_changed";
  detail: string;                // e.g. "shareState: false → true"
  timestamp: string;
}
```

### Server-Side Schema (Community API)

```sql
CREATE TABLE observations (
  id              TEXT PRIMARY KEY,     -- server-generated ULID
  product_id      TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  brand           TEXT,
  category        TEXT,
  store_chain     TEXT NOT NULL,        -- "woolworths" or "coles"
  price_cents     INTEGER NOT NULL,
  was_price_cents INTEGER,
  unit_price_cents INTEGER,
  unit_measure    TEXT,
  promo_type      TEXT,
  is_personalised BOOLEAN NOT NULL DEFAULT FALSE,
  observed_at     TEXT NOT NULL,
  contributor_id  TEXT NOT NULL,        -- UUID or account hash

  -- Optional context (null if user hasn't toggled on)
  browser         TEXT,
  state           TEXT,
  city            TEXT,
  store_id        TEXT,

  -- Integrity metadata
  trust_score     REAL DEFAULT 1.0,
  attestation     TEXT,                 -- extension-signed payload
  received_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_obs_product ON observations(product_id, observed_at);
CREATE INDEX idx_obs_contributor ON observations(contributor_id);
CREATE INDEX idx_obs_chain_product ON observations(store_chain, product_id);
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Browser Extension                    │
│                                                   │
│  Content Scripts                                  │
│  ├── woolworths-scraper.ts                        │
│  │   └── Parses product page → PriceObservation   │
│  └── coles-scraper.ts                             │
│      └── Parses product page → PriceObservation   │
│                                                   │
│  Background Service Worker                        │
│  ├── store.ts          (IndexedDB via Dexie.js)   │
│  ├── analyzer.ts       (local price analysis)     │
│  ├── contributor.ts    (batches & sends to API)    │
│  ├── community.ts      (fetches community data)   │
│  └── attestation.ts    (signs observations)        │
│                                                   │
│  UI                                               │
│  ├── popup/            (quick summary on click)    │
│  ├── dashboard/        (full history & charts)     │
│  ├── options/          (privacy & contribution)    │
│  └── overlay/          (injected on product page)  │
│                                                   │
│  Manifest V3 (cross-browser: Chrome + Firefox)    │
└──────────────────────┬───────────────────────────┘
                       │
          Reads community data (always)
          Writes observations (opt-in only)
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│              Community API                        │
│              (Cloudflare Workers + D1)             │
│                                                   │
│  POST /api/observations        (batch submit)     │
│  GET  /api/products/:id/stats  (community agg.)   │
│  GET  /api/products/search     (search products)  │
│  GET  /api/trends              (price movements)  │
│  DELETE /api/contributor/:id   (delete my data)    │
│                                                   │
│  Middleware:                                       │
│  ├── IP stripping (before any logging/storage)     │
│  ├── Rate limiting (per contributor ID)            │
│  ├── Attestation verification                      │
│  ├── Outlier detection                             │
│  └── Input validation                              │
│                                                   │
│  Open source — same repo as extension              │
└──────────────────────────────────────────────────┘
```

### Extension Permissions (Manifest V3)

```json
{
  "permissions": ["storage", "alarms"],
  "host_permissions": [
    "https://www.woolworths.com.au/*",
    "https://www.coles.com.au/*"
  ]
}
```

Minimal permissions only. No `<all_urls>`, no `tabs`, no `webRequest`, no `cookies`.

---

## Scraping Strategy

Both Woolworths and Coles change their frontend regularly. Scrapers must be resilient.

### Layered Extraction (in priority order)

1. **Structured data (JSON-LD / `<script type="application/ld+json">`)** — Most reliable. Both sites embed product schema.org markup. Extract `name`, `brand`, `sku`, `offers.price`, `offers.priceCurrency`.

2. **Data attributes / JS state** — Both sites are SPAs (React/Next.js). Look for `__NEXT_DATA__`, `window.__INITIAL_STATE__`, or similar hydration objects that contain structured product data.

3. **DOM selectors** — Fallback. Target specific CSS selectors for price elements, product titles, unit prices. These break most often.

### Selector Configuration

Store selectors as a JSON configuration object, not hardcoded strings. This allows:
- Updating selectors without a full extension release (future: fetch config from a CDN)
- Clear documentation of what's being targeted
- Easy A/B testing of selector strategies

```typescript
interface ScraperConfig {
  chain: "woolworths" | "coles";
  version: string;
  productPage: {
    urlPattern: RegExp;
    selectors: {
      jsonLd: string;
      jsState: string;
      productName: string[];      // fallback chain
      price: string[];            // fallback chain
      wasPrice: string[];
      unitPrice: string[];
      unitMeasure: string[];
      promoLabel: string[];
      personalisedSection: string[];
      productId: string[];
      brand: string[];
      category: string[];
    };
  };
}
```

### Scraper Health Monitoring

- If a scraper fails to extract data from a page it was expected to work on, log a warning locally.
- Track success/failure rate in local storage.
- Surface a notice in the popup if scraper success rate drops below a threshold (e.g., "Woolworths scraper may be outdated — check for extension updates").

---

## Cross-Chain Comparison

One of the most useful things Chook Check can do is answer "is this cheaper at Coles or Woolies?" This is straightforward for branded products (same Vegemite 380g at both stores) but harder for home brands (Coles Full Cream Milk 2L vs Woolworths Full Cream Milk 2L).

### The Matching Problem

The same product at Woolworths and Coles has different internal IDs. Branded products could theoretically be matched via barcode/EAN, but these aren't always exposed on the website. Home brand products have no shared identifier at all.

### Approach: Start with Home Brands, Expand from There

Home brand matching is actually more tractable than it sounds because the products are designed to be direct equivalents. "Coles Full Cream Milk 2L" and "Woolworths Full Cream Milk 2L" are clearly the same thing. The matching strategy:

**1. Category + size matching (automated)**
For common staples (milk, bread, eggs, butter, cheese, pasta, rice, canned goods), match by product category and package size. This covers a large number of everyday items with high confidence. Use unit price as an additional signal — if two home brand products are in the same category with the same unit measure, they're almost certainly comparable.

**2. Community-contributed mappings**
Let contributors flag product matches: "this Coles product is equivalent to this Woolworths product." Require multiple contributors to confirm a match before it's accepted (similar to the crowd quorum approach used for price data). This scales the matching to long-tail products the automated approach misses.

**3. Fuzzy name matching (supplementary)**
Use string similarity on product names as a suggestion engine — surface potential matches for contributors to confirm rather than auto-matching. Too many false positives to use unsupervised, but good for bootstrapping the mapping table.

### Product Mapping Schema

```sql
CREATE TABLE product_mappings (
  id              TEXT PRIMARY KEY,
  woolworths_id   TEXT NOT NULL,
  coles_id        TEXT NOT NULL,
  match_type      TEXT NOT NULL,       -- "auto_category", "community", "fuzzy_suggested"
  confidence      REAL DEFAULT 0.0,    -- 0.0 to 1.0
  confirmations   INTEGER DEFAULT 0,   -- number of community confirmations
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX idx_mapping_woolworths ON product_mappings(woolworths_id);
CREATE INDEX idx_mapping_coles ON product_mappings(coles_id);
```

### What This Enables

- "Coles home brand milk is $2.60/L this week, Woolworths is $2.45/L" on the product page overlay
- Dashboard view: side-by-side home brand comparison for common categories
- Trend analysis: which chain's home brand is cheaper over time for staple categories
- Alerts: "The product you're looking at is $X cheaper at the other store right now"

### Scope

Start with the top ~50 most common home brand staples (milk, bread, eggs, butter, cheese, etc.) with automated category+size matching. Expand via community mappings. Branded product matching via barcode/EAN is a future enhancement if the data becomes available.

---

## Data Integrity & Anti-Gaming

### Problem

Since anyone can see community data, there's an incentive for bad actors (or the supermarkets themselves) to pollute the dataset — either to discredit the tool or to mask real pricing patterns.

### Defence Layers

**1. Statistical outlier filtering**
- Use median (not mean) for all community aggregates — naturally resistant to outliers.
- Observations where the price deviates more than X standard deviations from the rolling median for that product are flagged and excluded from aggregates.
- Flagged observations are not deleted — they're kept but marked, so patterns of manipulation can be studied.

**2. Rate limiting per contributor**
- Max N observations per hour per contributor ID.
- Max M distinct products per minute (prevents rapid-fire scripted submissions).
- Sustained anomalous patterns → automatic trust score reduction.

**3. Trust scoring**
- Each contributor starts with a trust score of 1.0.
- Score degrades if their submissions are frequently flagged as outliers.
- Score improves if their submissions consistently align with the consensus.
- Low-trust contributors' data is downweighted (not excluded) in aggregates.

**4. Extension attestation**
- The extension signs each observation batch with a key derived from the install.
- The server verifies the signature. Observations without valid attestation are accepted but given lower trust.
- This is a speed bump, not a wall — a determined attacker can extract the signing logic from the open-source code. But it filters out casual API-level spam.

**5. Crowd quorum**
- Community stats for a product are only shown once there are observations from >= N distinct contributors (e.g., N=3).
- Prevents a single contributor from defining the "community price" for a product.

**6. Cross-validation**
- If both Woolworths and Coles sell the same branded product, prices can be cross-referenced for sanity.
- Product ID ↔ product name mappings can be validated across contributors.

**7. Transparency**
- Publish the aggregation methodology and outlier filtering rules in the repo.
- The dashboard could show "based on X observations from Y contributors" for each data point.

---

## UI/UX Overview

### Product Page Overlay

A small, unobtrusive widget injected into the product page. Positioned near the price element. Shows:
- Price history sparkline (last 30/60/90 days)
- Current price vs your historical average for this product
- Community comparison (if community data available): "You: $6.50 · Community median: $5.80"
- Promo detection: "This price has been the 'special' price for 45 of the last 60 days"
- Expand for more detail

Design should feel native to the site — not like an ad or a popup. Subtle border, muted colours, small footprint by default.

### Popup (extension icon click)

Quick summary view:
- "X products tracked · Y prices recorded"
- Recent observations (last 5-10)
- Any alerts (significant price changes, possible personalised pricing detected)
- Quick link to dashboard
- Quick link to settings
- Contribution status: "Contributing anonymously" / "Not contributing — opt in?"

### Dashboard (full extension page)

Accessed via popup link or `chrome-extension://` URL. Full-featured:
- Searchable, filterable, sortable price history table
- Per-product price charts (line chart over time, your price vs community)
- "Biggest price changes this week" — products with largest recent movements
- "Possible personalised pricing" — products where your price diverges from community
- Category-level analysis (e.g., "Dairy up 8% this month")
- Export: JSON, CSV
- Data management: view storage usage, delete individual records or all data

### Options / Settings Page

- Contribution toggle (on/off) with encouragement messaging
- Optional context toggles with plain-English explanations
- "What data do we store?" inspector — shows actual database contents
- "What have we shared?" log — every observation sent, with timestamp
- Consent audit log
- Delete all local data button
- Request server-side deletion button
- Extension health: scraper success rates, last successful scrape per site

---

## Backend Design

### Technology

- **Cloudflare Workers** — serverless, edge-deployed, Australian PoPs, generous free tier.
- **Cloudflare D1** — SQLite at the edge. Simple, cheap, sufficient for this use case.
- **No IP logging** — the Worker strips client IP before any storage or logging operation. This is enforced in code and documented.

### API Endpoints

```
POST   /api/observations
  Body: { observations: Observation[], attestation: string }
  Auth: contributor ID in payload (no API keys)
  Response: { accepted: number, rejected: number, reasons?: string[] }

GET    /api/products/:productId/stats
  Query: ?days=30&chain=woolworths
  Response: {
    productId, productName, chain,
    currentMedian, min, max,
    observationCount, contributorCount,
    priceHistory: [{ date, median, min, max }],
    promoFrequency: { member_price: 0.4, half_price: 0.1, none: 0.5 }
  }

GET    /api/products/search
  Query: ?q=vegemite&chain=woolworths
  Response: { results: [{ productId, productName, brand, latestMedian }] }

GET    /api/trends
  Query: ?period=7d&chain=coles&category=dairy
  Response: { trends: [{ productId, productName, changePercent, direction }] }

DELETE /api/contributor/:contributorId
  Response: { deleted: number }
  Note: Permanently removes all observations from this contributor.
```

### Rate Limits

- `POST /observations`: 60 requests/hour per contributor ID, max 50 observations per request.
- `GET` endpoints: 120 requests/hour per IP (for non-contributors browsing community data).
- `DELETE`: 5 requests/hour per contributor ID.

---

## Build Phases

### Phase 1: Project Scaffolding & Tooling
- WebExtension project with Manifest V3
- TypeScript, bundled with Vite (via CRXJS or similar)
- Cross-browser support (Chrome + Firefox) with webextension-polyfill
- ESLint, Prettier, testing framework (Vitest)
- Project structure, build scripts, dev reload
- CI pipeline (GitHub Actions): lint, test, build for both browsers

### Phase 2: Content Scripts (Scrapers)
- Woolworths product page scraper
- Coles product page scraper
- Layered extraction: JSON-LD → JS state → DOM selectors
- Selector configuration as JSON
- Scraper health tracking (success/failure rates)
- Test suite using saved HTML snapshots of real product pages

### Phase 3: Local Storage & Data Layer
- Dexie.js wrapper for IndexedDB
- PriceObservation and UserSettings schemas
- Background service worker: receives messages from content scripts, writes to DB
- Data retention policy (configurable, e.g., keep 1 year by default)
- Export functionality (JSON, CSV)

### Phase 4: Popup & Product Page Overlay
- Popup UI: summary stats, recent observations, alerts, quick links
- Product page overlay: price history sparkline, community comparison
- Build with Preact (small bundle, React-like DX) or Svelte
- Responsive, accessible, unobtrusive design
- Follows each site's visual language where possible

### Phase 5: Dashboard
- Full extension page with charts and tables
- Per-product price history charts (Chart.js or uPlot)
- Search, filter, sort
- Alert/insight panels: biggest changes, personalisation signals

### Phase 6: Privacy & Settings UI
- Options page with contribution toggle and context sharing toggles
- Plain-English explanations for each toggle
- Data inspector (view actual DB contents)
- Sharing log (what was sent, when)
- Consent audit trail
- Deletion controls (local + server-side request)

### Phase 7: Community Backend
- Cloudflare Worker + D1 setup
- API endpoints: submit observations, get product stats, search, trends, delete contributor
- IP stripping middleware
- Rate limiting per contributor ID
- Attestation verification
- Outlier detection and trust scoring

### Phase 8: Community Integration in Extension
- Wire extension to community API
- Fetch and display community data on product pages and dashboard
- Batch submission of observations (background, periodic)
- Retry logic for failed submissions
- Contribution status and stats in popup

### Phase 9: Polish & Release
- Chrome Web Store and Firefox Add-ons listings
- Privacy policy (clear, human-readable, hosted on GitHub Pages)
- README, contributing guide, code of conduct
- Screenshots, demo GIF
- Landing page (optional, GitHub Pages)

---

## Claude Code Session Prompts

Below are ready-to-use prompts for each Claude Code session. Each prompt assumes the previous phases are complete and the code is in the repo.

---

### Session 1: Project Scaffolding

```
I'm building a browser extension called "Chook Check" that tracks Australian
supermarket prices from Woolworths and Coles. Let's set up the project.

Create a WebExtension project with:
- Manifest V3 (cross-browser compatible, Chrome + Firefox)
- TypeScript
- Vite as the bundler (use CRXJS vite plugin or similar for extension support)
- webextension-polyfill for cross-browser API compatibility
- Vitest for testing
- ESLint + Prettier
- The following project structure:

src/
  background/        # service worker
  content/           # content scripts (per-site scrapers)
    woolworths/
    coles/
  ui/
    popup/           # browser action popup
    dashboard/       # full-page dashboard
    options/         # settings page
    overlay/         # injected product page widget
  lib/               # shared utilities, types, storage
  config/            # scraper selector configs

The manifest should request minimal permissions:
- "storage" and "alarms"
- Host permissions for woolworths.com.au and coles.com.au only

Set up build scripts for both Chrome and Firefox targets.
Add a basic "hello world" content script that logs to console on Woolworths
product pages to verify the pipeline works.

Reference the PROJECT_BRIEF.md in the repo root for full context.
```

---

### Session 2: Scrapers

```
We need content scripts that extract price data from Woolworths and Coles
product pages. Reference PROJECT_BRIEF.md for the full data model and scraping
strategy.

For each site (woolworths, coles), create a scraper that:

1. Detects if we're on a product page (URL pattern matching)
2. Extracts data using a layered approach (in priority order):
   a. JSON-LD structured data (<script type="application/ld+json">)
   b. JS hydration state (__NEXT_DATA__, window.__INITIAL_STATE__, etc.)
   c. DOM selectors (fallback)
3. Builds a PriceObservation object (see data model in PROJECT_BRIEF.md)
4. Sends the observation to the background service worker via message passing
5. Tracks extraction success/failure rate locally

The selector configs should be defined in src/config/ as JSON-like objects,
not hardcoded strings. Each selector field should be an array (fallback chain).

Create a test suite for each scraper using saved HTML snapshots. I'll provide
real product page HTML — for now, create the test scaffolding and a few mock
snapshots based on the expected DOM structure of each site.

Make the scrapers resilient: if a field can't be extracted, fill it as null
rather than failing entirely. Always try to get at least productId, productName,
and price.
```

---

### Session 3: Local Storage & Data Layer

```
Set up the local data layer for Chook Check. Reference PROJECT_BRIEF.md for
the full data model.

Implement:

1. Dexie.js wrapper (src/lib/store.ts) with tables for:
   - priceObservations (schema from PROJECT_BRIEF.md)
   - userSettings (contribution prefs, toggles, consent log)

2. Background service worker (src/background/index.ts) that:
   - Listens for messages from content scripts
   - Validates incoming PriceObservation data
   - Writes to IndexedDB
   - Deduplicates: if we already have an observation for the same product
     from the same day, update rather than insert

3. Data access layer (src/lib/data.ts) with query functions:
   - getProductHistory(productId, days?)
   - getRecentObservations(limit?)
   - getProductStats(productId) → { min, max, avg, current, priceChanges }
   - searchProducts(query)
   - getStorageStats() → { totalObservations, products, oldestEntry, sizeEstimate }

4. Export functions: exportAsJSON(), exportAsCSV()

5. Data management: deleteAll(), deleteProduct(productId), deleteOlderThan(days)

Write tests for the store and data access layer.
```

---

### Session 4: Popup & Product Page Overlay

```
Build the popup and product page overlay UI for Chook Check. Reference
PROJECT_BRIEF.md for the UI/UX section.

Use Preact for both (small bundle size). Shared components in src/ui/shared/.

Popup (src/ui/popup/):
- Shows: total products tracked, total observations, contribution status
- Recent observations list (last 10, grouped by day)
- Alert section if any significant price changes detected
- Links to: dashboard, settings
- If not contributing: gentle encouragement banner ("Help X Australians
  spot unfair pricing — start contributing")
- Clean, compact design. Should feel useful at a glance.

Product page overlay (src/ui/overlay/):
- Small widget injected near the price element on product pages
- Shows: mini sparkline of price history (last 30 days), current vs average,
  community comparison if available (placeholder for now)
- Collapsed by default to a small icon/badge, expands on click
- Must not break the host page layout or look like an ad
- Different injection points for Woolworths vs Coles (use config)

For now, use local data only. Community data integration comes later.
Wire up message passing to read from the background service worker / IndexedDB.
```

---

### Session 5: Dashboard

```
Build the full dashboard page for Chook Check. This is an extension page
(chrome-extension:// URL) accessed from the popup. Reference PROJECT_BRIEF.md.

Use Preact + Chart.js (or uPlot if bundle size is a concern).

Pages/views:
1. Overview: summary stats, "biggest price changes this week" cards,
   "possible personalised pricing" alerts
2. Product detail: search/select a product → line chart of price over time,
   price stats table, observation history, community comparison (placeholder)
3. All products: searchable, sortable, filterable table of all tracked products
   with latest price, trend indicator, observation count
4. Export: JSON and CSV download buttons for all data or filtered selection

Design notes:
- Clean, data-focused. Think simple analytics dashboard.
- Responsive layout
- Loading states and empty states for each view
- Include a "last updated" indicator

Wire everything to the data access layer from Session 3.
```

---

### Session 6: Privacy & Settings

```
Build the options/settings page for Chook Check. This is critical —
the privacy UX is a core differentiator. Reference PROJECT_BRIEF.md.

Use Preact, consistent styling with popup and dashboard.

Sections:

1. Contribution settings
   - Main toggle: contribute to community (on/off)
   - When turning on: show a clear, friendly explanation of what gets shared
     (core data fields), with a "learn more" expandable
   - Encouragement: "You're helping X Australians" (placeholder count for now)
   - Optional context toggles, each with one-line explanation:
     * Share my browser (default: on)
     * Share my state (default: off)
     * Share my city/region (default: off)
     * Share my specific store (default: off)
     * Link my account (default: off) — with extra explanation about hashing

2. Data inspector
   - "What's stored locally?" — live view of DB stats + ability to browse
     actual records
   - "What have we shared?" — log of every submitted observation batch
     (timestamp, count, what optional fields were included)

3. Consent audit log
   - Timeline of all consent changes the user has made

4. Data management
   - "Delete all local data" with confirmation
   - "Delete my server data" — sends DELETE request to API (placeholder for now)
   - "Export my data" — links to export functionality

5. Extension health
   - Scraper status: last successful scrape per site, success rate
   - Version info, link to GitHub

Every toggle change should be logged to the consent audit trail.
All explanatory text should be plain English, not legalese.
```

---

### Session 7: Community Backend

```
Build the community backend for Chook Check. Reference PROJECT_BRIEF.md for
the full API design, schema, and data integrity approach.

Technology: Cloudflare Workers + D1 (SQLite).

Implement:

1. D1 schema (from PROJECT_BRIEF.md) with migrations

2. API endpoints:
   - POST /api/observations — batch submit (max 50 per request)
   - GET /api/products/:productId/stats — community aggregates
   - GET /api/products/search — text search
   - GET /api/trends — biggest recent price movements
   - DELETE /api/contributor/:contributorId — delete all data for a contributor

3. Middleware:
   - IP stripping: remove client IP before any logging or storage
   - Rate limiting: per contributor ID for POST, per IP for GET (use CF headers)
   - Input validation: schema validation on all inputs
   - Attestation verification: check extension signature (placeholder logic)

4. Data integrity:
   - Outlier detection on incoming observations: flag if price deviates > 3
     stddev from rolling median for that product
   - Trust scoring: track per-contributor outlier rate, adjust trust score
   - Crowd quorum: product stats endpoint returns null if < 3 distinct
     contributors

5. Aggregation queries:
   - Median price (not mean) for all community stats
   - Price history bucketed by day
   - Promo frequency distribution

Set up wrangler.toml, dev environment, and basic integration tests.
The entire backend goes in a /backend directory in the same repo.
```

---

### Session 8: Community Integration

```
Wire the extension to the community backend. Reference PROJECT_BRIEF.md.

Implement:

1. Community data fetching (src/background/community.ts):
   - When user views a product page, fetch community stats for that product
   - Cache responses locally (TTL: 1 hour) to minimize API calls
   - Graceful degradation: if API is unreachable, show local data only
   - Prefetch stats for recently viewed products

2. Contribution pipeline (src/background/contributor.ts):
   - Batch pending observations and submit periodically (e.g., every 5 min)
   - Only submit if user has opted in
   - Include only the optional fields the user has toggled on
   - Retry with exponential backoff on failure
   - Mark observations as contributed in local DB after successful submit
   - Sign batches with install-derived key for attestation

3. UI integration:
   - Product page overlay: show community median, contributor count,
     "your price vs community" comparison
   - Dashboard: add community data to product charts (overlay community
     median line on personal price history)
   - Popup: show contribution stats ("You've contributed X observations")

4. Account linking:
   - If "link my account" is enabled, detect logged-in email on the
     supermarket site and compute Argon2id hash as contributor ID
   - Store the hash, never the email
   - If user disables "link my account", revert to random UUID and DO NOT
     keep the hash
```

---

### Session 9: Polish & Release

```
Final polish for Chook Check release. Reference PROJECT_BRIEF.md.

1. Chrome Web Store preparation:
   - Extension icons (16, 32, 48, 128px)
   - Screenshots (1280x800) of: product page overlay, popup, dashboard, settings
   - Store listing description (feature-focused, emphasise privacy)
   - Privacy policy page (generate as a clean HTML page for GitHub Pages)

2. Firefox Add-ons preparation:
   - Ensure manifest is Firefox-compatible
   - Any Firefox-specific adjustments
   - AMO listing metadata

3. Documentation:
   - README.md: what it does, how to install, how to contribute, privacy model
   - CONTRIBUTING.md: dev setup, architecture overview, how to add a new store
   - CODE_OF_CONDUCT.md
   - PRIVACY.md: detailed privacy policy in human-readable format
   - LICENSE: pick an appropriate open-source license (suggest AGPL-3.0 for
     the backend to ensure derivatives stay open, MIT for the extension)

4. CI/CD:
   - GitHub Actions: lint, test, build for Chrome + Firefox on every PR
   - Release workflow: tag → build → create GitHub release with .zip artifacts
   - Consider automated submission to stores (web-ext for Firefox)

5. Final QA:
   - Test full flow: install → browse → see prices → opt in → contribute →
     view community data → export → delete
   - Test with contribution disabled (read-only community mode)
   - Test privacy: verify nothing is sent when contribution is off
   - Test data deletion: local and server-side
```

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Manifest version | V3 | Required for Chrome, supported in Firefox |
| Language | TypeScript | Type safety for complex data model |
| Bundler | Vite + CRXJS | Fast builds, HMR in dev, good extension support |
| UI framework | Preact | React-like DX at 3KB, good for extensions |
| Local storage | IndexedDB via Dexie.js | Structured queries, good capacity, Dexie is ergonomic |
| Charts | Chart.js or uPlot | Lightweight, sufficient for price history |
| Backend | Cloudflare Workers + D1 | Edge-deployed, cheap, SQLite simplicity, AU PoPs |
| Hashing | Argon2id | Memory-hard, resistant to brute force |
| Prices | Integer cents | Avoids floating-point precision issues |
| Cross-browser | webextension-polyfill | Standard compatibility layer |
| Testing | Vitest | Fast, Vite-native, good DX |
| License | AGPL-3.0 (backend) + MIT (extension) | Backend stays open; extension is permissive |

---

## Open Questions

1. **Store detection**: How do we reliably detect which specific store the user is browsing? Woolworths and Coles may encode store selection in cookies, URL params, or local storage. Need to investigate.

2. **SPA navigation**: Both sites are SPAs. Content scripts need to detect client-side navigation (e.g., MutationObserver or History API interception) to capture prices on new product pages without full page reloads.

3. **Woolworths Everyday Rewards / Coles Flybuys tiers**: Different loyalty tiers may see different "member prices." Should we track the loyalty tier as an optional sharing field? Useful but potentially identifying.

4. **Rate of scraping**: Should the extension capture prices only on product pages the user visits? Or should it also capture prices from search result / category listing pages (where many products are visible at once)?

5. **Historical data seeding**: On launch, the community dataset will be empty. Consider seeding with publicly available price data (e.g., from price comparison sites or public APIs) if legally and ethically appropriate.

6. **Mobile companion**: If there's demand, a companion mobile app (or Kiwi Browser / Firefox Android support) could expand the contributor base. Out of scope for v1.

7. **Notifications**: Should the extension alert users to significant price changes on products they've tracked? E.g., "Vegemite dropped 30% at Woolworths." Useful but could be annoying — make it opt-in if implemented.

8. **Branded product matching across chains**: The Cross-Chain Comparison section covers home brand matching in detail. For branded products, barcode/EAN matching would be ideal but the data isn't always exposed on the website. Investigate whether structured data or API responses include EAN/GTIN fields. If not, fuzzy name matching on branded products (same brand + same size) may be sufficient for common items.
