import { db } from "@/lib/db";
import { saveObservation, initDefaults } from "@/lib/store";
import { deleteOlderThan } from "@/lib/retention";
import { getProductHistory, getProductStats } from "@/lib/data";
import {
  getSettings,
  saveContributorCredentials,
  updateSetting,
} from "@/lib/settings";
import {
  deleteContributorData,
  downloadCommunitySnapshot,
  registerContributor,
  submitObservations,
} from "@/lib/api";
import { assertNetworkActionAllowed } from "@/lib/network-policy";
import { modesMissingFirefoxConsent } from "@/lib/firefox-data-consent";
import { isAllowedRetailerRoute } from "@/lib/retailer-routes";
import type {
  ObservationV2,
  PriceObservation,
  SubmitRequestV2,
  UserSettings,
} from "@/lib/types";

const RETENTION_ALARM = "chook-check-retention";
const SUBMIT_ALARM = "chook-check-submit";
const SNAPSHOT_ALARM = "chook-check-snapshot";
const RETENTION_DAYS = 365;
const BATCH_SIZE = 50;
const MAX_AGE_DAYS = 14;
const activeProducts = new Map<number, string>();
const activeOverlayTabs = new Set<number>();

function setActiveProduct(tabId: number, productId: string): void {
  const previousProductId = activeProducts.get(tabId);
  if (previousProductId && previousProductId !== productId) {
    activeOverlayTabs.delete(tabId);
  }
  activeProducts.set(tabId, productId);
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

function toV2Observation(
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
    instrumentMode: fairness ? observation.instrumentMode : "silent",
    capturePhase: fairness ? observation.capturePhase : "baseline",
    comparisonId: fairness ? observation.comparisonId : null,
    storeId:
      fairness && settings.shareStore
        ? (observation.storeId ?? settings.userStoreName) || null
        : null,
    coarseRegion:
      fairness && (settings.shareState || settings.shareCity)
        ? [
            settings.shareState ? settings.userState : "",
            settings.shareCity ? settings.userCity : "",
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

async function ensureContributor(userInitiated: boolean): Promise<void> {
  const settings = await getSettings(db);
  if (
    settings.contributorId &&
    settings.submitToken &&
    settings.deletionToken
  ) {
    return;
  }
  assertNetworkActionAllowed(settings, "register_contributor", {
    userInitiated,
  });
  await saveContributorCredentials(db, await registerContributor());
}

async function handleSubmission(): Promise<void> {
  const settings = await getSettings(db);
  if (settings.pendingServerDeletion) return;
  const fairnessContextReady = Boolean(
    (settings.shareStore && settings.userStoreName) ||
    (settings.shareState && settings.userState) ||
    (settings.shareCity && settings.userCity),
  );
  const fairness = settings.fairnessStudyEnabled && fairnessContextReady;
  if (!fairness && !settings.historyContributionEnabled) return;
  const mode: SubmitRequestV2["mode"] = fairness ? "fairness" : "history";
  assertNetworkActionAllowed(
    settings,
    fairness ? "submit_fairness" : "submit_history",
  );
  if (!settings.contributorId || !settings.submitToken) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const eligible = (
    await db.priceObservations.filter((o) => !o.contributed).toArray()
  ).filter((observation) => observation.observedAt >= cutoff.toISOString());

  for (let index = 0; index < eligible.length; index += BATCH_SIZE) {
    const batch = eligible.slice(index, index + BATCH_SIZE);
    const request: SubmitRequestV2 = {
      mode,
      observations: batch.map((observation) =>
        toV2Observation(observation, settings, fairness),
      ),
    };
    try {
      const result = await submitObservations(request, settings.submitToken);
      const ids = batch.flatMap((observation) =>
        observation.id === undefined ? [] : [observation.id],
      );
      if (ids.length > 0) {
        await db.priceObservations
          .where("id")
          .anyOf(ids)
          .modify({ contributed: true });
      }
      await db.sharingLog.add({
        timestamp: new Date().toISOString(),
        observationCount: result.accepted,
        status: "success",
      });
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

async function syncCommunitySnapshot(): Promise<number> {
  const settings = await getSettings(db);
  assertNetworkActionAllowed(settings, "download_snapshot");
  const currentEtag = await browser.storage.local.get("communitySnapshotEtag");
  const result = await downloadCommunitySnapshot(
    typeof currentEtag.communitySnapshotEtag === "string"
      ? currentEtag.communitySnapshotEtag
      : undefined,
  );
  if (result.notModified) return 0;

  const downloadedAt = new Date().toISOString();
  await db.transaction("rw", db.communitySnapshots, async () => {
    await db.communitySnapshots.clear();
    await db.communitySnapshots.bulkPut(
      result.products.map((product) => ({ ...product, downloadedAt })),
    );
  });
  await db.userSettings.update("default", {
    communitySnapshotSyncedAt: downloadedAt,
  });
  if (result.etag) {
    await browser.storage.local.set({ communitySnapshotEtag: result.etag });
  }
  return result.products.length;
}

async function deleteServerData(
  userInitiated: boolean,
  retryPendingDeletion = false,
): Promise<number> {
  const settings = await getSettings(db);
  assertNetworkActionAllowed(settings, "delete_contributions", {
    userInitiated,
    retryPendingDeletion,
  });
  try {
    const result = await deleteContributorData(settings.deletionToken);
    await db.userSettings.update("default", {
      contributorId: "",
      submitToken: "",
      deletionToken: "",
      pendingServerDeletion: null,
      historyContributionEnabled: false,
      fairnessStudyEnabled: false,
    });
    return result.deleted;
  } catch (error) {
    const now = new Date().toISOString();
    await db.userSettings.update("default", {
      historyContributionEnabled: false,
      fairnessStudyEnabled: false,
      pendingServerDeletion: {
        contributorId: settings.contributorId,
        deletionToken: settings.deletionToken,
        requestedAt: settings.pendingServerDeletion?.requestedAt ?? now,
        lastAttemptAt: now,
        lastError: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

async function disableModesWithRevokedFirefoxConsent(): Promise<void> {
  const missing = await modesMissingFirefoxConsent();
  const settings = await getSettings(db);
  for (const mode of missing) {
    if (settings[mode]) await updateSetting(db, mode, false);
  }
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function isValidObservationFromSender(
  observation: PriceObservation,
  sender: Browser.runtime.MessageSender,
): boolean {
  const senderUrl = sender.url;
  if (!senderUrl || !observation?.storeChain) return false;
  return (
    isAllowedRetailerRoute(senderUrl, observation.storeChain) &&
    observation.productId.startsWith(`${observation.storeChain}:`) &&
    observation.schemaVersion === 2
  );
}

export default defineBackground(() => {
  void initDefaults(db);
  browser.alarms.create(RETENTION_ALARM, { periodInMinutes: 1440 });
  browser.alarms.create(SUBMIT_ALARM, { periodInMinutes: 5 });
  browser.alarms.create(SNAPSHOT_ALARM, { periodInMinutes: 1440 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RETENTION_ALARM) {
      await deleteOlderThan(db, RETENTION_DAYS);
    } else if (alarm.name === SUBMIT_ALARM) {
      const settings = await getSettings(db);
      if (settings.pendingServerDeletion) {
        await deleteServerData(false, true).catch(() => undefined);
      } else if (
        settings.historyContributionEnabled ||
        settings.fairnessStudyEnabled
      ) {
        await handleSubmission();
      }
    } else if (alarm.name === SNAPSHOT_ALARM) {
      const settings = await getSettings(db);
      if (settings.communityDownloadsEnabled) await syncCommunitySnapshot();
    }
  });

  browser.permissions.onRemoved.addListener(() => {
    void disableModesWithRevokedFirefoxConsent();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    activeProducts.delete(tabId);
    activeOverlayTabs.delete(tabId);
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== "loading") return;
    activeProducts.delete(tabId);
    activeOverlayTabs.delete(tabId);
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "PRICE_OBSERVATION" && message.data) {
      if (!isValidObservationFromSender(message.data, sender)) return false;
      if (sender.tab?.id !== undefined) {
        setActiveProduct(sender.tab.id, message.data.productId);
      }
      return saveObservation(db, message.data).then(() => true);
    }

    if (message.type === "ACTIVE_PRODUCT" && message.productId) {
      if (sender.tab?.id !== undefined) {
        setActiveProduct(sender.tab.id, message.productId);
      }
      return true;
    }

    if (message.type === "GET_ACTIVE_PRODUCT_DATA") {
      return (async () => {
        const tabId = await getActiveTabId();
        const productId =
          tabId === null ? null : (activeProducts.get(tabId) ?? null);
        if (!productId) return null;
        const [history, stats, community] = await Promise.all([
          getProductHistory(db, productId),
          getProductStats(db, productId),
          db.communitySnapshots.get(productId),
        ]);
        return { productId, history, stats, community: community ?? null };
      })();
    }

    if (message.type === "GET_PRODUCT_DATA" && message.productId) {
      return (async () => ({
        history: await getProductHistory(db, message.productId),
        stats: await getProductStats(db, message.productId),
      }))();
    }

    if (message.type === "ENSURE_CONTRIBUTOR") {
      return ensureContributor(message.userInitiated === true).then(() => true);
    }

    if (message.type === "SYNC_COMMUNITY_SNAPSHOT") {
      return syncCommunitySnapshot();
    }

    if (message.type === "ACTIVATE_INLINE_OVERLAY") {
      return (async () => {
        const settings = await getSettings(db);
        if (!settings.inlineOverlayEnabled)
          throw new Error("Inline overlay is disabled");
        const tabId = await getActiveTabId();
        if (tabId === null) throw new Error("No active retailer tab");
        if (activeOverlayTabs.has(tabId)) return true;
        const result = await browser.scripting.executeScript({
          target: { tabId },
          files: ["/content-scripts/overlay.js"],
        });
        activeOverlayTabs.add(tabId);
        return result;
      })();
    }

    if (message.type === "DELETE_SERVER_DATA") {
      return deleteServerData(message.userInitiated === true).then(
        (deleted) => ({ deleted }),
      );
    }
  });
});
