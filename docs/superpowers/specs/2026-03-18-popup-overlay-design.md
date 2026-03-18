# Phase 4: Popup & Product Page Overlay — Design Spec

## Goal

Give users visibility into the price data Chook Check is collecting. Two UI surfaces: a **popup** (click the extension icon) showing summary stats and recent observations, and a **product page overlay** (injected on Woolworths/Coles pages) showing price history for the current product.

## Architecture & Data Flow

### Popup

The popup is an extension page with full access to the Dexie database. It reads directly from IndexedDB via the existing `lib/data.ts` query functions — no message passing needed. (WXT popup entry points run in the extension origin and share IndexedDB with the background in both Chrome and Firefox. If this assumption breaks during implementation, fall back to message passing using the same pattern as the overlay.)

- `getStorageStats(db)` → observation count, per-chain breakdown, **distinct product count** (new field — query `productId` index with `uniqueKeys()`)
- `getRecentObservations(db, 10)` → last 10 observations, newest first

`getStorageStats` must be extended to include a `distinctProducts: number` field, computed via `db.priceObservations.orderBy("productId").uniqueKeys()` and taking the array length. The existing return fields (`totalObservations`, `oldestDate`, `newestDate`, `byChain`) are retained — the popup uses `totalObservations`, `distinctProducts`, and `byChain`; the other fields are available for future consumers (dashboard).

Data loads on mount via `useEffect` + `useState`. No state management library.

### Overlay

The overlay is a content script injected on product pages. Content scripts run in the page's origin and cannot access the extension's IndexedDB directly. The overlay communicates with the background service worker via message passing.

**Flow:**

1. Scraper content script captures the product and sends `PRICE_OBSERVATION` to background (existing)
2. Overlay content script sends `GET_PRODUCT_DATA` with the `productId` to background
3. Background queries IndexedDB (`getProductHistory`, `getProductStats`) and responds
4. Overlay renders the badge/panel with the returned data

**New message type in `entrypoints/background.ts`:**

```typescript
// Request
{ type: "GET_PRODUCT_DATA", productId: string }

// Response (product has history)
{
  history: PriceObservation[],
  stats: { min: number, max: number, avg: number, count: number }
}

// Response (no history / first visit)
{
  history: [],
  stats: null
}
```

**Important:** The existing `browser.runtime.onMessage.addListener` callback in `background.ts` does not return a value (fire-and-forget for `PRICE_OBSERVATION`). For `GET_PRODUCT_DATA` to work, the listener must return a `Promise` so the browser keeps the message channel open for the async response. The listener must be refactored to return a `Promise` for message types that need a response.

The overlay must obtain the `productId` for the current page. Both scrapers already have URL-based SKU extraction functions (`extractSkuFromUrl` in each scraper module). These functions must be **extracted into a shared module** (`lib/product-id.ts`) and imported by both the scrapers and the overlay. This avoids duplicating regex logic and ensures the overlay always computes the same `productId` as the scraper.

### Styling

**CSS Modules** for all components. Each component has a co-located `.module.css` file. This provides:

- Scoped class names (no collisions between popup, overlay, and host page)
- No runtime cost
- No new dependencies

The overlay additionally uses **Shadow DOM** to fully isolate its styles from the host page. React renders into the shadow root. CSS Module styles are injected into the shadow root using Vite's `?inline` import suffix, which returns CSS as a string rather than injecting it into `document.head`. The string is then placed into a `<style>` element inside the shadow root. This is necessary because WXT/Vite's default CSS injection targets `document.head`, which is outside the shadow boundary.

## Popup Design

**Dimensions:** 320px wide (standard browser popup frame).

**Layout:**

```
┌─────────────────────────────┐
│  Chook Check                 │
│  Tracking Australian prices  │
├─────────────────────────────┤
│  12 products · 47 prices     │
│  Woolworths: 32 · Coles: 15  │
├─────────────────────────────┤
│  Recent Observations         │
│                              │
│  Coca-Cola 1.25L      $4.20  │
│  woolworths · 2 min ago      │
│                              │
│  Vegemite 380g        $6.50  │
│  coles · 1 hr ago            │
│                              │
│  ... (up to 10 items)        │
├─────────────────────────────┤
│  [Dashboard]  [Settings]     │
│  Not contributing            │
└─────────────────────────────┘
```

**Components:**

| Component | Responsibility |
|-----------|---------------|
| `PopupHeader` | Logo, tagline |
| `StatsBar` | Product count, observation count, per-chain breakdown |
| `ObservationList` | Flat list of recent observations, max 10 |
| `ObservationItem` | Product name, formatted price, chain badge, relative time |
| `PopupFooter` | Links to dashboard/settings, contribution status with call-to-action ("Help other Australians spot unfair pricing — start contributing") |

**Alerts:** The project brief mentions an alerts section in the popup. Meaningful alerts require either significant price history or community data (Phase 8). Alerts are deferred to Phase 5 (dashboard, which has more space for alert UI) and Phase 8 (community integration). The popup layout has room to add an alerts section between `StatsBar` and `ObservationList` when ready.

**Empty state:** "Visit a Woolworths or Coles product page to start tracking prices."

**Data loading:** `useEffect` on mount fetches `getStorageStats` and `getRecentObservations`. Simple `useState` for loading/loaded/error states.

## Product Page Overlay

### Badge (default state)

A small pill-shaped element (~32px) positioned near the price element on the product page. Shows a minimal indicator — the Chook Check abbreviation "CC" or a small icon. Subtle colour hint: green if the current price is at or below the average, neutral otherwise.

Clicking the badge expands the panel.

### Expanded panel (on click)

```
┌──────────────────────────────┐
│  Coca-Cola 1.25L          ✕  │
│  ▁▂▃▂▄▅▃▂▁▂▃  (sparkline)   │
│                              │
│  Now    $4.20                │
│  Avg    $4.35                │
│  Low    $3.50  ·  High $5.00 │
│  Tracked 23 times            │
│                              │
│  Community data coming soon  │
└──────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|---------------|
| `OverlayRoot` | Shadow DOM container, positioning logic, lifecycle |
| `OverlayBadge` | Small clickable indicator, manages expanded/collapsed state |
| `OverlayPanel` | Expanded card with sparkline, stats, and "Community data coming soon" placeholder (to be replaced with real community comparison in Phase 8) |
| `Sparkline` | Hand-rolled SVG polyline from `priceCents[]`, highlights current price |

### Sparkline

Hand-rolled SVG — no chart library. Takes an array of `priceCents` values and renders a polyline. Highlights the most recent price point with a dot. Dimensions: ~200px wide, ~40px tall. Green line colour, matching the extension's accent.

Handles edge cases:
- Single data point → renders a dot
- Empty array → no render
- All same price → flat line

### Positioning logic

1. Look for the price element using chain-specific CSS selectors (defined in `lib/overlay-selectors.ts`)
2. If found → insert the badge adjacent to the price element via `insertAdjacentElement`
3. If not found → fall back to a fixed-position badge in the bottom-right corner of the viewport
4. The expanded panel renders as a floating card positioned near the badge (absolute or fixed positioning, stays within viewport bounds)

### Shadow DOM isolation

The entire overlay mounts inside a Shadow DOM root attached to a container `<div>` injected into the page. This prevents:
- Host page CSS from affecting overlay styles
- Overlay CSS from affecting the host page

React renders into the shadow root. CSS Module styles are loaded into the shadow root.

### SPA navigation

Both Woolworths and Coles are SPAs. The overlay needs to detect navigation to re-inject for new products.

**Problem:** The existing `onUrlChange` utility monkey-patches `history.pushState` and `history.replaceState`. If both the scraper and overlay content scripts call `onUrlChange`, the second caller overwrites the first's patches — only one listener survives.

**Solution:** Refactor `onUrlChange` to support multiple listeners. Instead of each caller installing its own monkey-patches, patch `pushState`/`replaceState` once (on first call) and dispatch a `CustomEvent` on `window`. Subsequent callers subscribe to the event. The cleanup function removes the listener and, if no listeners remain, restores the original methods.

When the overlay detects a URL change:
1. Clean up the previous overlay (remove the shadow root container)
2. Re-inject for the new product
3. Debounce to avoid multiple renders from rapid SPA navigation

### Content script registration

The overlay is a **separate content script** (`entrypoints/overlay.content.ts`) from the scrapers. It runs on the same URL patterns (`woolworths.com.au/*`, `coles.com.au/*`) but handles only UI injection. This keeps scraping and UI concerns decoupled.

### Product ID from URL

The overlay needs the `productId` to request data from the background. The SKU extraction logic already exists in each scraper's `extractSkuFromUrl` function. These must be extracted into a shared module (`lib/product-id.ts`) so both the scrapers and overlay import from the same source. This ensures the overlay always computes the same `productId` as the scraper.

```typescript
// lib/product-id.ts

// Per-chain SKU extractors (moved from scraper modules, return bare SKU)
extractWoolworthsSku(url: string): string | null  // "/shop/productdetails/32731/..." → "32731"
extractColesSku(url: string): string | null        // "/product/coca-cola-1234567" → "1234567"

// Combined: detects chain from hostname, extracts SKU, returns prefixed product ID
getProductIdFromUrl(url: string): string | null    // → "woolworths:32731" or "coles:1234567" or null
```

The scrapers import the per-chain extractors (`extractWoolworthsSku`, `extractColesSku`) and prefix the SKU themselves as they do today. The overlay imports `getProductIdFromUrl` which handles both detection and prefixing.

## Shared Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `formatPrice(cents)` | `components/shared/formatPrice.ts` | `350` → `"$3.50"` |
| `formatRelativeTime(iso)` | `components/shared/formatTime.ts` | `"2026-03-18T12:00:00Z"` → `"2 min ago"` |
| `getProductIdFromUrl(url)` | `lib/product-id.ts` | URL → `"woolworths:{sku}"` or `"coles:{sku}"` or `null` |

## File Structure

### New files

```
components/
  popup/
    PopupHeader.tsx + .module.css
    StatsBar.tsx + .module.css
    ObservationList.tsx + .module.css
    ObservationItem.tsx + .module.css
    PopupFooter.tsx + .module.css
  overlay/
    OverlayRoot.tsx + .module.css
    OverlayBadge.tsx + .module.css
    OverlayPanel.tsx + .module.css
    Sparkline.tsx + .module.css
  shared/
    formatPrice.ts
    formatTime.ts

entrypoints/
  overlay.content.ts          # new content script for overlay UI injection

lib/
  product-id.ts               # shared productId extraction from URL (used by scrapers + overlay)
  overlay-selectors.ts        # price element CSS selectors per chain for badge positioning
```

### Modified files

- `entrypoints/popup/App.tsx` — rewrite to use new components
- `entrypoints/popup/style.css` — delete (replaced by CSS Modules)
- `entrypoints/background.ts` — add `GET_PRODUCT_DATA` message handler, refactor `onMessage` listener to return `Promise` for async responses
- `lib/data.ts` — add `distinctProducts` field to `getStorageStats` return type
- `lib/navigation.ts` — refactor `onUrlChange` to support multiple listeners (event-based, patch once)
- `lib/scrapers/woolworths.ts` — import `extractSkuFromUrl` from `lib/product-id.ts` instead of local function
- `lib/scrapers/coles.ts` — import `extractSkuFromUrl` from `lib/product-id.ts` instead of local function

## Error Handling

### Popup

- IndexedDB read fails → show stats as "—", observations list shows "Unable to load data"
- Database is empty → empty state message
- Brief loading state on mount to avoid flash of empty content

### Overlay

- Background message times out → badge renders, panel shows "Unable to load price history"
- Price element selector fails → fall back to fixed-position badge
- Shadow DOM not supported → don't render overlay (rare, all modern browsers support it)
- SPA navigation → clean up previous overlay, debounce re-injection
- No history for product (first visit) → "First observation recorded — check back after your next visit to see trends"

## Testing

### Popup tests (Vitest + happy-dom)

- `PopupHeader` renders correctly
- `StatsBar` displays formatted counts from `getStorageStats`
- `StatsBar` handles empty database (zero state)
- `ObservationList` renders items from `getRecentObservations`
- `ObservationList` shows empty state when no observations
- `ObservationItem` formats price correctly (cents → dollars)
- `ObservationItem` displays relative time
- Footer links point to correct extension URLs

### Overlay tests (Vitest + happy-dom)

- `Sparkline` renders SVG polyline from price array
- `Sparkline` handles single data point (dot instead of line)
- `Sparkline` handles empty array (no render)
- `OverlayPanel` displays stats correctly (min, max, avg, count)
- `OverlayPanel` shows first-observation message when count is 1
- `OverlayBadge` toggles expanded/collapsed on click
- Badge positioning: finds price element → injects adjacent
- Badge positioning: falls back to fixed position when selector fails

### Background message handler tests

- `GET_PRODUCT_DATA` returns history and stats for known product
- `GET_PRODUCT_DATA` returns empty results for unknown product

### Not testing

- Shadow DOM injection (requires real browser)
- Actual Woolworths/Coles page DOM (covered by scraper tests in Phase 2)
