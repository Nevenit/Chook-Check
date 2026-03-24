import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContributionSection } from "@/components/settings/ContributionSection";
import { DataSummarySection } from "@/components/settings/DataSummarySection";
import { SharingLogSection } from "@/components/settings/SharingLogSection";
import { ConsentHistorySection } from "@/components/settings/ConsentHistorySection";
import { DataManagementSection } from "@/components/settings/DataManagementSection";
import { AboutSection } from "@/components/settings/AboutSection";
import { SettingsPage } from "@/components/settings/SettingsPage";
import type { UserSettings, ConsentEvent } from "@/lib/types";

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
  db: {
    sharingLog: { toArray: vi.fn().mockResolvedValue([]) },
  },
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
    onboardingDismissed: false,
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
  onboardingDismissed: false,
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
    render(<SharingLogSection events={[]} />);
    expect(screen.getByText(/no data has been shared/i)).toBeDefined();
  });

  it("renders sharing events", () => {
    const events = [
      { id: 1, timestamp: "2026-03-24T10:00:00Z", observationCount: 5, status: "success" as const },
      { id: 2, timestamp: "2026-03-24T11:00:00Z", observationCount: 3, status: "error" as const, errorMessage: "Network error" },
    ];
    render(<SharingLogSection events={events} />);
    expect(screen.getByText(/5 observations/)).toBeDefined();
    expect(screen.getByText(/Network error/)).toBeDefined();
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
    render(<DataManagementSection onDataDeleted={() => {}} contributorId="" />);
    expect(
      screen.getByRole("button", { name: /delete all local data/i }),
    ).toBeDefined();
  });

  it("renders disabled server deletion button when no contributorId", () => {
    render(<DataManagementSection onDataDeleted={() => {}} contributorId="" />);
    const btn = screen.getByRole("button", { name: /request server deletion/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("renders enabled server deletion button when contributorId exists", () => {
    render(
      <DataManagementSection
        onDataDeleted={() => {}}
        contributorId="00000000-0000-0000-0000-000000000001"
      />,
    );
    const btn = screen.getByRole("button", { name: /request server deletion/i });
    expect(btn.hasAttribute("disabled")).toBe(false);
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

describe("SettingsPage", () => {
  it("renders all section headings", async () => {
    render(<SettingsPage />);
    // "Contribution" and "About" appear in both sidebar and headings
    const contributions = await screen.findAllByText("Contribution");
    expect(contributions.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/what's stored locally/i)).toBeDefined();
    expect(screen.getAllByText("Sharing log").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Consent history").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Data management").length).toBeGreaterThanOrEqual(1);
    const abouts = screen.getAllByText("About");
    expect(abouts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders sidebar navigation", async () => {
    render(<SettingsPage />);
    expect(await screen.findByRole("navigation")).toBeDefined();
  });
});
