import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { saveObservation, initDefaults, saveSettings } from "../../lib/store";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_store");
});

afterEach(async () => {
  await db.delete();
});

describe("saveObservation", () => {
  it("inserts a new observation into an empty database", async () => {
    const obs = makeObservation();
    await saveObservation(db, obs);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].productId).toBe("test-product-1");
    expect(all[0].priceCents).toBe(350);
  });

  it("deduplicates same product, same day, same price — updates observedAt", async () => {
    const obs1 = makeObservation({
      observedAt: "2026-03-18T02:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-18T04:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].observedAt).toBe("2026-03-18T04:00:00.000Z");
  });

  it("inserts new row when same product, same day, different price", async () => {
    const obs1 = makeObservation({
      priceCents: 350,
      observedAt: "2026-03-18T02:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      priceCents: 300,
      observedAt: "2026-03-18T04:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
    const prices = all.map((o) => o.priceCents).sort();
    expect(prices).toEqual([300, 350]);
  });

  it("inserts new row for different product on same day", async () => {
    const obs1 = makeObservation({
      productId: "product-a",
      observedAt: "2026-03-18T02:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      productId: "product-b",
      observedAt: "2026-03-18T02:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
  });

  it("inserts new row for same product on different days", async () => {
    const obs1 = makeObservation({
      observedAt: "2026-03-18T02:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-19T02:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
  });

  it("does not throw on storage errors — logs and continues", async () => {
    await db.delete();

    const obs = makeObservation();
    await expect(saveObservation(db, obs)).resolves.toBeUndefined();
  });
});

describe("initDefaults", () => {
  it("creates default settings row on first call", async () => {
    await initDefaults(db);

    const settings = await db.userSettings.get("default");
    expect(settings).toBeDefined();
    expect(settings!.contributionEnabled).toBe(false);
    expect(settings!.contributorId).toBe("");
    expect(settings!.contributorIdMode).toBe("anonymous");
    expect(settings!.shareBrowser).toBe(false);
    expect(settings!.shareState).toBe(false);
    expect(settings!.shareCity).toBe(false);
    expect(settings!.shareStore).toBe(false);
    expect(settings!.linkAccount).toBe(false);
    expect(settings!.consentLog).toEqual([]);
  });

  it("does not overwrite existing settings on second call", async () => {
    await initDefaults(db);
    await db.userSettings.update("default", { contributionEnabled: true });

    await initDefaults(db);

    const settings = await db.userSettings.get("default");
    expect(settings!.contributionEnabled).toBe(true);
  });
});

describe("saveSettings", () => {
  it("updates a single field in existing settings", async () => {
    await initDefaults(db);
    await saveSettings(db, { contributionEnabled: true });

    const settings = await db.userSettings.get("default");
    expect(settings!.contributionEnabled).toBe(true);
    expect(settings!.contributorIdMode).toBe("anonymous");
  });

  it("creates defaults first if no settings exist, then applies changes", async () => {
    await saveSettings(db, { shareCity: true });

    const settings = await db.userSettings.get("default");
    expect(settings!.shareCity).toBe(true);
    expect(settings!.contributionEnabled).toBe(false);
  });
});
