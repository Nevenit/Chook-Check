import { observationKey, SAMPLE_WINDOW_MS } from "./observation-key";
import type { ChookCheckDB } from "./db";
import type { PriceObservation, UserSettings } from "./types";

/**
 * Retain the first immutable sample for each product/context/UTC hour.
 * Exact ID retries and repeat notifications are idempotent; distinct capture
 * phases, comparison IDs, offers, contexts, and hours remain independent.
 * Return false on persistence failure so inline UI cannot claim a saved baseline.
 */
export async function saveObservation(
  db: ChookCheckDB,
  obs: PriceObservation,
): Promise<boolean> {
  const persist = () =>
    db.transaction("rw", db.priceObservations, async () => {
      if (
        await db.priceObservations
          .where("clientObservationId")
          .equals(obs.clientObservationId)
          .first()
      )
        return;
      const hour =
        Math.floor(Date.parse(obs.observedAt) / SAMPLE_WINDOW_MS) *
        SAMPLE_WINDOW_MS;
      const existing = await db.priceObservations
        .where("[productId+observedAt]")
        .between(
          [obs.productId, new Date(hour).toISOString()],
          [obs.productId, new Date(hour + SAMPLE_WINDOW_MS).toISOString()],
          true,
          false,
        )
        .toArray();
      const key = observationKey(obs);
      if (!existing.some((row) => observationKey(row) === key)) {
        await db.priceObservations.add(obs);
      }
    });

  try {
    await persist();
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.error(
        "[Chook Check] Storage quota exceeded, attempting emergency cleanup",
      );
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        await db.priceObservations
          .where("observedAt")
          .below(cutoff.toISOString())
          .delete();
        await persist();
        return true;
      } catch {
        console.error(
          "[Chook Check] Storage quota exceeded after cleanup, observation dropped",
        );
      }
    } else {
      console.error("[Chook Check] Failed to save observation:", error);
    }
    return false;
  }
}

/** Snapshot only the user context selected for fairness at capture time. */
export async function saveCapturedObservation(
  db: ChookCheckDB,
  observation: PriceObservation,
): Promise<boolean> {
  const settings = await db.userSettings.get("default");
  return saveObservation(db, {
    ...observation,
    userContextAtCapture: settings?.fairnessStudyEnabled
      ? {
          state: settings.shareState ? settings.userState : "",
          city: settings.shareCity ? settings.userCity : "",
          store: settings.shareStore ? settings.userStoreName : "",
        }
      : null,
  });
}

export async function initDefaults(db: ChookCheckDB): Promise<void> {
  const existing = await db.userSettings.get("default");
  if (existing) return;

  await db.userSettings.add({
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
  });
}

export async function saveSettings(
  db: ChookCheckDB,
  settings: Partial<UserSettings>,
): Promise<void> {
  const existing = await db.userSettings.get("default");
  if (!existing) {
    await initDefaults(db);
  }
  await db.userSettings.update("default", settings);
}
