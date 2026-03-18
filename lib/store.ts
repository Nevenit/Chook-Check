import type { ChookCheckDB } from "./db";
import type { PriceObservation } from "./types";

/**
 * Computes the UTC calendar day boundaries for a given ISO timestamp.
 * Deduplication is keyed on UTC date so that two observations on the same
 * UTC calendar day are treated as the same day regardless of local timezone.
 */
function getUtcDayBounds(isoTimestamp: string): {
  start: string;
  end: string;
} {
  const date = new Date(isoTimestamp);
  const dayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayEnd = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ),
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
    const { start, end } = getUtcDayBounds(obs.observedAt);

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
