import {
  isRetailerProductUrl,
  showInlineOverlay,
  syncInlineOverlays,
} from "@/lib/inline-overlay";
import { submitPendingObservations } from "@/lib/contribution";
import { db } from "@/lib/db";
import { saveCapturedObservation, initDefaults } from "@/lib/store";
import { deleteOlderThan } from "@/lib/retention";
import { getProductHistory, getProductStats } from "@/lib/data";
import {
  COMMUNITY_SNAPSHOT_ETAG_KEY,
  getSettings,
  saveContributorCredentials,
  updateSetting,
} from "@/lib/settings";
import {
  deleteContributorData,
  downloadCommunitySnapshot,
  registerContributor,
} from "@/lib/api";
import { assertNetworkActionAllowed } from "@/lib/network-policy";
import { modesMissingFirefoxConsent } from "@/lib/firefox-data-consent";
import { isAllowedRetailerRoute } from "@/lib/retailer-routes";
import type { PriceObservation } from "@/lib/types";

const RETENTION_ALARM = "chook-check-retention";
const SUBMIT_ALARM = "chook-check-submit";
const SNAPSHOT_ALARM = "chook-check-snapshot";
const RETENTION_DAYS = 365;
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

async function syncCommunitySnapshot(): Promise<number> {
  const settings = await getSettings(db);
  assertNetworkActionAllowed(settings, "download_snapshot");
  const stored = await browser.storage.local.get(COMMUNITY_SNAPSHOT_ETAG_KEY);
  const currentEtag = stored[COMMUNITY_SNAPSHOT_ETAG_KEY];
  const result = await downloadCommunitySnapshot(
    typeof currentEtag === "string" ? currentEtag : undefined,
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
    await browser.storage.local.set({
      [COMMUNITY_SNAPSHOT_ETAG_KEY]: result.etag,
    });
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
  const senderUrl = sender.tab?.url ?? sender.url;
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
        await submitPendingObservations(db);
      }
    } else if (alarm.name === SNAPSHOT_ALARM) {
      const settings = await getSettings(db);
      if (settings.communityDownloadsEnabled) await syncCommunitySnapshot();
    }
  });

  browser.permissions.onRemoved.addListener(() => {
    void disableModesWithRevokedFirefoxConsent();
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "PRICE_OBSERVATION" && message.data) {
      if (!isValidObservationFromSender(message.data, sender)) return false;
      // sender.url retains the original document URL across SPA navigation.
      const pageUrl = sender.tab?.url ?? sender.url;
      return saveCapturedObservation(db, message.data).then(async (saved) => {
        if (
          message.data.capturePhase === "baseline" &&
          sender.tab?.id !== undefined &&
          pageUrl &&
          isRetailerProductUrl(pageUrl)
        ) {
          await showInlineOverlay(db, sender.tab.id, pageUrl).catch(
            () => undefined,
          );
        }
        return saved;
      });
    }

    if (message.type === "GET_ACTIVE_PRODUCT_DATA") {
      return (async () => {
        const tabId = await getActiveTabId();
        const productId =
          tabId === null
            ? null
            : await browser.tabs
                .sendMessage(tabId, { type: "GET_ACTIVE_PRODUCT_ID" })
                .catch(() => null);
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

    if (message.type === "SYNC_INLINE_OVERLAYS") {
      return syncInlineOverlays(db);
    }

    if (message.type === "INLINE_OVERLAY_ALLOWED") {
      return getSettings(db).then(
        (settings) =>
          settings.inlineOverlayEnabled &&
          isRetailerProductUrl(sender.tab?.url ?? sender.url ?? ""),
      );
    }

    if (message.type === "DELETE_SERVER_DATA") {
      return deleteServerData(message.userInitiated === true).then(
        (deleted) => ({ deleted }),
      );
    }
  });
});
