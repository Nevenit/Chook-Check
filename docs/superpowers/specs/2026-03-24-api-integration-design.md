# Phase 8: Extension ↔ API Integration — Design Spec

## Goal

Wire the Chook Check browser extension to the deployed community backend (`https://chook-check-api.nevenit.workers.dev`). Observations are submitted in batches from the background script, community stats are fetched on overlay open, and server deletion is available from settings. An onboarding banner in the popup encourages users to opt in after they've accumulated some local data.

## Architecture

All API communication is centralized in the background service worker. Content scripts and UI components never call the API directly — they send messages to the background, which handles fetch, batching, and error recovery. This matches the existing extension architecture where all data flows through `entrypoints/background.ts`.

### New Module: `lib/api.ts`

Thin fetch wrapper with typed responses. Three functions:

```typescript
const API_BASE = "https://chook-check-api.nevenit.workers.dev";

async function submitObservations(body: SubmitRequest): Promise<SubmitResponse>
async function getProductStats(productId: string, days?: number, chain?: string): Promise<ProductStats>
async function deleteContributorData(contributorId: string): Promise<{ deleted: number }>
```

- All functions throw on non-2xx responses.
- No retry logic in the API module itself — the caller (background script) handles retry via the batch interval.
- Types defined in New Types section below.

## Data Flow

### Submission Flow (Background → API)

1. Content scripts scrape prices → send `PRICE_OBSERVATION` to background → saved locally with `contributed: false` (existing behavior, unchanged).
2. Background registers a periodic alarm: `browser.alarms.create("submit-observations", { periodInMinutes: 5 })`.
3. On alarm tick:
   1. Read `UserSettings` — if `contributionEnabled` is false, skip entirely.
   2. Query Dexie for observations where `contributed === false`.
   3. If none, skip.
   4. Build the API request body:
      - `contributorId` from settings.
      - `observations` mapped from local `PriceObservation` — strip `pageUrl`, `id`, `contributed` (these are local-only fields). Map field names to API format.
      - `context` built conditionally: include `browser` only if `shareBrowser` is true (detected via `navigator.userAgent` — e.g., "Chrome", "Firefox"), `state` only if `shareState`, `city` only if `shareCity`, `store` only if `shareStore`. Note: `store` is not currently scraped — this field will be omitted until store name scraping is added in a future phase.
   5. Guard: if `contributorId` is empty, skip submission (should not happen given opt-in flow generates UUID, but defensive check).
   6. Filter out observations older than 14 days (API rejects these).
   7. Chunk into batches of 50 (API max per request), submit sequentially.
   8. For each successful batch: mark those observations `contributed: true` in Dexie. Partial success is fine — if batch 1 succeeds and batch 2 fails, batch 1's observations stay marked as contributed and batch 2's retry on the next tick.
   9. Log a `SharingEvent` to the `sharingLog` Dexie table (one per batch, not per tick).
4. On failure: log a `SharingEvent` with `status: "error"` and `errorMessage`. Observations remain `contributed: false` and get retried on the next alarm tick.

**First submission timing:** 5 minutes after contribution is enabled, not immediately.

**Opt-out behavior:** If the user disables `contributionEnabled`, the alarm handler skips. Observations with `contributed: false` stay that way. If the user re-enables later, those observations get submitted on the next tick (as long as they're within the 14-day API window).

### Community Stats Flow (Overlay → Background → API)

1. User clicks overlay badge (expanding the panel) → `OverlayPanel` fires `GET_COMMUNITY_STATS` message to background with `productId` via a `useEffect` triggered by the panel becoming visible.
2. Background calls `GET /api/products/:productId/stats`.
3. Returns result to overlay.
4. Overlay displays:
   - If `quorum: true` — community median, min/max, observation count, contributor count, promo frequency.
   - If `quorum: false` — "Not enough community data yet" with contributor count (e.g., "2 of 3 contributors needed").
   - If error or timeout — silently fall back to local-only data, no error shown.
5. Local sparkline and personal history remain in the overlay unchanged. Community data is an additional section below.

**No caching.** Community stats are fetched fresh each time the overlay opens. The 120 req/hour GET rate limit is generous for typical per-user browsing. Caching can be added later if needed.

### Server Deletion Flow (Settings → Background → API)

1. User clicks "Request server deletion" in settings → confirmation dialog.
2. On confirm: sends `DELETE_SERVER_DATA` message to background with `contributorId`.
3. Background calls `DELETE /api/contributor/:contributorId`.
4. Returns `{ deleted: N }` to settings UI → shows confirmation message.

## Onboarding Banner

A one-time, dismissible banner in the popup encouraging users to opt in to contribution.

**Trigger conditions (all must be true):**
- `contributionEnabled === false`
- Distinct product count >= 5 (from `getStorageStats().distinctProducts`)
- `onboardingDismissed === false`

**Appearance:** A card at the top of the popup with:
- Text: "You've tracked N products! Help other Australians by sharing your price observations." (where N is the distinct product count)
- "Enable in settings" link → opens the options page to the contribution section
- Dismiss button (×)

**Dismissal:** Sets `onboardingDismissed: true` in `UserSettings`. Banner never appears again (show once policy).

## New Types

```typescript
/** Request body for POST /api/observations */
interface SubmitRequest {
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

/** Response from POST /api/observations */
interface SubmitResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  reasons?: string[];
}

/** Response from GET /api/products/:productId/stats */
interface ProductStats {
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

interface SharingEvent {
  id?: number;
  timestamp: string;       // ISO 8601
  observationCount: number;
  status: "success" | "error";
  errorMessage?: string;
}
```

Add to `UserSettings`:
```typescript
onboardingDismissed: boolean;  // default: false
```

## Database Changes

Add `sharingLog` table to Dexie schema:
```
sharingLog: ++id, timestamp
```

Indexed by `timestamp` for reverse-chronological display in the Sharing Log section.

No migration needed — Dexie handles schema version bumps by incrementing the version number.

## Message Types

New messages handled by the background script:

| Message Type | Direction | Payload | Response |
|---|---|---|---|
| `GET_COMMUNITY_STATS` | overlay → background | `{ productId: string }` | `ProductStats \| null` |
| `DELETE_SERVER_DATA` | settings → background | `{ contributorId: string }` | `{ deleted: number }` |

Existing `PRICE_OBSERVATION` and `GET_PRODUCT_DATA` messages are unchanged.

## UI Changes

### Overlay Panel (`components/overlay/OverlayPanel.tsx`)

- Remove "Community data coming soon" placeholder.
- Add a "Community" section below the existing local stats.
- States:
  - **Loading:** Small spinner while waiting for background response.
  - **Quorum met:** Display median price, min/max range, observation count, contributor count, promo frequency breakdown.
  - **Quorum not met:** "Not enough community data yet (N/3 contributors)".
  - **Error/no data:** Section hidden, local data shown as before.

### Popup — Onboarding Banner

- New component rendered at the top of the popup when trigger conditions are met.
- Dismissed state persisted in `UserSettings.onboardingDismissed`.

### Settings — Sharing Log (`components/settings/SharingLogSection.tsx`)

- Reads from `sharingLog` Dexie table.
- Displays entries in reverse chronological order: timestamp, observation count, status.
- Keeps "No data has been shared yet" empty state when table is empty.

### Settings — Data Management (`components/settings/DataManagementSection.tsx`)

- "Request server deletion" button enabled when `contributorId` exists (user may have contributed in the past then opted out).
- On click: confirmation dialog → calls background → displays result.

### Settings — Contribution Section

No changes. Existing toggles already control the settings that the background reads when building batch context.

## File Changes Summary

**New files:**
- `lib/api.ts` — API client (fetch wrapper)

**Modified files:**
- `lib/types.ts` — add `SubmitRequest`, `SubmitResponse`, `ProductStats`, `SharingEvent`; add `onboardingDismissed` to `UserSettings`
- `lib/db.ts` — add `sharingLog` table, bump schema version
- `lib/store.ts` — add `onboardingDismissed: false` to `initDefaults`
- `entrypoints/background.ts` — alarm registration, batch submission handler, `GET_COMMUNITY_STATS` and `DELETE_SERVER_DATA` message handlers
- `entrypoints/overlay.content.ts` — send `GET_COMMUNITY_STATS` on panel expand
- `components/overlay/OverlayPanel.tsx` — community stats section
- `components/settings/SharingLogSection.tsx` — read from `sharingLog` table (currently shows empty placeholder)
- `components/settings/DataManagementSection.tsx` — enable server deletion
- Popup entry point — add onboarding banner component

**Constants:**
- `API_BASE`: `https://chook-check-api.nevenit.workers.dev`
- Batch interval: 5 minutes
- Batch size: 50
- Onboarding threshold: 5 distinct products

## Testing

- **`lib/api.ts`**: Unit tests with mocked fetch — success responses, error handling, request body shape.
- **Background submission**: Test alarm handler — builds correct request from settings + observations, marks `contributed: true`, logs sharing events, skips when disabled.
- **Onboarding banner**: Component test — renders when conditions met, hidden when dismissed, hidden when already contributing.
- **Sharing log**: Component test — renders entries, shows empty state.
- **Community stats display**: Component test — loading state, quorum met, quorum not met, error fallback.
- **Server deletion**: Component test — button enabled/disabled state, confirmation flow.
- Existing tests should pass unchanged.

## Decisions

- **Background-centric API access.** All fetch calls go through the background script. Content scripts and UI components communicate via message passing. Matches existing architecture, centralizes rate limit management.
- **5-minute batch interval.** Balances freshness against API call volume. The 60 req/hour POST limit supports 12 batches/hour, well within the 5-minute cadence.
- **Silent retry on failure.** Unsubmitted observations stay in the pool and get retried automatically. No user-facing error for transient failures.
- **Fetch on overlay open, not page load.** Avoids wasting the 120 req/hour GET limit on pages where the user doesn't check community data.
- **No client-side caching of community stats.** Keeps implementation simple. Can be added later if rate limits become a concern.
- **Show-once onboarding banner.** Respects user decision — dismissed permanently after one interaction.
- **`onboardingDismissed` in UserSettings.** Simple boolean flag, no separate storage needed.
