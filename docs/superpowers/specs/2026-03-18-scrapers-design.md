# Scraper Design — Woolworths & Coles Content Scripts

## Overview

Content scripts that extract price data from Woolworths and Coles product pages as users browse. Each scraper produces a `PriceObservation` and sends it to the background service worker via message passing.

## Architecture

Shared extraction framework with site-specific configuration.

### Shared layer (`lib/`)

- **`lib/scraper.ts`** — Core extraction utilities:
  - `parseJsonLd(document): object | null` — finds `<script type="application/ld+json">` tags, returns the one with `@type: "Product"` (sites may have multiple JSON-LD blocks for BreadcrumbList, Organization, etc.)
  - `queryFallbackChain(document, selectors: string[]): Element | null` — tries each selector in order, returns first match
  - `extractTextFallbackChain(document, selectors: string[]): string | null` — same but returns trimmed text content
  - `parsePriceCents(text: string): number | null` — extracts price from text like "$3.50", "3.50", returns `350`
  - `buildObservation(fields): PriceObservation` — validates minimum fields (productId, productName, priceCents), sets defaults (`contributed: false`, `isPersonalised: false`), returns observation or null

- **`lib/navigation.ts`** — SPA navigation detection:
  - `onUrlChange(callback: (url: string) => void): void` — monkey-patches `history.pushState`/`replaceState`, listens for `popstate`, calls back on URL changes
  - `waitForElement(selector: string, timeout?: number): Promise<Element | null>` — polls for an element to appear after navigation (default 5s timeout)

- **`lib/types.ts`** — Already exists. `PriceObservation` interface used by all scrapers. Will be updated to add `gtin: string | null` field.

### Per-site scrapers (`lib/scrapers/`)

- **`lib/scrapers/woolworths.ts`** — `scrapeWoolworths(document, url: string): PriceObservation | null`
- **`lib/scrapers/coles.ts`** — `scrapeColes(document, url: string): PriceObservation | null`

Each function takes a Document and the current page URL. It extracts data, builds `pageUrl` from the URL parameter and `observedAt` from `new Date().toISOString()`, and returns a PriceObservation or null if minimum fields (productId, productName, priceCents) couldn't be extracted. The content script entrypoint passes `window.location.href` as the URL.

### Content script entrypoints

- **`entrypoints/woolworths.content.ts`** — calls `scrapeWoolworths(document, location.href)`, sends result to background, handles SPA navigation
- **`entrypoints/coles.content.ts`** — calls `scrapeColes(document, location.href)`, sends result to background, handles SPA navigation

Scraping logic lives in `lib/scrapers/` (testable without browser extension context), not in the entrypoints themselves.

## Extraction Strategy

### Coles (JSON-LD primary)

JSON-LD provides: name, sku, gtin, brand, current price, was-price.

1. Parse JSON-LD `<script type="application/ld+json">` (find `@type: "Product"`)
2. Extract from JSON-LD:
   - `productName` from `name` (e.g., `"Coca-Cola Soft Drink Coke | 2L"`)
   - `productId` as `coles:{sku}` (note: `sku` is a number in Coles JSON-LD, coerce to string)
   - `gtin` from `gtin` (e.g., `"9300675001007"`)
   - `brand` from `brand.name` (brand is `{@type: "Brand", name: "..."}`)
   - `priceCents` from `offers[0].price` (multiply by 100) — this is the current/sale price
   - `wasPriceCents` from `offers[0].priceSpecification.price` (multiply by 100) — this is the list/original price. Only set when it differs from `offers[0].price`.
3. DOM fallback for fields not in JSON-LD:
   - Unit price + unit measure: `.price__calculation_method` — parse text like `"$5.52/ 100g"` or `"$1.75 / 1L"`. Split into price cents and unit string. Note: on sale items this element may also contain `" | Was $19.00"` — strip that suffix before parsing unit price.
   - Promo type: detect from roundel classes:
     - `.roundel-text.is-half-price` -> `"half_price"`
     - `.roundel-text.simple-fixed-price-specials` -> `"special"`
     - `.roundel-text.every-day` -> `"everyday_low"`
     - `.roundel-text.multi_save` -> `"multi_save"`
     - `.roundel-text.reduced-to-clear` -> `"clearance"`
   - Category: breadcrumbs from `[data-testid="breadcrumbs"]`
4. Product ID fallback: extract last numeric segment from URL path (`/product/{slug}-{sku}`)

### Woolworths (JSON-LD + DOM)

JSON-LD provides: name, sku, gtin, brand, current price, unit price. Was-price is DOM-only.

1. Parse JSON-LD `<script type="application/ld+json">` (find `@type: "Product"`)
2. Extract from JSON-LD:
   - `productName` from `name` (e.g., `"Coca-Cola Classic  Soft Drink Bottle Bottle 2L"`)
   - `productId` as `woolworths:{sku}` (sku is a string in Woolworths JSON-LD, e.g., `"38121"`)
   - `gtin` from `gtin` (e.g., `"9300675001007"`)
   - `brand` from `brand.name` (brand is `{@type: "Organization", name: "..."}` — an object, NOT a plain string)
   - `priceCents` from `offers.price` (multiply by 100) — note: Woolworths `offers` is an object, not an array (unlike Coles where it's `offers[0]`)
   - `unitPriceCents` from `offers.priceSpecification.price` (multiply by 100) — this is the unit price (e.g., $1.75/L), NOT the was-price
   - Unit measure: `offers.priceSpecification.unitText` gives the product size (e.g., "2L"), but the display unit (e.g., "per 1L") comes from the DOM
3. DOM extraction for remaining fields (using partial class matching for CSS-module resilience):
   - Was price: `[class*="price-was"]` — only present on sale items. Contains text like "$40.00". Parse with `parsePriceCents`.
   - Unit price display: `[class*="product-unit-price_component_price-cup-string"]` — text like "$1.75 / 1L". Extract the unit measure string (e.g., "1L") from here.
   - Promo type: `[class*="product-label_component"]` — detect from class suffix and text:
     - Class contains `lower-shelf-price` -> `"lower_price"` (text: "Lower Shelf Price")
     - Class contains `special` -> `"special"` (text: "Save $X.XX")
   - `isPersonalised`: Woolworths embeds `IsPersonalisedByPurchaseHistory` in a data layer JSON blob. Extract by searching script/data content for this key. Default to `false` if not found.
4. Product ID fallback: extract numeric segment from URL `/shop/productdetails/{id}/{slug}`
5. Category: `[class*="breadcrumb"]` if present

### JSON-LD shape differences between sites

| Field | Woolworths | Coles |
|-------|-----------|-------|
| `brand` | `{@type: "Organization", name: "..."}` | `{@type: "Brand", name: "..."}` |
| `offers` | Object (single offer) | Array of offers |
| `sku` | String (`"38121"`) | Number (`191736`) |
| `priceSpecification.price` | Unit price (per L/kg) | List/was price |
| `gtin` | Present | Present |

The shared `parseJsonLd` returns raw JSON. Each site-specific scraper handles its own field mapping, since the shapes differ.

### Partial class matching rationale

Woolworths uses CSS modules with hashed class names (e.g., `product-price_component_price-container__b6eWh`). The hash suffix changes per build. Using `[class*="product-price_component"]` matches the stable prefix and survives site rebuilds. This is less precise than `data-testid` attributes (which Coles uses) but is the most stable option available for Woolworths.

### JS state extraction (deferred)

The PROJECT_BRIEF describes a three-layer extraction strategy: JSON-LD -> JS state -> DOM. JS state extraction (`__NEXT_DATA__`, `window.__INITIAL_STATE__`) is deferred for this phase because:
- JSON-LD + DOM already covers all required fields for both sites
- Woolworths `__NEXT_DATA__` contains AEM component tree data, not structured product/price data
- Coles does not expose `__NEXT_DATA__` or similar in the HTML fixtures
- `IsPersonalisedByPurchaseHistory` is extracted directly from the data layer rather than through a general JS state parser

JS state extraction can be added as a fallback layer in a future iteration if JSON-LD or DOM selectors become unreliable.

## SPA Navigation

Both sites are SPAs. Content scripts handle client-side navigation:

1. On initial load: if URL matches product page pattern, scrape immediately
2. Monkey-patch `history.pushState` and `history.replaceState` to fire a custom event
3. Listen for `popstate` (browser back/forward)
4. On URL change: check if new URL is a product page, wait for key element to appear (price element), then scrape
5. Debounce: ignore rapid URL changes (e.g., redirects), only scrape after URL is stable for 500ms

### URL patterns

- Woolworths: `/shop/productdetails/{id}/{slug}`
- Coles: `/product/{slug}-{sku}`

## Message Passing

Content scripts send observations to the background worker:

```typescript
browser.runtime.sendMessage({
  type: "PRICE_OBSERVATION",
  data: observation  // PriceObservation object
});
```

Background worker already listens for this message type (wired in Phase 1).

## Error Handling

- Each extraction step wrapped in try/catch — failed field returns null
- Minimum viable observation requires: `productId`, `productName`, `priceCents`
- If any minimum field fails, log a warning and skip the observation (don't send to background)
- Track per-chain success/failure counts in `browser.storage.local`:
  ```typescript
  { woolworths: { success: number, failure: number, lastSuccess: string | null },
    coles:      { success: number, failure: number, lastSuccess: string | null } }
  ```
- Console warnings on extraction failures for debugging

## Testing

Tests use the real HTML fixture files in `test/fixtures/`:

- `woolworths product.html`, `woolworths product on sale.html`
- `coles product.html`, `coles product on sale.html`
- `woolworths home page.html`, `coles home page.html` (negative test cases)

### Test structure

- **`test/lib/scraper.test.ts`** — shared utilities: JSON-LD parsing, price parsing, fallback chains
- **`test/lib/scrapers/woolworths.test.ts`** — full Woolworths scraper against fixtures
- **`test/lib/scrapers/coles.test.ts`** — full Coles scraper against fixtures

### What each scraper test asserts

For each product page fixture:
- Returns a non-null PriceObservation
- `productId` matches expected value (e.g., `coles:191736`, `woolworths:38121`)
- `productName` matches expected value
- `priceCents` matches expected value (e.g., 350 for $3.50)
- `brand` matches expected value (e.g., "Coca-Cola")
- `gtin` matches expected value
- `storeChain` is correct
- `pageUrl` is populated
- `observedAt` is a valid ISO 8601 string
- `contributed` is `false`
- Unit price fields populated where available

For sale fixtures additionally:
- `wasPriceCents` is populated and correct (e.g., 4000 for $40.00)
- `promoType` is populated

Negative test cases (home pages, search pages):
- Scraper returns `null` (not a product page, or minimum fields can't be extracted)

### Test approach

Load fixture HTML into `happy-dom`'s Document, pass to scraper function with a mock URL, assert output. No browser extension APIs needed — scraper functions take a plain Document + URL string.

## Type changes

### `lib/types.ts` — add `gtin` field

```typescript
interface PriceObservation {
  // ... existing fields ...
  gtin: string | null;  // barcode/EAN — enables future cross-chain product matching
}
```

### Config files

The existing `config/woolworths.ts` and `config/coles.ts` files contain scraper selector configs. These will be updated to reflect the real HTML selectors found in the fixtures. However, the scraper functions in `lib/scrapers/` will reference selectors directly rather than consuming the config objects — the configs serve as documentation and will be used for future remote-updatable selector configs.

## Files to create/modify

### New files
- `lib/scraper.ts` — shared extraction utilities
- `lib/navigation.ts` — SPA navigation detection
- `lib/scrapers/woolworths.ts` — Woolworths scraper function
- `lib/scrapers/coles.ts` — Coles scraper function
- `test/lib/scraper.test.ts` — shared utility tests
- `test/lib/scrapers/woolworths.test.ts` — Woolworths scraper tests
- `test/lib/scrapers/coles.test.ts` — Coles scraper tests

### Modified files
- `lib/types.ts` — add `gtin` field to PriceObservation
- `entrypoints/woolworths.content.ts` — wire up scraper + SPA navigation
- `entrypoints/coles.content.ts` — wire up scraper + SPA navigation
- `entrypoints/background.ts` — log received observations more usefully
- `config/woolworths.ts` — update selectors to match real HTML analysis
- `config/coles.ts` — update selectors to match real HTML analysis
