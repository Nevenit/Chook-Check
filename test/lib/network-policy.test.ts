import { describe, expect, it } from "vitest";
import { CONSENT_VERSION } from "@/lib/settings";
import { isNetworkActionAllowed } from "@/lib/network-policy";
import type { UserSettings } from "@/lib/types";

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    communityDownloadsEnabled: false,
    historyContributionEnabled: false,
    fairnessStudyEnabled: false,
    inlineOverlayEnabled: false,
    consentVersion: "",
    reconsentRequired: false,
    contributorId: "",
    submitToken: "",
    deletionToken: "",
    legacyContributorId: "",
    pendingServerDeletion: null,
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    onboardingDismissed: false,
    userState: "",
    userCity: "",
    userStoreName: "",
    consentLog: [],
    communitySnapshotSyncedAt: "",
    ...overrides,
  };
}

describe("network policy", () => {
  it("denies every Chook network feature by default", () => {
    const defaults = settings();
    expect(isNetworkActionAllowed(defaults, "download_snapshot")).toBe(false);
    expect(isNetworkActionAllowed(defaults, "submit_history")).toBe(false);
    expect(isNetworkActionAllowed(defaults, "submit_fairness")).toBe(false);
    expect(
      isNetworkActionAllowed(defaults, "register_contributor", {
        userInitiated: true,
      }),
    ).toBe(false);
  });

  it("requires current versioned consent and the matching independent mode", () => {
    const optedIn = settings({
      consentVersion: CONSENT_VERSION,
      communityDownloadsEnabled: true,
    });
    expect(isNetworkActionAllowed(optedIn, "download_snapshot")).toBe(true);
    expect(isNetworkActionAllowed(optedIn, "submit_history")).toBe(false);
  });

  it("pauses upgraded legacy contributors pending reconsent", () => {
    const upgraded = settings({
      consentVersion: CONSENT_VERSION,
      historyContributionEnabled: true,
      reconsentRequired: true,
    });
    expect(isNetworkActionAllowed(upgraded, "submit_history")).toBe(false);
  });

  it("requires explicit user initiation for first registration", () => {
    const optedIn = settings({
      consentVersion: CONSENT_VERSION,
      historyContributionEnabled: true,
    });
    expect(isNetworkActionAllowed(optedIn, "register_contributor")).toBe(false);
    expect(
      isNetworkActionAllowed(optedIn, "register_contributor", {
        userInitiated: true,
      }),
    ).toBe(true);
  });

  it("allows automatic deletion retry only when a pending deletion exists", () => {
    const pending = settings({
      deletionToken: "secret",
      pendingServerDeletion: {
        contributorId: "id",
        deletionToken: "secret",
        requestedAt: "2026-07-20T00:00:00.000Z",
        lastAttemptAt: "2026-07-20T00:00:00.000Z",
        lastError: "offline",
      },
    });
    expect(
      isNetworkActionAllowed(pending, "delete_contributions", {
        retryPendingDeletion: true,
      }),
    ).toBe(true);
  });
});
