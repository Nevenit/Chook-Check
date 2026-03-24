import { db } from "@/lib/db";
import { saveObservation, initDefaults } from "@/lib/store";
import { deleteOlderThan } from "@/lib/retention";
import { getProductHistory, getProductStats } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { submitObservations, getProductStats as getApiStats, deleteContributorData } from "@/lib/api";
import type { PriceObservation, SubmitRequest } from "@/lib/types";

const RETENTION_ALARM = "chook-check-retention";
const RETENTION_DAYS = 365;
const RETENTION_INTERVAL_MINUTES = 1440; // 24 hours

const SUBMIT_ALARM = "chook-check-submit";
const SUBMIT_INTERVAL_MINUTES = 5;
const BATCH_SIZE = 50;
const MAX_AGE_DAYS = 14;

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

function buildSubmitRequest(
  observations: PriceObservation[],
  contributorId: string,
  settings: { shareBrowser: boolean; shareState: boolean; shareCity: boolean; shareStore: boolean },
): SubmitRequest {
  const context: SubmitRequest["context"] = {};
  if (settings.shareBrowser) context.browser = detectBrowser();
  // state, city, store not yet available from scraper — omitted

  const hasContext = Object.keys(context).length > 0;

  return {
    contributorId,
    observations: observations.map((o) => ({
      productId: o.productId,
      productName: o.productName,
      brand: o.brand,
      category: o.category,
      gtin: o.gtin,
      storeChain: o.storeChain,
      priceCents: o.priceCents,
      wasPriceCents: o.wasPriceCents,
      unitPriceCents: o.unitPriceCents,
      unitMeasure: o.unitMeasure,
      promoType: o.promoType,
      isPersonalised: o.isPersonalised,
      observedAt: o.observedAt,
    })),
    ...(hasContext ? { context } : {}),
  };
}

async function handleSubmission(): Promise<void> {
  const settings = await getSettings(db);

  if (!settings.contributionEnabled) return;
  if (!settings.contributorId) return;

  const allUnsubmitted = await db.priceObservations
    .filter((o) => !o.contributed)
    .toArray();

  if (allUnsubmitted.length === 0) return;

  // Filter out observations older than 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString();
  const eligible = allUnsubmitted.filter((o) => o.observedAt >= cutoffStr);

  if (eligible.length === 0) return;

  // Chunk into batches
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const body = buildSubmitRequest(batch, settings.contributorId, settings);

    try {
      const result = await submitObservations(body);

      // Mark as contributed
      const ids = batch.map((o) => o.id!).filter(Boolean);
      await db.priceObservations
        .where("id")
        .anyOf(ids)
        .modify({ contributed: true });

      // Log sharing event
      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: result.accepted,
        status: "success",
      });

      console.log(
        `[Chook Check] Submitted ${result.accepted} observations (${result.duplicates} duplicates)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Chook Check] Submission failed:", message);

      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: batch.length,
        status: "error",
        errorMessage: message,
      });
    }
  }
}

export default defineBackground(() => {
  console.log("[Chook Check] Background service worker started");

  initDefaults(db).catch((err) =>
    console.error("[Chook Check] Failed to initialize defaults:", err),
  );

  // Retention alarm — daily
  browser.alarms.create(RETENTION_ALARM, {
    periodInMinutes: RETENTION_INTERVAL_MINUTES,
  });

  // Submission alarm — every 5 minutes
  browser.alarms.create(SUBMIT_ALARM, {
    periodInMinutes: SUBMIT_INTERVAL_MINUTES,
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RETENTION_ALARM) {
      const deleted = await deleteOlderThan(db, RETENTION_DAYS);
      if (deleted > 0) {
        console.log(
          `[Chook Check] Retention cleanup: deleted ${deleted} old observations`,
        );
      }
    }

    if (alarm.name === SUBMIT_ALARM) {
      await handleSubmission().catch((err) =>
        console.error("[Chook Check] Submission handler error:", err),
      );
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "PRICE_OBSERVATION" && message.data) {
      const { productName, priceCents, storeChain } = message.data;
      console.log(
        `[Chook Check] ${storeChain}: ${productName} — $${(priceCents / 100).toFixed(2)}`,
      );
      saveObservation(db, message.data).catch((err) =>
        console.error("[Chook Check] Unhandled saveObservation error:", err),
      );
    }

    if (message.type === "GET_PRODUCT_DATA" && message.productId) {
      return (async () => {
        const history = await getProductHistory(db, message.productId);
        const stats = await getProductStats(db, message.productId);
        return { history, stats };
      })();
    }

    if (message.type === "GET_COMMUNITY_STATS" && message.productId) {
      return (async () => {
        try {
          const chain = message.productId.split(":")[0];
          return await getApiStats(message.productId, undefined, chain);
        } catch (err) {
          console.error("[Chook Check] Failed to fetch community stats:", err);
          return null;
        }
      })();
    }

    if (message.type === "DELETE_SERVER_DATA" && message.contributorId) {
      return (async () => {
        return await deleteContributorData(message.contributorId);
      })();
    }
  });
});
