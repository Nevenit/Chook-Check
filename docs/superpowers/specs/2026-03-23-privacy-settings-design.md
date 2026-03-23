# Phase 6: Privacy & Settings UI — Design Spec

## Goal

Build the options page as a single scrolling page with six sections: contribution settings, data summary, sharing log, consent history, data management, and about. Every toggle change is logged to the consent audit trail. Plain-English copy throughout — no legalese.

## Architecture

The options page (`entrypoints/options/`) replaces its current placeholder with a React component tree rooted at `App.tsx → SettingsPage.tsx`. Each section is a standalone component. All settings are read from and written to the existing `userSettings` Dexie table via `lib/store.ts`. A new `lib/settings.ts` module provides `getSettings()` and `updateSetting()` with automatic consent logging. CSS Modules for styling, consistent with the dashboard.

The page uses a sidebar + main content layout. The sidebar contains anchor links that scroll to the corresponding section. No router — just `scrollIntoView()`.

## Decisions

- **Single scrolling page** with sticky sidebar nav (not tabs or accordion)
- **Data inspector is summary-only** — stats cards + links to dashboard and export (no duplicate browsing UI)
- **Consent log is chronological** — newest first, one flat list
- **Sharing log and server deletion are placeholder UI** — will wire up in Phase 7/8 when the backend exists

## Data Layer

### Existing (minor change)

- `UserSettings` type in `lib/types.ts` — already has all toggle fields and `consentLog: ConsentEvent[]`
- `ConsentEvent` type — `action`, `detail`, `timestamp`. **Add `"data_deleted"` to the `action` union:** change from `"opted_in" | "opted_out" | "toggle_changed"` to `"opted_in" | "opted_out" | "toggle_changed" | "data_deleted"`. Used by `deleteAllLocalData` to record the deletion event.
- `initDefaults(db)` in `lib/store.ts` — initializes settings with contribution off
- `saveSettings(db, settings)` in `lib/store.ts` — partial update
- `getStorageStats(db)` in `lib/data.ts` — returns product/observation counts

### New: `lib/settings.ts`

Thin wrapper around `lib/store.ts` that adds consent logging:

```typescript
// Read current settings (strips the Dexie `key` field from StoredSettings).
// If no record exists (e.g. background worker hasn't run yet), calls initDefaults first.
async function getSettings(db: ChookCheckDB): Promise<UserSettings>

// Update a single toggle and append a ConsentEvent to consentLog
async function updateSetting(
  db: ChookCheckDB,
  key: keyof UserSettings,
  value: boolean,
): Promise<void>

// Delete all local data (observations only). Resets settings to defaults
// but preserves the existing consentLog and appends a deletion event.
async function deleteAllLocalData(db: ChookCheckDB): Promise<void>
```

`updateSetting` determines the correct `action` and `detail`:
- Toggling `contributionEnabled` on → `action: "opted_in"`, `detail: "Contribution enabled"`
- Toggling `contributionEnabled` off → `action: "opted_out"`, `detail: "Contribution disabled"`
- Any other toggle → `action: "toggle_changed"`, `detail: "Share Browser turned on"` (etc.)

The consent event is appended to the existing `consentLog` array and saved in the same transaction.

`deleteAllLocalData` clears `priceObservations` and resets `userSettings` to defaults, but preserves the existing `consentLog` array and appends a new deletion event to it. This ensures the consent trail survives data deletion.

## Components

### File Structure

| File | Responsibility |
|------|---------------|
| `entrypoints/options/App.tsx` | Renders `<SettingsPage />` |
| `components/settings/SettingsPage.tsx` | Top-level layout: sidebar nav + scrollable main content |
| `components/settings/SettingsPage.module.css` | Page layout styles (sidebar, main) |
| `components/settings/ContributionSection.tsx` | Main toggle, "what gets shared" explainer, 5 context toggles |
| `components/settings/ContributionSection.module.css` | Contribution section styles |
| `components/settings/DataSummarySection.tsx` | Stats cards + links to dashboard/export |
| `components/settings/DataSummarySection.module.css` | Data summary styles |
| `components/settings/SharingLogSection.tsx` | Placeholder table for future sharing log |
| `components/settings/SharingLogSection.module.css` | Sharing log styles |
| `components/settings/ConsentHistorySection.tsx` | Chronological list of consent events |
| `components/settings/ConsentHistorySection.module.css` | Consent history styles |
| `components/settings/DataManagementSection.tsx` | Delete local data + request server deletion buttons |
| `components/settings/DataManagementSection.module.css` | Data management styles |
| `components/settings/AboutSection.tsx` | Version, description, GitHub link |
| `components/settings/AboutSection.module.css` | About section styles |
| `components/settings/ToggleSwitch.tsx` | Reusable toggle switch component |
| `components/settings/ToggleSwitch.module.css` | Toggle switch styles |
| `lib/settings.ts` | Settings read/write with consent logging |
| `test/lib/settings.test.ts` | Unit tests for settings functions |
| `test/components/settings/settings.test.tsx` | Component tests for settings page |

### SettingsPage

Top-level layout component. Flexbox: fixed-width sidebar (200px) + scrollable main content.

**State:** Loads settings and storage stats on mount via `getSettings(db)` and `getStorageStats(db)`. Passes settings + an `onSettingChange` callback down to child sections. When a toggle changes, calls `updateSetting()`, then re-reads settings to refresh all sections (including consent log). A `refreshKey` counter is incremented after data deletion to trigger re-fetching stats.

**Sidebar:** List of anchor links. Uses `IntersectionObserver` to highlight the currently visible section. Clicking a link calls `element.scrollIntoView({ behavior: "smooth" })`.

**Sections:** Each section component receives the current `UserSettings` (or relevant subset) and an `onSettingChange` callback.

### ContributionSection

Props: `settings: UserSettings`, `onToggle: (key, value) => void`

Three visual groups:
1. **Main toggle card** — "Contribute price data" with toggle switch and description
2. **Info box** (green tint) — "What gets shared when you contribute" — static text listing the fields
3. **Context toggles list** — 5 toggles in a grouped card, each with a label and one-line explanation:
   - `shareBrowser` → "Browser" — "e.g. Chrome, Firefox — helps detect browser-based price differences"
   - `shareState` → "State" — "e.g. VIC, NSW — helps detect regional pricing"
   - `shareCity` → "City / Region" — "e.g. Melbourne, Perth — helps detect city-level pricing"
   - `shareStore` → "Specific store" — "e.g. Coles Fitzroy — helps detect store-level pricing"
   - `linkAccount` → "Link supermarket account" — "Hashed email — enables cross-device personalisation detection"

Context toggles are visually disabled (grayed out) when the main contribution toggle is off.

### DataSummarySection

Props: `stats: { totalObservations: number; distinctProducts: number; newestDate: string | null }`

Receives stats from SettingsPage (so they refresh after data deletion). Shows 3 stat cards: products tracked, price observations, last observation date. Below: two links — "View in Dashboard" (opens `dashboard.html`) and "Export data" (opens `dashboard.html` on the Export tab, or just opens dashboard).

### SharingLogSection

Props: none

Placeholder section. Shows empty state: "No data has been shared yet." When the community API exists (Phase 7/8), this will show a table of `{ timestamp, observationCount, status }` records.

### ConsentHistorySection

Props: `consentLog: ConsentEvent[]`

Renders the consent log in reverse chronological order. Each entry shows:
- Event description (detail field)
- Timestamp formatted as "23 Mar 2026, 1:00pm"

Empty state: "No consent events recorded."

### DataManagementSection

Props: `onDataDeleted: () => void`

Two buttons:
1. **"Delete all local data"** (red border) — shows confirmation dialog (browser `confirm()`), then calls `deleteAllLocalData(db)`. Calls `onDataDeleted` after to refresh the page state.
2. **"Request server deletion"** (gray, disabled) — placeholder for Phase 7. Tooltip or small text: "Available after contributing data."

### AboutSection

Props: none

Static content: version string (from `browser.runtime.getManifest().version`), one-line description, GitHub link.

### ToggleSwitch

Reusable component used by ContributionSection.

Props: `checked: boolean`, `onChange: (checked: boolean) => void`, `disabled?: boolean`

Renders a styled toggle switch (44x24px track with 20x20px thumb). Green when on, gray when off. Reduced opacity when disabled.

## Styling

Consistent with existing dashboard patterns:
- Primary green: `#1a7a2e`
- Text: `#1a1a1a` (primary), `#666` (secondary), `#888` (tertiary)
- Borders: `#e0e0e0`
- Cards: white background, 1px border, 8px border-radius
- Destructive actions: `#d32f2f` border/text
- Info boxes: `#f0faf2` background, `#c8e6c9` border
- Font sizes: 18px section headings, 14px body, 13px descriptions, 12px/11px small text

Page background: `#fafafa` (matches dashboard).

## Testing Strategy

### `test/lib/settings.test.ts`

Unit tests for `lib/settings.ts`:
- `getSettings` returns defaults when no settings exist
- `updateSetting` updates the toggle value
- `updateSetting` appends a consent event with correct action/detail
- `updateSetting("contributionEnabled", true)` logs "opted_in"
- `updateSetting("contributionEnabled", false)` logs "opted_out"
- `updateSetting("shareBrowser", true)` logs "toggle_changed" with detail "Share Browser turned on"
- `deleteAllLocalData` clears observations and resets settings
- `deleteAllLocalData` logs a consent event for the deletion

### `test/components/settings/settings.test.tsx`

Component tests:
- SettingsPage renders all section headings
- ContributionSection renders main toggle and all 5 context toggles
- ContributionSection context toggles are disabled when contribution is off
- DataSummarySection renders stats after loading
- ConsentHistorySection renders consent events in reverse order
- ConsentHistorySection renders empty state when no events
- DataManagementSection renders both buttons
- AboutSection renders version info

All data functions mocked (same pattern as dashboard tests). Toggle interactions tested via `fireEvent.click`.

## Edge Cases

- **`contributorIdMode`:** Not shown in the UI. Automatically set to `"account_linked"` when `linkAccount` is turned on, and `"anonymous"` when turned off. Managed inside `updateSetting`.
- **First load:** `initDefaults` has already run (called by background worker on install). `getSettings` defensively calls `initDefaults` if no record exists.
- **Rapid toggle changes:** Each `updateSetting` call is independent — no debouncing needed since each is a discrete consent event.
- **Large consent log:** Unlikely to grow beyond hundreds of entries for any user. No pagination needed.
- **Contributor ID generation:** When `contributionEnabled` is first turned on and `contributorId` is empty, `updateSetting` generates a `crypto.randomUUID()` and saves it alongside the toggle change.
