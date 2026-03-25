# Sale Price Highlighting — Design Spec

## Goal

Visually distinguish sale-price observations from regular-price observations in both the dashboard chart and the overlay sparkline. Sale points are amber; regular points are green.

## Detection

An observation is "on sale" when `promoType !== null`. All promo types are treated as sales — including `everyday_low`, which represents a promotional pricing tier even if it's long-running. Both Woolworths and Coles scrapers already populate `promoType` (e.g., "special", "half_price", "lower_price", "everyday_low", "multi_save", "clearance"). No scraper changes needed.

## Changes

### 1. Dashboard PriceChart (`components/dashboard/PriceChart.tsx`)

Currently uses a single green line with uniform point colors.

**Point colors:** Use per-point `pointBackgroundColor` and `pointBorderColor` arrays built from sorted observations. For each observation:
- Regular (`promoType === null`): green (`#1a7a2e`)
- Sale (`promoType !== null`): amber (`#f59e0b`)

**Point size:** Per-point `pointRadius` array — sale points get radius 4, regular points get 3.

**Line color per segment:** Use Chart.js `segment` styling with a `borderColor` callback. Access `ctx.p0DataIndex` and `ctx.p1DataIndex` to look up the sorted observations array. If either endpoint is a sale, color the segment amber (`#f59e0b`), otherwise green (`#1a7a2e`).

**Background fill per segment:** Use `segment.backgroundColor` to color the fill area under sale segments amber (`rgba(245, 158, 11, 0.15)`). If this doesn't work in practice (Chart.js segment fill support varies by version), fall back to a uniform green fill and rely on the point/line coloring alone to indicate sales.

**Tooltip:** Append the promo type to the tooltip label when the observation is on sale. E.g., "$3.50 (half_price)".

### 2. Overlay Sparkline (`components/overlay/Sparkline.tsx`)

Currently receives `prices: number[]` and renders a single `<polyline>` with one dot at the last point.

**Props change:** Add `onSale?: boolean[]` prop (parallel array to `prices`). When provided, sale points are highlighted.

**SVG rendering:** Replace the single `<polyline>` with individual `<line>` segments between consecutive points. Color each segment based on whether the destination point is on sale: amber (`#f59e0b`) for sale, green for regular.

Render `<circle>` markers on sale points only (plus the existing last-point dot). This keeps the sparkline clean at small sizes — only sale points get highlighted dots.

**Single-point case:** If the single observation is on sale, render the circle in amber instead of green.

**Backwards compatible:** `onSale` is optional — if omitted, all points render green as before (existing behavior preserved).

### 3. Data plumbing

**OverlayPanel.tsx:** Already receives the full `PriceObservation[]` history. Derive `onSale` internally: `history.map(o => o.promoType !== null)` and pass it to `Sparkline`. No new prop needed on OverlayPanel — it already has the data.

**PriceChart.tsx:** Already receives full `PriceObservation[]`. No new data needed — just read `promoType` from each sorted observation.

## Colors

| Element | Regular | Sale |
|---------|---------|------|
| Point fill | `#1a7a2e` (green) | `#f59e0b` (amber) |
| Point border | `#1a7a2e` | `#f59e0b` |
| Line/segment | `#1a7a2e` | `#f59e0b` |
| Area fill | `rgba(26, 122, 46, 0.1)` | `rgba(245, 158, 11, 0.15)` |

## Testing

- **PriceChart:** Chart.js renders to canvas which is hard to unit test. Visual verification in browser.
- **Sparkline:** Update overlay tests — render with `onSale` prop, verify amber circles appear on sale points and line segments use correct colors.
- **Backwards compatibility:** Existing sparkline tests (without `onSale` prop) should continue to pass unchanged.

## File Changes

- Modify: `components/dashboard/PriceChart.tsx`
- Modify: `components/overlay/Sparkline.tsx`
- Modify: `components/overlay/OverlayPanel.tsx`
- Modify: `test/components/overlay/overlay.test.tsx`
