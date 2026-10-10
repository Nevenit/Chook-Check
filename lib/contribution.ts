import type { ChookCheckDB } from "./db";
import { getSettings } from "./settings";
import { isNetworkActionAllowed } from "./network-policy";
import { submitObservations } from "./api";
import type {
  ObservationV2,
  PriceObservation,
  SubmitRequestV2,
  UserSettings,
} from "./types";

const BATCH_SIZE = 50;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const submissions = new WeakMap<ChookCheckDB, Promise<void>>();

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

export function toV2Observation(
  observation: PriceObservation,
  settings: UserSettings,
  fairness: boolean,
): ObservationV2 {
  return {
    schemaVersion: 2,
    clientObservationId: observation.clientObservationId,
    productId: observation.productId,
    productName: observation.productName,
    brand: observation.brand,
    category: observation.category,
    gtin: observation.gtin,
    storeChain: observation.storeChain,
    currentPriceCents: observation.priceCents,
    regularPriceCents: observation.wasPriceCents,
    unitPriceCents: observation.unitPriceCents,
    unitMeasure: observation.unitMeasure,
    offerType: observation.promoType,
    offerTextNormalized: observation.offerTextNormalized,
    offerId: observation.offerId,
    requiredQuantity: observation.requiredQuantity,
    sourceSurface: observation.sourceSurface,
    extractionSource: observation.extractionSource,
    scraperVersion: observation.scraperVersion,
    instrumentMode: observation.instrumentMode,
    capturePhase: observation.capturePhase,
    comparisonId: observation.comparisonId,
    storeId:
      fairness && settings.shareStore
        ? (observation.storeId ?? observation.userContextAtCapture?.store) ||
          null
        : null,
    coarseRegion:
      fairness && (settings.shareState || settings.shareCity)
        ? [
            settings.shareState ? observation.userContextAtCapture?.state : "",
            settings.shareCity ? observation.userContextAtCapture?.city : "",
          ]
            .filter(Boolean)
            .join("/") || null
        : null,
    fulfilmentMode: fairness ? observation.fulfilmentMode : "unknown",
    authState: fairness ? observation.authState : "unknown",
    loyaltyState: fairness ? observation.loyaltyState : "unknown",
    browserFamily: fairness && settings.shareBrowser ? detectBrowser() : null,
    clientObservedAt: observation.observedAt,
  };
}

function contributionMode(
  observation: PriceObservation,
  settings: UserSettings,
): SubmitRequestV2["mode"] | null {
  const hasContext = Boolean(
    (settings.shareStore &&
      (observation.storeId || observation.userContextAtCapture?.store)) ||
    (settings.shareState && observation.userContextAtCapture?.state) ||
    (settings.shareCity && observation.userContextAtCapture?.city),
  );
  if (
    isNetworkActionAllowed(settings, "submit_fairness") &&
    hasContext &&
    !["legacy", "unknown", "2.0.0", "2.1.0"].includes(
      observation.scraperVersion,
    ) &&
    observation.sourceSurface !== "unknown" &&
    observation.extractionSource !== "unknown"
  ) {
    return "fairness";
  }
  // Inline evidence cannot be truthfully serialized as a silent history sample.
  if (
    isNetworkActionAllowed(settings, "submit_history") &&
    observation.instrumentMode === "silent" &&
    observation.capturePhase === "baseline" &&
    observation.comparisonId === null
  )
    return "history";
  return null;
}

export function submitPendingObservations(db: ChookCheckDB): Promise<void> {
  const active = submissions.get(db);
  if (active) return active;
  const submission = submitBatches(db).finally(() => submissions.delete(db));
  submissions.set(db, submission);
  return submission;
}

async function submitBatches(db: ChookCheckDB): Promise<void> {
  const pending = await db.priceObservations
    .filter((row) => !row.contributed)
    .toArray();
  while (pending.length) {
    // Revocation, credential deletion, or changed sharing choices must apply to
    // the next request, including when the previous request was in flight.
    const settings = await getSettings(db);
    if (
      settings.pendingServerDeletion ||
      !settings.contributorId ||
      !settings.submitToken
    )
      return;
    const now = Date.now();
    const eligible = pending.filter((row) => {
      const observedAt = Date.parse(row.observedAt);
      return (
        observedAt >= now - MAX_AGE_MS &&
        observedAt <= now &&
        contributionMode(row, settings) !== null
      );
    });
    if (!eligible.length) return;
    const mode = contributionMode(eligible[0], settings)!;
    const batch = eligible
      .filter((row) => contributionMode(row, settings) === mode)
      .slice(0, BATCH_SIZE);
    try {
      const result = await submitObservations(
        {
          mode,
          observations: batch.map((row) =>
            toV2Observation(row, settings, mode === "fairness"),
          ),
        },
        settings.submitToken,
      );
      // Rejected values are quarantined by the API, so accepted, duplicate and
      // rejected counts all acknowledge a persisted ID. Never acknowledge an
      // incomplete/malformed response that would silently lose queued samples.
      if (
        ![result.accepted, result.duplicates, result.rejected].every(
          (count) => Number.isInteger(count) && count >= 0,
        ) ||
        result.accepted + result.duplicates + result.rejected !== batch.length
      ) {
        throw new Error(
          "The API did not acknowledge the complete observation batch",
        );
      }
      const ids = batch.flatMap((row) =>
        row.id === undefined ? [] : [row.id],
      );
      await db.priceObservations
        .where("id")
        .anyOf(ids)
        .modify({ contributed: true });
      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: result.accepted,
        status: "success",
      });
      const sent = new Set(batch.map((row) => row.clientObservationId));
      for (let index = pending.length - 1; index >= 0; index--) {
        if (sent.has(pending[index].clientObservationId))
          pending.splice(index, 1);
      }
    } catch (error) {
      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: batch.length,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }
  }
}
