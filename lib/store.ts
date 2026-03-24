import type { ChookCheckDB } from "./db";
import type { PriceObservation, UserSettings } from "./types";

/**
 * Computes the local calendar day boundaries for a given ISO timestamp.
 * Uses the browser's local timezone (correct for Australian users —
 * prices change at local midnight, not UTC midnight).
 */
function getLocalDayBounds(isoTimestamp: string): {
  start: string;
  end: string;
} {
  const date = new Date(isoTimestamp);
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  );
  return {
    start: dayStart.toISOString(),
    end: dayEnd.toISOString(),
  };
}

/**
 * Saves a price observation with deduplication.
 * - Same product + same local day + same price → update observedAt
 * - Same product + same local day + different price → insert new row
 * - No match → insert new row
 *
 * Never throws — logs errors and continues so the scraping pipeline is not broken.
 */
export async function saveObservation(
  db: ChookCheckDB,
  obs: PriceObservation,
): Promise<void> {
  try {
    const { start, end } = getLocalDayBounds(obs.observedAt);

    const existing = await db.priceObservations
      .where("productId")
      .equals(obs.productId)
      .filter((e) => e.observedAt >= start && e.observedAt < end)
      .toArray();

    const samePriceMatch = existing.find(
      (e) => e.priceCents === obs.priceCents,
    );

    if (samePriceMatch) {
      await db.priceObservations.update(samePriceMatch.id!, {
        observedAt: obs.observedAt,
      });
    } else {
      await db.priceObservations.add(obs);
    }
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
        await db.priceObservations.add(obs);
      } catch {
        console.error(
          "[Chook Check] Storage quota exceeded after cleanup, observation dropped",
        );
      }
    } else {
      console.error("[Chook Check] Failed to save observation:", error);
    }
  }
}

export async function initDefaults(db: ChookCheckDB): Promise<void> {
  const existing = await db.userSettings.get("default");
  if (existing) return;

  await db.userSettings.add({
    key: "default",
    contributionEnabled: false,
    contributorId: "",
    contributorIdMode: "anonymous",
    shareBrowser: false,
    shareState: false,
    shareCity: false,
    shareStore: false,
    linkAccount: false,
    onboardingDismissed: false,
    consentLog: [],
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
