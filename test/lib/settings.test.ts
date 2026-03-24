import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "@/lib/db";
import { getSettings, updateSetting, deleteAllLocalData } from "@/lib/settings";
import { makeObservation } from "../helpers";

describe("settings", () => {
  let db: ChookCheckDB;

  beforeEach(async () => {
    db = new ChookCheckDB("test-settings-" + Math.random());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe("getSettings", () => {
    it("returns defaults when no settings exist", async () => {
      const settings = await getSettings(db);
      expect(settings.contributionEnabled).toBe(false);
      expect(settings.contributorId).toBe("");
      expect(settings.shareBrowser).toBe(false);
      expect(settings.consentLog).toEqual([]);
    });

    it("returns existing settings", async () => {
      await db.userSettings.add({
        key: "default",
        contributionEnabled: true,
        contributorId: "abc-123",
        contributorIdMode: "anonymous",
        shareBrowser: true,
        shareState: false,
        shareCity: false,
        shareStore: false,
        linkAccount: false,
        consentLog: [],
        onboardingDismissed: false,
      });

      const settings = await getSettings(db);
      expect(settings.contributionEnabled).toBe(true);
      expect(settings.contributorId).toBe("abc-123");
      expect(settings.shareBrowser).toBe(true);
    });

    it("does not include the Dexie key field", async () => {
      const settings = await getSettings(db);
      expect("key" in settings).toBe(false);
    });
  });

  describe("updateSetting", () => {
    it("updates the toggle value", async () => {
      await updateSetting(db, "shareBrowser", true);
      const settings = await getSettings(db);
      expect(settings.shareBrowser).toBe(true);
    });

    it("logs opted_in when enabling contribution", async () => {
      await updateSetting(db, "contributionEnabled", true);
      const settings = await getSettings(db);
      expect(settings.consentLog).toHaveLength(1);
      expect(settings.consentLog[0].action).toBe("opted_in");
      expect(settings.consentLog[0].detail).toBe("Contribution enabled");
    });

    it("logs opted_out when disabling contribution", async () => {
      await updateSetting(db, "contributionEnabled", true);
      await updateSetting(db, "contributionEnabled", false);
      const settings = await getSettings(db);
      expect(settings.consentLog).toHaveLength(2);
      expect(settings.consentLog[1].action).toBe("opted_out");
      expect(settings.consentLog[1].detail).toBe("Contribution disabled");
    });

    it("logs toggle_changed for context toggles", async () => {
      await updateSetting(db, "shareBrowser", true);
      const settings = await getSettings(db);
      expect(settings.consentLog[0].action).toBe("toggle_changed");
      expect(settings.consentLog[0].detail).toBe("Share Browser turned on");
    });

    it("generates contributorId on first opt-in", async () => {
      await updateSetting(db, "contributionEnabled", true);
      const settings = await getSettings(db);
      expect(settings.contributorId).toBeTruthy();
      expect(settings.contributorId.length).toBeGreaterThan(0);
    });

    it("sets contributorIdMode to account_linked when linkAccount enabled", async () => {
      await updateSetting(db, "linkAccount", true);
      const settings = await getSettings(db);
      expect(settings.contributorIdMode).toBe("account_linked");
    });

    it("sets contributorIdMode to anonymous when linkAccount disabled", async () => {
      await updateSetting(db, "linkAccount", true);
      await updateSetting(db, "linkAccount", false);
      const settings = await getSettings(db);
      expect(settings.contributorIdMode).toBe("anonymous");
    });
  });

  describe("deleteAllLocalData", () => {
    it("clears observations", async () => {
      await db.priceObservations.add(makeObservation());
      expect(await db.priceObservations.count()).toBe(1);

      await deleteAllLocalData(db);
      expect(await db.priceObservations.count()).toBe(0);
    });

    it("resets settings to defaults", async () => {
      await updateSetting(db, "contributionEnabled", true);
      await updateSetting(db, "shareBrowser", true);

      await deleteAllLocalData(db);
      const settings = await getSettings(db);
      expect(settings.contributionEnabled).toBe(false);
      expect(settings.shareBrowser).toBe(false);
    });

    it("preserves consent log and appends deletion event", async () => {
      await updateSetting(db, "contributionEnabled", true);
      await deleteAllLocalData(db);

      const settings = await getSettings(db);
      expect(settings.consentLog.length).toBeGreaterThanOrEqual(2);
      const lastEvent = settings.consentLog[settings.consentLog.length - 1];
      expect(lastEvent.action).toBe("data_deleted");
      expect(lastEvent.detail).toBe("All local data deleted");
    });
  });
});
