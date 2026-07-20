import type { ChookCheckDB } from "./db";
import type {
  ConsentEvent,
  ContributorCredentials,
  PrivacyModeKey,
  UserSettings,
} from "./types";
import { initDefaults } from "./store";

export const CONSENT_VERSION = "2026-07-20-v1";

export const MODE_DISCLOSURES: Record<PrivacyModeKey, string> = {
  communityDownloadsEnabled:
    "Downloads a bulk community price snapshot from Chook Check. The service and Cloudflare can receive your IP address and request metadata; no retailer page or product ID is sent.",
  historyContributionEnabled:
    "Uploads pseudonymous product, price, offer, surface, extraction, and time observations. Page URLs, account identifiers, cart contents, and precise location are never uploaded.",
  fairnessStudyEnabled:
    "Uploads the history fields plus selected coarse region/store context, fulfilment, sign-in state, loyalty eligibility, instrument mode, and browser family only if separately enabled. No email, username, loyalty number, or credential is collected.",
  inlineOverlayEnabled:
    "Allows you to place Chook Check UI into a retailer page from the toolbar. Retailer scripts can detect page changes made by any inline extension UI; this mode does not itself enable Chook Check network access.",
};

export async function getSettings(db: ChookCheckDB): Promise<UserSettings> {
  let stored = await db.userSettings.get("default");
  if (!stored) {
    await initDefaults(db);
    stored = await db.userSettings.get("default");
  }

  const { key, ...settings } = stored!;
  void key;
  return settings;
}

const TOGGLE_LABELS: Record<string, string> = {
  communityDownloadsEnabled: "Community snapshot downloads",
  historyContributionEnabled: "History contribution",
  fairnessStudyEnabled: "Fairness study",
  inlineOverlayEnabled: "Inline overlay",
  shareBrowser: "Share browser family",
  shareState: "Share state",
  shareCity: "Share city/region",
  shareStore: "Share store",
};

export async function updateSetting(
  db: ChookCheckDB,
  settingKey: keyof UserSettings,
  value: boolean,
): Promise<void> {
  const current = await getSettings(db);
  const isMode = settingKey in MODE_DISCLOSURES;
  const mode = isMode ? (settingKey as PrivacyModeKey) : undefined;

  const event: ConsentEvent = {
    action: isMode ? (value ? "opted_in" : "opted_out") : "toggle_changed",
    detail: `${TOGGLE_LABELS[settingKey] ?? settingKey} ${value ? "enabled" : "disabled"}`,
    timestamp: new Date().toISOString(),
    ...(mode
      ? {
          mode,
          consentVersion: CONSENT_VERSION,
          disclosureText: MODE_DISCLOSURES[mode],
        }
      : {}),
  };

  const updates: Partial<UserSettings> = {
    [settingKey]: value,
    consentLog: [...current.consentLog, event],
  };

  if (isMode) {
    updates.consentVersion = CONSENT_VERSION;
    updates.reconsentRequired = false;
  }

  await db.userSettings.update("default", updates);
}

export async function saveContributorCredentials(
  db: ChookCheckDB,
  credentials: ContributorCredentials,
): Promise<void> {
  await db.userSettings.update("default", {
    contributorId: credentials.contributorId,
    submitToken: credentials.submitToken,
    deletionToken: credentials.deletionToken,
  });
}

export async function updateUserContext(
  db: ChookCheckDB,
  key: "userState" | "userCity" | "userStoreName",
  value: string,
): Promise<void> {
  if (key === "userState") {
    await db.userSettings.update("default", { userState: value });
  } else if (key === "userCity") {
    await db.userSettings.update("default", { userCity: value });
  } else {
    await db.userSettings.update("default", { userStoreName: value });
  }
}

export async function clearPriceHistory(db: ChookCheckDB): Promise<void> {
  await db.priceObservations.clear();
}

export async function clearLocalLogs(db: ChookCheckDB): Promise<void> {
  await db.sharingLog.clear();
  await db.userSettings.update("default", { consentLog: [] });
}

export async function deleteAllLocalData(db: ChookCheckDB): Promise<void> {
  const current = await getSettings(db);
  await db.transaction(
    "rw",
    [
      db.priceObservations,
      db.sharingLog,
      db.communitySnapshots,
      db.userSettings,
    ],
    async () => {
      await Promise.all([
        db.priceObservations.clear(),
        db.sharingLog.clear(),
        db.communitySnapshots.clear(),
      ]);
      await db.userSettings.put({
        key: "default",
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
        pendingServerDeletion: current.pendingServerDeletion,
        shareBrowser: false,
        shareState: false,
        shareCity: false,
        shareStore: false,
        onboardingDismissed: false,
        userState: "",
        userCity: "",
        userStoreName: "",
        consentLog: [
          {
            action: "data_deleted",
            detail: "All local Chook Check data reset",
            timestamp: new Date().toISOString(),
          },
        ],
        communitySnapshotSyncedAt: "",
      });
    },
  );
}
