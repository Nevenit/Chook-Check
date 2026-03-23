# Phase 6: Privacy & Settings UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the options page as a single scrolling page with contribution settings, data summary, sharing log, consent history, data management, and about sections.

**Architecture:** Sidebar + main content layout. `SettingsPage` is the top-level component that loads settings/stats and passes them down to 6 section components. A new `lib/settings.ts` wraps the existing store layer with automatic consent logging. CSS Modules for styling.

**Tech Stack:** React 19, Dexie.js (existing), CSS Modules, Vitest + Testing Library

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/settings.ts` | Settings read/write with consent logging, data deletion |
| `test/lib/settings.test.ts` | Unit tests for settings functions |
| `components/settings/ToggleSwitch.tsx` | Reusable toggle switch component |
| `components/settings/ToggleSwitch.module.css` | Toggle switch styles |
| `components/settings/SettingsPage.tsx` | Top-level layout: sidebar nav + scrollable main content |
| `components/settings/SettingsPage.module.css` | Page layout styles |
| `components/settings/ContributionSection.tsx` | Main toggle, explainer, 5 context toggles |
| `components/settings/ContributionSection.module.css` | Contribution section styles |
| `components/settings/DataSummarySection.tsx` | Stats cards + links |
| `components/settings/DataSummarySection.module.css` | Data summary styles |
| `components/settings/SharingLogSection.tsx` | Placeholder for future sharing log |
| `components/settings/SharingLogSection.module.css` | Sharing log styles |
| `components/settings/ConsentHistorySection.tsx` | Chronological consent event list |
| `components/settings/ConsentHistorySection.module.css` | Consent history styles |
| `components/settings/DataManagementSection.tsx` | Delete local + request server deletion |
| `components/settings/DataManagementSection.module.css` | Data management styles |
| `components/settings/AboutSection.tsx` | Version, description, GitHub link |
| `components/settings/AboutSection.module.css` | About section styles |
| `test/components/settings/settings.test.tsx` | Component tests for settings page |

### Modified files

| File | Change |
|------|--------|
| `lib/types.ts` | Add `"data_deleted"` to `ConsentEvent.action` union |
| `entrypoints/options/App.tsx` | Replace placeholder with `<SettingsPage />` |
| `entrypoints/options/index.html` | Add base styles (matching dashboard pattern) |

---

### Task 1: Update types and implement `lib/settings.ts`

**Files:**
- Modify: `lib/types.ts:32` (add `"data_deleted"` to action union)
- Create: `lib/settings.ts`
- Create: `test/lib/settings.test.ts`

- [ ] **Step 1: Add `"data_deleted"` to ConsentEvent action union**

In `lib/types.ts`, change line 32 from:

```typescript
  action: "opted_in" | "opted_out" | "toggle_changed";
```

to:

```typescript
  action: "opted_in" | "opted_out" | "toggle_changed" | "data_deleted";
```

- [ ] **Step 2: Write failing tests for `lib/settings.ts`**

Create `test/lib/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "@/lib/db";
import { getSettings, updateSetting, deleteAllLocalData } from "@/lib/settings";
import { makeObservation } from "../helpers";

describe("settings", () => {
  let db: ChookCheckDB;

  beforeEach(async () => {
    db = new ChookCheckDB("test-settings-" + Math.random());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe("getSettings", () => {
    it("returns defaults when no settings exist", async () => {
      const settings = await getSettings(db);
      expect(settings.contributionEnabled).toBe(false);
      expect(settings.contributorId).toBe("");
      expect(settings.shareBrowser).toBe(false);
      expect(settings.consentLog).toEqual([]);
    });

    it("returns existing settings", async () => {
      await db.userSettings.add({
        key: "default",
        contributionEnabled: true,
        contributorId: "abc-123",
        contributorIdMode: "anonymous",
        shareBrowser: true,
        shareState: false,
        shareCity: false,
        shareStore: false,
        linkAccount: false,
        consentLog: [],
      });

      const settings = await getSettings(db);
      expect(settings.contributionEnabled).toBe(true);
      expect(settings.contributorId).toBe("abc-123");
      expect(settings.shareBrowser).toBe(true);
    });

    it("does not include the Dexie key field", async () => {
      const settings = await getSettings(db);
      expect("key" in settings).toBe(false);
    });
  });

  describe("updateSetting", () => {
    it("updates the toggle value", async () => {
      await updateSetting(db, "shareBrowser", true);
      const settings = await getSettings(db);
      expect(settings.shareBrowser).toBe(true);
    });

    it("logs opted_in when enabling contribution", async () => {
      await updateSetting(db, "contributionEnabled", true);
      const settings = await getSettings(db);
      expect(settings.consentLog).toHaveLength(1);
      expect(settings.consentLog[0].action).toBe("opted_in");
      expect(settings.consentLog[0].detail).toBe("Contribution enabled");
    });

    it("logs opted_out when disabling contribution", async () => {
      await updateSetting(db, "contributionEnabled", true);
      await updateSetting(db, "contributionEnabled", false);
      const settings = await getSettings(db);
      expect(settings.consentLog).toHaveLength(2);
      expect(settings.consentLog[1].action).toBe("opted_out");
      expect(settings.consentLog[1].detail).toBe("Contribution disabled");
    });

    it("logs toggle_changed for context toggles", async () => {
      await updateSetting(db, "shareBrowser", true);
      const settings = await getSettings(db);
      expect(settings.consentLog[0].action).toBe("toggle_changed");
      expect(settings.consentLog[0].detail).toBe("Share Browser turned on");
    });

    it("generates contributorId on first opt-in", async () => {
      await updateSetting(db, "contributionEnabled", true);
      const settings = await getSettings(db);
      expect(settings.contributorId).toBeTruthy();
      expect(settings.contributorId.length).toBeGreaterThan(0);
    });

    it("sets contributorIdMode to account_linked when linkAccount enabled", async () => {
      await updateSetting(db, "linkAccount", true);
      const settings = await getSettings(db);
      expect(settings.contributorIdMode).toBe("account_linked");
    });

    it("sets contributorIdMode to anonymous when linkAccount disabled", async () => {
      await updateSetting(db, "linkAccount", true);
      await updateSetting(db, "linkAccount", false);
      const settings = await getSettings(db);
      expect(settings.contributorIdMode).toBe("anonymous");
    });
  });

  describe("deleteAllLocalData", () => {
    it("clears observations", async () => {
      await db.priceObservations.add(makeObservation());
      expect(await db.priceObservations.count()).toBe(1);

      await deleteAllLocalData(db);
      expect(await db.priceObservations.count()).toBe(0);
    });

    it("resets settings to defaults", async () => {
      await updateSetting(db, "contributionEnabled", true);
      await updateSetting(db, "shareBrowser", true);

      await deleteAllLocalData(db);
      const settings = await getSettings(db);
      expect(settings.contributionEnabled).toBe(false);
      expect(settings.shareBrowser).toBe(false);
    });

    it("preserves consent log and appends deletion event", async () => {
      await updateSetting(db, "contributionEnabled", true);
      await deleteAllLocalData(db);

      const settings = await getSettings(db);
      // Should have: opted_in + data_deleted
      expect(settings.consentLog.length).toBeGreaterThanOrEqual(2);
      const lastEvent = settings.consentLog[settings.consentLog.length - 1];
      expect(lastEvent.action).toBe("data_deleted");
      expect(lastEvent.detail).toBe("All local data deleted");
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/lib/settings.test.ts`
Expected: FAIL — module `@/lib/settings` not found

- [ ] **Step 4: Implement `lib/settings.ts`**

Create `lib/settings.ts`:

```typescript
import type { ChookCheckDB } from "./db";
import type { UserSettings, ConsentEvent } from "./types";
import { initDefaults } from "./store";

export async function getSettings(db: ChookCheckDB): Promise<UserSettings> {
  let stored = await db.userSettings.get("default");
  if (!stored) {
    await initDefaults(db);
    stored = await db.userSettings.get("default");
  }

  // Strip the Dexie `key` field
  const { key: _, ...settings } = stored!;
  return settings;
}

const TOGGLE_LABELS: Record<string, string> = {
  shareBrowser: "Share Browser",
  shareState: "Share State",
  shareCity: "Share City",
  shareStore: "Share Store",
  linkAccount: "Link Account",
};

export async function updateSetting(
  db: ChookCheckDB,
  settingKey: keyof UserSettings,
  value: boolean,
): Promise<void> {
  const current = await getSettings(db);

  let action: ConsentEvent["action"];
  let detail: string;

  if (settingKey === "contributionEnabled") {
    action = value ? "opted_in" : "opted_out";
    detail = value ? "Contribution enabled" : "Contribution disabled";
  } else {
    action = "toggle_changed";
    const label = TOGGLE_LABELS[settingKey] ?? settingKey;
    detail = `${label} turned ${value ? "on" : "off"}`;
  }

  const event: ConsentEvent = {
    action,
    detail,
    timestamp: new Date().toISOString(),
  };

  const updates: Partial<UserSettings> = {
    [settingKey]: value,
    consentLog: [...current.consentLog, event],
  };

  // Generate contributorId on first opt-in
  if (settingKey === "contributionEnabled" && value && !current.contributorId) {
    updates.contributorId = crypto.randomUUID();
  }

  // Manage contributorIdMode based on linkAccount
  if (settingKey === "linkAccount") {
    updates.contributorIdMode = value ? "account_linked" : "anonymous";
  }

  await db.userSettings.update("default", updates);
}

export async function deleteAllLocalData(db: ChookCheckDB): Promise<void> {
  // Preserve existing consent log
  const current = await getSettings(db);
  const preservedLog = [...current.consentLog];

  // Clear observations
  await db.priceObservations.clear();

  // Reset settings to defaults but keep consent log
  await db.userSettings.update("default", {
    contributionEnabled: false,
    contributorId: "",
    contributorIdMode: "anonymous" as const,
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    linkAccount: false,
    consentLog: [
      ...preservedLog,
      {
        action: "data_deleted" as const,
        detail: "All local data deleted",
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/lib/settings.test.ts`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/settings.ts test/lib/settings.test.ts
git commit -m "feat: add settings module with consent logging and data deletion"
```

---

### Task 2: ToggleSwitch component

**Files:**
- Create: `components/settings/ToggleSwitch.tsx`
- Create: `components/settings/ToggleSwitch.module.css`

No unit tests — this is a pure presentational component tested indirectly through the ContributionSection tests.

- [ ] **Step 1: Create `ToggleSwitch.module.css`**

Create `components/settings/ToggleSwitch.module.css`:

```css
.track {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: #ccc;
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.2s;
}

.track[aria-checked="true"] {
  background: #1a7a2e;
}

.track:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: left 0.2s;
}

.track[aria-checked="true"] .thumb {
  left: 22px;
}
```

- [ ] **Step 2: Create `ToggleSwitch.tsx`**

Create `components/settings/ToggleSwitch.tsx`:

```tsx
import styles from "./ToggleSwitch.module.css";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.track}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx wxt build --browser chrome`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add components/settings/ToggleSwitch.tsx components/settings/ToggleSwitch.module.css
git commit -m "feat: add reusable ToggleSwitch component"
```

---

### Task 3: ContributionSection component

**Files:**
- Create: `components/settings/ContributionSection.tsx`
- Create: `components/settings/ContributionSection.module.css`
- Create: `test/components/settings/settings.test.tsx`

This task also sets up the shared test file with mocks that will be reused by subsequent tasks.

- [ ] **Step 1: Create the test file with mocks and ContributionSection tests**

Create `test/components/settings/settings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContributionSection } from "@/components/settings/ContributionSection";
import type { UserSettings } from "@/lib/types";

// Stub the WXT `browser` global used by components (getURL, getManifest)
beforeAll(() => {
  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => path,
      getManifest: () => ({ version: "0.1.0" }),
    },
  });
});

// Mock the db module
vi.mock("@/lib/db", () => ({
  db: {},
}));

// Mock settings module
vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    contributionEnabled: false,
    contributorId: "",
    contributorIdMode: "anonymous",
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    linkAccount: false,
    consentLog: [],
  }),
  updateSetting: vi.fn().mockResolvedValue(undefined),
  deleteAllLocalData: vi.fn().mockResolvedValue(undefined),
}));

// Mock data functions
vi.mock("@/lib/data", () => ({
  getStorageStats: vi.fn().mockResolvedValue({
    totalObservations: 0,
    distinctProducts: 0,
    oldestDate: null,
    newestDate: null,
    byChain: {},
  }),
}));

const defaultSettings: UserSettings = {
  contributionEnabled: false,
  contributorId: "",
  contributorIdMode: "anonymous",
  shareBrowser: false,
  shareState: false,
  shareCity: false,
  shareStore: false,
  linkAccount: false,
  consentLog: [],
};

describe("ContributionSection", () => {
  it("renders main toggle and all 5 context toggles", () => {
    render(
      <ContributionSection settings={defaultSettings} onToggle={() => {}} />,
    );
    // 6 total switches: 1 main + 5 context
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(6);
  });

  it("renders context toggle labels", () => {
    render(
      <ContributionSection settings={defaultSettings} onToggle={() => {}} />,
    );
    expect(screen.getByText("Browser")).toBeDefined();
    expect(screen.getByText("State")).toBeDefined();
    expect(screen.getByText("City / Region")).toBeDefined();
    expect(screen.getByText("Specific store")).toBeDefined();
    expect(screen.getByText("Link supermarket account")).toBeDefined();
  });

  it("disables context toggles when contribution is off", () => {
    render(
      <ContributionSection settings={defaultSettings} onToggle={() => {}} />,
    );
    const switches = screen.getAllByRole("switch");
    // First switch is main toggle (enabled), rest are context (disabled)
    expect(switches[0].hasAttribute("disabled")).toBe(false);
    for (let i = 1; i < switches.length; i++) {
      expect(switches[i].hasAttribute("disabled")).toBe(true);
    }
  });

  it("enables context toggles when contribution is on", () => {
    const settings = { ...defaultSettings, contributionEnabled: true };
    render(
      <ContributionSection settings={settings} onToggle={() => {}} />,
    );
    const switches = screen.getAllByRole("switch");
    for (const toggle of switches) {
      expect(toggle.hasAttribute("disabled")).toBe(false);
    }
  });

  it("calls onToggle when main toggle is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ContributionSection settings={defaultSettings} onToggle={onToggle} />,
    );
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    expect(onToggle).toHaveBeenCalledWith("contributionEnabled", true);
  });

  it("renders what gets shared info box", () => {
    render(
      <ContributionSection settings={defaultSettings} onToggle={() => {}} />,
    );
    expect(screen.getByText(/what gets shared/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/settings/settings.test.tsx`
Expected: FAIL — module `@/components/settings/ContributionSection` not found

- [ ] **Step 3: Create `ContributionSection.module.css`**

Create `components/settings/ContributionSection.module.css`:

```css
.toggleCard {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.toggleRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggleLabel {
  font-weight: 600;
  font-size: 14px;
}

.toggleDescription {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}

.infoBox {
  background: #f0faf2;
  border: 1px solid #c8e6c9;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.infoTitle {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  color: #1a7a2e;
}

.infoText {
  font-size: 12px;
  color: #444;
  line-height: 1.6;
}

.contextTitle {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 12px;
}

.contextGroup {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.contextItem {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.contextItem:last-child {
  border-bottom: none;
}

.contextLabel {
  font-weight: 500;
  font-size: 13px;
}

.contextDescription {
  color: #888;
  font-size: 11px;
}
```

- [ ] **Step 4: Create `ContributionSection.tsx`**

Create `components/settings/ContributionSection.tsx`:

```tsx
import type { UserSettings } from "@/lib/types";
import { ToggleSwitch } from "./ToggleSwitch";
import styles from "./ContributionSection.module.css";

interface ContributionSectionProps {
  settings: UserSettings;
  onToggle: (key: keyof UserSettings, value: boolean) => void;
}

const CONTEXT_TOGGLES: {
  key: keyof UserSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "shareBrowser",
    label: "Browser",
    description:
      "e.g. Chrome, Firefox — helps detect browser-based price differences",
  },
  {
    key: "shareState",
    label: "State",
    description: "e.g. VIC, NSW — helps detect regional pricing",
  },
  {
    key: "shareCity",
    label: "City / Region",
    description: "e.g. Melbourne, Perth — helps detect city-level pricing",
  },
  {
    key: "shareStore",
    label: "Specific store",
    description: "e.g. Coles Fitzroy — helps detect store-level pricing",
  },
  {
    key: "linkAccount",
    label: "Link supermarket account",
    description:
      "Hashed email — enables cross-device personalisation detection",
  },
];

export function ContributionSection({
  settings,
  onToggle,
}: ContributionSectionProps) {
  return (
    <div>
      <div className={styles.toggleCard}>
        <div className={styles.toggleRow}>
          <div>
            <div className={styles.toggleLabel}>Contribute price data</div>
            <div className={styles.toggleDescription}>
              Share the prices you see with the Chook Check community
            </div>
          </div>
          <ToggleSwitch
            checked={settings.contributionEnabled}
            onChange={(v) => onToggle("contributionEnabled", v)}
          />
        </div>
      </div>

      <div className={styles.infoBox}>
        <div className={styles.infoTitle}>
          What gets shared when you contribute
        </div>
        <div className={styles.infoText}>
          Product name, brand, price, unit price, store chain, and when you saw
          it.
          <br />A random anonymous ID (not linked to you in any way).
        </div>
      </div>

      <div className={styles.contextTitle}>
        Optional context (more detail = better community insights)
      </div>

      <div className={styles.contextGroup}>
        {CONTEXT_TOGGLES.map((toggle) => (
          <div key={toggle.key} className={styles.contextItem}>
            <div>
              <div className={styles.contextLabel}>{toggle.label}</div>
              <div className={styles.contextDescription}>
                {toggle.description}
              </div>
            </div>
            <ToggleSwitch
              checked={settings[toggle.key] as boolean}
              onChange={(v) => onToggle(toggle.key, v)}
              disabled={!settings.contributionEnabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/components/settings/settings.test.tsx`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add components/settings/ContributionSection.tsx components/settings/ContributionSection.module.css test/components/settings/settings.test.tsx
git commit -m "feat: add contribution section with main toggle and context toggles"
```

---

### Task 4: Remaining section components

**Files:**
- Create: `components/settings/DataSummarySection.tsx` + `.module.css`
- Create: `components/settings/SharingLogSection.tsx` + `.module.css`
- Create: `components/settings/ConsentHistorySection.tsx` + `.module.css`
- Create: `components/settings/DataManagementSection.tsx` + `.module.css`
- Create: `components/settings/AboutSection.tsx` + `.module.css`
- Add tests to: `test/components/settings/settings.test.tsx`

- [ ] **Step 1: Add failing tests for all remaining sections**

Append the following imports and describe blocks to `test/components/settings/settings.test.tsx`:

```tsx
// Add these imports at the top alongside existing imports:
import { DataSummarySection } from "@/components/settings/DataSummarySection";
import { SharingLogSection } from "@/components/settings/SharingLogSection";
import { ConsentHistorySection } from "@/components/settings/ConsentHistorySection";
import { DataManagementSection } from "@/components/settings/DataManagementSection";
import { AboutSection } from "@/components/settings/AboutSection";
import type { ConsentEvent } from "@/lib/types";

// Append these describe blocks at the end:

describe("DataSummarySection", () => {
  it("renders stats cards", () => {
    render(
      <DataSummarySection
        stats={{ totalObservations: 42, distinctProducts: 7, newestDate: null }}
      />,
    );
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
  });

  it("renders dashboard and export links", () => {
    render(
      <DataSummarySection
        stats={{ totalObservations: 0, distinctProducts: 0, newestDate: null }}
      />,
    );
    expect(screen.getByText(/view in dashboard/i)).toBeDefined();
    expect(screen.getByText(/export data/i)).toBeDefined();
  });
});

describe("SharingLogSection", () => {
  it("renders empty state", () => {
    render(<SharingLogSection />);
    expect(screen.getByText(/no data has been shared/i)).toBeDefined();
  });
});

describe("ConsentHistorySection", () => {
  it("renders empty state when no events", () => {
    render(<ConsentHistorySection consentLog={[]} />);
    expect(screen.getByText(/no consent events/i)).toBeDefined();
  });

  it("renders consent events in reverse order", () => {
    const events: ConsentEvent[] = [
      {
        action: "opted_in",
        detail: "Contribution enabled",
        timestamp: "2026-03-20T10:00:00Z",
      },
      {
        action: "toggle_changed",
        detail: "Share Browser turned on",
        timestamp: "2026-03-21T10:00:00Z",
      },
    ];
    render(<ConsentHistorySection consentLog={events} />);
    const items = screen.getAllByText(/contribution enabled|share browser/i);
    // Newest first: "Share Browser turned on" before "Contribution enabled"
    expect(items[0].textContent).toContain("Share Browser turned on");
    expect(items[1].textContent).toContain("Contribution enabled");
  });
});

describe("DataManagementSection", () => {
  it("renders delete local data button", () => {
    render(<DataManagementSection onDataDeleted={() => {}} />);
    expect(
      screen.getByRole("button", { name: /delete all local data/i }),
    ).toBeDefined();
  });

  it("renders disabled server deletion button", () => {
    render(<DataManagementSection onDataDeleted={() => {}} />);
    const btn = screen.getByRole("button", { name: /request server deletion/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});

describe("AboutSection", () => {
  it("renders version info", () => {
    render(<AboutSection />);
    expect(screen.getByText(/chook check/i)).toBeDefined();
  });

  it("renders GitHub link", () => {
    render(<AboutSection />);
    expect(screen.getByText(/github/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/settings/settings.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 3: Create `DataSummarySection.module.css`**

Create `components/settings/DataSummarySection.module.css`:

```css
.statsGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.statCard {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.statValue {
  font-size: 24px;
  font-weight: 700;
}

.statLabel {
  font-size: 11px;
  color: #666;
}

.links {
  display: flex;
  gap: 16px;
}

.link {
  color: #1a7a2e;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Create `DataSummarySection.tsx`**

Create `components/settings/DataSummarySection.tsx`:

```tsx
import { formatRelativeTime } from "@/components/shared/formatTime";
import styles from "./DataSummarySection.module.css";

interface DataSummarySectionProps {
  stats: {
    totalObservations: number;
    distinctProducts: number;
    newestDate: string | null;
  };
}

function getExtensionUrl(path: string): string {
  try {
    return browser.runtime.getURL(path);
  } catch {
    return `#${path}`;
  }
}

export function DataSummarySection({ stats }: DataSummarySectionProps) {
  return (
    <div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.distinctProducts}</div>
          <div className={styles.statLabel}>Products tracked</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.totalObservations}</div>
          <div className={styles.statLabel}>Price observations</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {stats.newestDate ? formatRelativeTime(stats.newestDate) : "—"}
          </div>
          <div className={styles.statLabel}>Last observation</div>
        </div>
      </div>
      <div className={styles.links}>
        <a href={getExtensionUrl("/dashboard.html")} className={styles.link}>
          View in Dashboard →
        </a>
        <a href={getExtensionUrl("/dashboard.html")} className={styles.link}>
          Export data →
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `SharingLogSection.module.css`**

Create `components/settings/SharingLogSection.module.css`:

```css
.emptyState {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  color: #888;
  font-size: 13px;
}
```

- [ ] **Step 6: Create `SharingLogSection.tsx`**

Create `components/settings/SharingLogSection.tsx`:

```tsx
import styles from "./SharingLogSection.module.css";

export function SharingLogSection() {
  return (
    <div className={styles.emptyState}>
      No data has been shared yet. Enable contribution above to start helping
      the community.
    </div>
  );
}
```

- [ ] **Step 7: Create `ConsentHistorySection.module.css`**

Create `components/settings/ConsentHistorySection.module.css`:

```css
.list {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.item {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.item:last-child {
  border-bottom: none;
}

.detail {
  font-size: 13px;
  font-weight: 500;
}

.timestamp {
  font-size: 11px;
  color: #888;
  flex-shrink: 0;
  margin-left: 16px;
}

.emptyState {
  color: #888;
  font-size: 13px;
  padding: 16px 0;
}
```

- [ ] **Step 8: Create `ConsentHistorySection.tsx`**

Create `components/settings/ConsentHistorySection.tsx`:

```tsx
import type { ConsentEvent } from "@/lib/types";
import styles from "./ConsentHistorySection.module.css";

interface ConsentHistorySectionProps {
  consentLog: ConsentEvent[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConsentHistorySection({
  consentLog,
}: ConsentHistorySectionProps) {
  if (consentLog.length === 0) {
    return <p className={styles.emptyState}>No consent events recorded.</p>;
  }

  const reversed = [...consentLog].reverse();

  return (
    <div className={styles.list}>
      {reversed.map((event, i) => (
        <div key={i} className={styles.item}>
          <span className={styles.detail}>{event.detail}</span>
          <span className={styles.timestamp}>
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Create `DataManagementSection.module.css`**

Create `components/settings/DataManagementSection.module.css`:

```css
.buttons {
  display: flex;
  gap: 12px;
}

.deleteButton {
  padding: 10px 20px;
  font-size: 13px;
  border: 1px solid #d32f2f;
  color: #d32f2f;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}

.deleteButton:hover {
  background: #fef2f2;
}

.serverButton {
  padding: 10px 20px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  color: #666;
  background: #fff;
  border-radius: 6px;
  cursor: not-allowed;
  opacity: 0.6;
}

.hint {
  font-size: 11px;
  color: #888;
  margin-top: 8px;
}
```

- [ ] **Step 10: Create `DataManagementSection.tsx`**

Create `components/settings/DataManagementSection.tsx`:

```tsx
import { db } from "@/lib/db";
import { deleteAllLocalData } from "@/lib/settings";
import styles from "./DataManagementSection.module.css";

interface DataManagementSectionProps {
  onDataDeleted: () => void;
}

export function DataManagementSection({
  onDataDeleted,
}: DataManagementSectionProps) {
  async function handleDelete() {
    const confirmed = window.confirm(
      "This will permanently delete all your tracked price data. Your consent history will be preserved. Continue?",
    );
    if (!confirmed) return;

    await deleteAllLocalData(db);
    onDataDeleted();
  }

  return (
    <div>
      <div className={styles.buttons}>
        <button className={styles.deleteButton} onClick={handleDelete}>
          Delete all local data
        </button>
        <button className={styles.serverButton} disabled>
          Request server deletion
        </button>
      </div>
      <p className={styles.hint}>
        Server deletion will be available after you've contributed data.
      </p>
    </div>
  );
}
```

- [ ] **Step 11: Create `AboutSection.module.css`**

Create `components/settings/AboutSection.module.css`:

```css
.text {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  margin-bottom: 12px;
}

.link {
  color: #1a7a2e;
  font-size: 13px;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 12: Create `AboutSection.tsx`**

Create `components/settings/AboutSection.tsx`:

```tsx
import styles from "./AboutSection.module.css";

function getVersion(): string {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return "dev";
  }
}

export function AboutSection() {
  return (
    <div>
      <p className={styles.text}>
        Chook Check v{getVersion()}
        <br />
        Helping Australians track supermarket prices and spot unfair pricing.
      </p>
      <a
        href="https://github.com/mdryan/chook-check"
        className={styles.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on GitHub →
      </a>
    </div>
  );
}
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `npx vitest run test/components/settings/settings.test.tsx`
Expected: all pass

- [ ] **Step 14: Commit**

```bash
git add components/settings/DataSummarySection.tsx components/settings/DataSummarySection.module.css components/settings/SharingLogSection.tsx components/settings/SharingLogSection.module.css components/settings/ConsentHistorySection.tsx components/settings/ConsentHistorySection.module.css components/settings/DataManagementSection.tsx components/settings/DataManagementSection.module.css components/settings/AboutSection.tsx components/settings/AboutSection.module.css test/components/settings/settings.test.tsx
git commit -m "feat: add data summary, sharing log, consent history, data management, and about sections"
```

---

### Task 5: SettingsPage layout and App wiring

**Files:**
- Create: `components/settings/SettingsPage.tsx`
- Create: `components/settings/SettingsPage.module.css`
- Modify: `entrypoints/options/App.tsx`
- Modify: `entrypoints/options/index.html`
- Add tests to: `test/components/settings/settings.test.tsx`

- [ ] **Step 1: Add failing tests for SettingsPage**

Add the following import and describe block to `test/components/settings/settings.test.tsx`:

```tsx
// Add this import at the top:
import { SettingsPage } from "@/components/settings/SettingsPage";

// Append this describe block at the end:
describe("SettingsPage", () => {
  it("renders all section headings", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("Contribution")).toBeDefined();
    expect(screen.getByText(/what's stored locally/i)).toBeDefined();
    expect(screen.getByText("Sharing log")).toBeDefined();
    expect(screen.getByText("Consent history")).toBeDefined();
    expect(screen.getByText("Data management")).toBeDefined();
    expect(screen.getByText("About")).toBeDefined();
  });

  it("renders sidebar navigation", async () => {
    render(<SettingsPage />);
    expect(await screen.findByRole("navigation")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/components/settings/settings.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `SettingsPage.module.css`**

Create `components/settings/SettingsPage.module.css`:

```css
.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 200px;
  min-width: 200px;
  background: #f8f8f8;
  border-right: 1px solid #e0e0e0;
  padding: 20px 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebarTitle {
  padding: 0 16px 16px;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.navLink {
  display: block;
  padding: 8px 16px;
  color: #666;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
  border-left: 3px solid transparent;
  background: none;
  border-top: none;
  border-bottom: none;
  border-right: none;
  width: 100%;
  text-align: left;
  font-family: inherit;
}

.navLink:hover {
  color: #1a1a1a;
}

.navLinkActive {
  color: #1a7a2e;
  font-weight: 500;
  border-left-color: #1a7a2e;
  background: rgba(26, 122, 46, 0.05);
}

.main {
  flex: 1;
  padding: 24px 32px;
  max-width: 720px;
}

.section {
  margin-bottom: 40px;
}

.sectionHeading {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}

.sectionDescription {
  color: #666;
  margin: 0 0 20px;
  font-size: 13px;
}

.loading {
  color: #888;
  font-size: 14px;
  padding: 24px;
}
```

- [ ] **Step 4: Create `SettingsPage.tsx`**

Create `components/settings/SettingsPage.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/db";
import { getSettings, updateSetting } from "@/lib/settings";
import { getStorageStats } from "@/lib/data";
import type { UserSettings } from "@/lib/types";
import { ContributionSection } from "./ContributionSection";
import { DataSummarySection } from "./DataSummarySection";
import { SharingLogSection } from "./SharingLogSection";
import { ConsentHistorySection } from "./ConsentHistorySection";
import { DataManagementSection } from "./DataManagementSection";
import { AboutSection } from "./AboutSection";
import styles from "./SettingsPage.module.css";

interface StorageStats {
  totalObservations: number;
  distinctProducts: number;
  newestDate: string | null;
}

const SECTIONS = [
  { id: "contribution", label: "Contribution" },
  { id: "data-summary", label: "Data Summary" },
  { id: "sharing-log", label: "Sharing Log" },
  { id: "consent-history", label: "Consent History" },
  { id: "data-management", label: "Data Management" },
  { id: "about", label: "About" },
] as const;

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [stats, setStats] = useState<StorageStats>({
    totalObservations: 0,
    distinctProducts: 0,
    newestDate: null,
  });
  const [activeSection, setActiveSection] = useState<string>("contribution");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const loadData = useCallback(async () => {
    const [s, st] = await Promise.all([getSettings(db), getStorageStats(db)]);
    setSettings(s);
    setStats({
      totalObservations: st.totalObservations,
      distinctProducts: st.distinctProducts,
      newestDate: st.newestDate,
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (!el) continue;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(section.id);
          }
        },
        { threshold: 0.3 },
      );
      observer.observe(el);
      observers.push(observer);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [settings]);

  async function handleToggle(key: keyof UserSettings, value: boolean) {
    await updateSetting(db, key, value);
    const updated = await getSettings(db);
    setSettings(updated);
  }

  function handleNavClick(sectionId: string) {
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth" });
  }

  if (!settings) {
    return <p className={styles.loading}>Loading...</p>;
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}>Chook Check</div>
        <nav role="navigation">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`${styles.navLink} ${activeSection === section.id ? styles.navLinkActive : ""}`}
              onClick={() => handleNavClick(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.main}>
        <section
          id="contribution"
          className={styles.section}
          ref={(el) => { sectionRefs.current["contribution"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Contribution</h2>
          <p className={styles.sectionDescription}>
            Help other Australians spot unfair pricing by sharing your price
            observations.
          </p>
          <ContributionSection settings={settings} onToggle={handleToggle} />
        </section>

        <section
          id="data-summary"
          className={styles.section}
          ref={(el) => { sectionRefs.current["data-summary"] = el; }}
        >
          <h2 className={styles.sectionHeading}>What's stored locally</h2>
          <p className={styles.sectionDescription}>
            All your data stays on your device unless you opt in to
            contributing.
          </p>
          <DataSummarySection stats={stats} />
        </section>

        <section
          id="sharing-log"
          className={styles.section}
          ref={(el) => { sectionRefs.current["sharing-log"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Sharing log</h2>
          <p className={styles.sectionDescription}>
            A record of every batch of observations sent to the community API.
          </p>
          <SharingLogSection />
        </section>

        <section
          id="consent-history"
          className={styles.section}
          ref={(el) => { sectionRefs.current["consent-history"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Consent history</h2>
          <p className={styles.sectionDescription}>
            Every change to your privacy settings is recorded here.
          </p>
          <ConsentHistorySection consentLog={settings.consentLog} />
        </section>

        <section
          id="data-management"
          className={styles.section}
          ref={(el) => { sectionRefs.current["data-management"] = el; }}
        >
          <h2 className={styles.sectionHeading}>Data management</h2>
          <p className={styles.sectionDescription}>
            Delete your data locally or request server-side deletion.
          </p>
          <DataManagementSection onDataDeleted={loadData} />
        </section>

        <section
          id="about"
          className={styles.section}
          ref={(el) => { sectionRefs.current["about"] = el; }}
        >
          <h2 className={styles.sectionHeading}>About</h2>
          <AboutSection />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Update `entrypoints/options/App.tsx`**

Replace `entrypoints/options/App.tsx`:

```tsx
import { SettingsPage } from "@/components/settings/SettingsPage";

export default function App() {
  return <SettingsPage />;
}
```

- [ ] **Step 6: Update `entrypoints/options/index.html`**

Replace `entrypoints/options/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chook Check — Settings</title>
    <meta name="manifest.open_in_tab" content="true" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #1a1a1a;
        background: #fafafa;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run test/components/settings/settings.test.tsx`
Expected: all pass

- [ ] **Step 8: Run full test suite and build**

Run: `npx vitest run && npx wxt build --browser chrome`
Expected: all tests pass, build succeeds

- [ ] **Step 9: Commit**

```bash
git add components/settings/SettingsPage.tsx components/settings/SettingsPage.module.css entrypoints/options/App.tsx entrypoints/options/index.html test/components/settings/settings.test.tsx
git commit -m "feat: add settings page layout with sidebar navigation and all sections"
```

---

## Post-implementation checklist

After all 5 tasks are complete:

1. Run full test suite: `npx vitest run` — all tests pass
2. Run lint: `npx eslint .` — no errors
3. Build Chrome: `npx wxt build` — success
4. Build Firefox: `npx wxt build -b firefox` — success
5. Manual test in Chrome:
   - Load extension, click popup → Settings link opens options page
   - Sidebar navigation scrolls to correct sections
   - Active section highlights in sidebar while scrolling
   - Main contribution toggle works, context toggles disable when off
   - Toggle changes appear in consent history section
   - Data summary shows correct stats
   - Sharing log shows empty state
   - "Delete all local data" prompts confirmation, clears data, refreshes stats
   - "Request server deletion" button is disabled
   - About section shows version
6. Verify no console errors on the options page
