import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import Dexie from "dexie";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB");
});

describe("database migrations", () => {
  it("pauses legacy contributors and requires explicit consent to new modes", async () => {
    const name = `test-legacy-migration-${Math.random()}`;
    const legacy = new Dexie(name);
    legacy.version(2).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
      sharingLog: "++id, timestamp",
    });
    await legacy.open();
    await legacy.table("userSettings").add({
      key: "default",
      contributionEnabled: true,
      contributorId: "legacy-id",
      contributorIdMode: "anonymous",
      shareBrowser: true,
      shareState: false,
      shareCity: false,
      shareStore: false,
      linkAccount: false,
      onboardingDismissed: false,
      userState: "",
      userCity: "",
      userStoreName: "",
      consentLog: [],
    });
    legacy.close();

    const upgraded = new ChookCheckDB(name);
    await upgraded.open();
    const settings = await upgraded.userSettings.get("default");
    expect(settings).toMatchObject({
      communityDownloadsEnabled: false,
      historyContributionEnabled: false,
      fairnessStudyEnabled: false,
      inlineOverlayEnabled: false,
      reconsentRequired: true,
      legacyContributorId: "legacy-id",
      contributorId: "",
    });
    expect("contributionEnabled" in settings!).toBe(false);
    await upgraded.delete();
  });
});

afterEach(async () => {
  await db.delete();
});

describe("ChookCheckDB", () => {
  it("creates the priceObservations table", async () => {
    await db.open();
    expect(db.priceObservations).toBeDefined();
  });

  it("creates the userSettings table", async () => {
    await db.open();
    expect(db.userSettings).toBeDefined();
  });

  it("has the correct indexes on priceObservations", async () => {
    await db.open();
    const schema = db.priceObservations.schema;
    const indexNames = schema.indexes.map((idx) => idx.name);
    expect(indexNames).toContain("productId");
    expect(indexNames).toContain("storeChain");
    expect(indexNames).toContain("observedAt");
    expect(indexNames).toContain("[productId+observedAt]");
  });

  it("auto-increments the id on priceObservations", async () => {
    await db.open();
    expect(db.priceObservations.schema.primKey.auto).toBe(true);
  });

  it("uses 'key' as primary key on userSettings", async () => {
    await db.open();
    expect(db.userSettings.schema.primKey.name).toBe("key");
  });
});
