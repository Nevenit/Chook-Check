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
  const current = await getSettings(db);
  const preservedLog = [...current.consentLog];

  await db.priceObservations.clear();

  await db.userSettings.update("default", {
    contributionEnabled: false,
    contributorId: "",
    contributorIdMode: "anonymous" as const,
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    linkAccount: false,
    onboardingDismissed: false,
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
