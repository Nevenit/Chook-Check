import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "@/lib/db";
import {
  CONSENT_VERSION,
  clearLocalLogs,
  clearPriceHistory,
  deleteAllLocalData,
  getSettings,
  saveContributorCredentials,
  updateSetting,
} from "@/lib/settings";
import { makeObservation } from "../helpers";

describe("settings", () => {
  let db: ChookCheckDB;

  beforeEach(async () => {
    db = new ChookCheckDB(`test-settings-${Math.random()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("defaults every network and inline mode to off", async () => {
    const settings = await getSettings(db);
    expect(settings.communityDownloadsEnabled).toBe(false);
    expect(settings.historyContributionEnabled).toBe(false);
    expect(settings.fairnessStudyEnabled).toBe(false);
    expect(settings.inlineOverlayEnabled).toBe(false);
    expect(settings.contributorId).toBe("");
  });

  it("does not expose the Dexie key", async () => {
    expect("key" in (await getSettings(db))).toBe(false);
  });

  it("records versioned disclosure text when a privacy mode is enabled", async () => {
    await updateSetting(db, "historyContributionEnabled", true);
    const settings = await getSettings(db);
    expect(settings.historyContributionEnabled).toBe(true);
    expect(settings.consentVersion).toBe(CONSENT_VERSION);
    expect(settings.consentLog[0]).toMatchObject({
      action: "opted_in",
      mode: "historyContributionEnabled",
      consentVersion: CONSENT_VERSION,
    });
    expect(settings.consentLog[0].disclosureText).toContain("pseudonymous");
  });

  it("records opt out independently for each mode", async () => {
    await updateSetting(db, "fairnessStudyEnabled", true);
    await updateSetting(db, "fairnessStudyEnabled", false);
    const settings = await getSettings(db);
    expect(settings.fairnessStudyEnabled).toBe(false);
    expect(settings.consentLog.at(-1)?.action).toBe("opted_out");
  });

  it("records context toggles without treating them as mode consent", async () => {
    await updateSetting(db, "shareState", true);
    const event = (await getSettings(db)).consentLog[0];
    expect(event.action).toBe("toggle_changed");
    expect(event.mode).toBeUndefined();
  });

  it("stores distinct submit and deletion credentials", async () => {
    await getSettings(db);
    await saveContributorCredentials(db, {
      contributorId: "contributor",
      submitToken: "submit-secret",
      deletionToken: "delete-secret",
    });
    expect(await getSettings(db)).toMatchObject({
      contributorId: "contributor",
      submitToken: "submit-secret",
      deletionToken: "delete-secret",
    });
  });

  it("clears only price history when requested", async () => {
    await db.priceObservations.add(makeObservation());
    await db.sharingLog.add({
      timestamp: new Date().toISOString(),
      observationCount: 1,
      status: "success",
    });
    await clearPriceHistory(db);
    expect(await db.priceObservations.count()).toBe(0);
    expect(await db.sharingLog.count()).toBe(1);
  });

  it("clears sharing and consent logs independently", async () => {
    await updateSetting(db, "shareState", true);
    await db.sharingLog.add({
      timestamp: new Date().toISOString(),
      observationCount: 1,
      status: "success",
    });
    await clearLocalLogs(db);
    expect(await db.sharingLog.count()).toBe(0);
    expect((await getSettings(db)).consentLog).toEqual([]);
  });

  it("full reset clears every local data table and turns modes off", async () => {
    await updateSetting(db, "historyContributionEnabled", true);
    await db.priceObservations.add(makeObservation());
    await db.sharingLog.add({
      timestamp: new Date().toISOString(),
      observationCount: 1,
      status: "success",
    });
    await db.communitySnapshots.put({
      productId: "woolworths:123",
      productName: "Test",
      brand: null,
      storeChain: "woolworths",
      quorum: true,
      currentMedianCents: 300,
      minCents: 300,
      maxCents: 300,
      observationCount: 5,
      contributorCount: 5,
      priceHistory: [],
      promoFrequency: {},
      downloadedAt: new Date().toISOString(),
    });

    await deleteAllLocalData(db);
    expect(await db.priceObservations.count()).toBe(0);
    expect(await db.sharingLog.count()).toBe(0);
    expect(await db.communitySnapshots.count()).toBe(0);
    expect((await getSettings(db)).historyContributionEnabled).toBe(false);
  });

  it("full reset preserves a pending deletion recovery credential", async () => {
    await getSettings(db);
    const pending = {
      contributorId: "id",
      deletionToken: "secret",
      requestedAt: "2026-07-20T00:00:00.000Z",
      lastAttemptAt: "2026-07-20T00:00:00.000Z",
      lastError: "offline",
    };
    await db.userSettings.update("default", { pendingServerDeletion: pending });
    await deleteAllLocalData(db);
    expect((await getSettings(db)).pendingServerDeletion).toEqual(pending);
  });
});
