import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("keeps the first immutable observation for an unchanged hourly sample", async () => {
    const obs1 = makeObservation({
      observedAt: "2026-03-18T02:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-18T02:30:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].observedAt).toBe(obs1.observedAt);
    expect(all[0].clientObservationId).toBe(obs1.clientObservationId);
  });

  it("preserves equal-price samples in independent UTC hours", async () => {
    await saveObservation(
      db,
      makeObservation({
        observedAt: "2026-03-18T02:59:59.000Z",
        contributed: true,
      }),
    );
    await saveObservation(
      db,
      makeObservation({ observedAt: "2026-03-18T03:00:00.000Z" }),
    );
    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
    expect(all.map((row) => row.contributed)).toEqual([true, false]);
  });

  it.each([
    { authState: "signed_in" as const },
    { loyaltyState: "member_eligible" as const },
    { fulfilmentMode: "pickup" as const },
    { storeId: "store-2" },
    { coarseRegion: "QLD" },
    { offerTextNormalized: "buy two" },
    { requiredQuantity: 2 },
    { sourceSurface: "search_result" as const },
    { scraperVersion: "new-version" },
    { userContextAtCapture: { state: "NSW", city: "", store: "" } },
  ])("preserves changed context at the same price: %j", async (context) => {
    await saveObservation(db, makeObservation());
    await saveObservation(db, makeObservation(context));
    expect(await db.priceObservations.count()).toBe(2);
  });

  it("preserves baseline, unchanged pre/post pairs, and separate comparisons", async () => {
    const comparisonId = crypto.randomUUID();
    const inline = {
      instrumentMode: "user_activated_inline" as const,
      comparisonId,
    };
    await saveObservation(db, makeObservation());
    await saveObservation(
      db,
      makeObservation({ ...inline, capturePhase: "pre_ui" }),
    );
    await saveObservation(
      db,
      makeObservation({ ...inline, capturePhase: "post_ui" }),
    );
    await saveObservation(
      db,
      makeObservation({
        ...inline,
        capturePhase: "pre_ui",
        comparisonId: crypto.randomUUID(),
      }),
    );
    expect(await db.priceObservations.count()).toBe(4);
  });

  it("does not mutate a submitted row when the same sample is captured again", async () => {
    const original = makeObservation({ contributed: true });
    await saveObservation(db, original);
    await saveObservation(
      db,
      makeObservation({ observedAt: "2026-03-18T12:30:00.000Z" }),
    );
    expect(await db.priceObservations.toArray()).toEqual([
      expect.objectContaining(original),
    ]);
  });

  it("deduplicates concurrent notifications and retried observation IDs", async () => {
    const original = makeObservation();
    await Promise.all([
      saveObservation(db, original),
      saveObservation(db, makeObservation()),
      saveObservation(db, original),
    ]);
    expect(await db.priceObservations.count()).toBe(1);
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
    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      new Error("disk failure"),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveObservation(db, makeObservation())).resolves.toBe(false);
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("initDefaults", () => {
  it("creates default settings row on first call", async () => {
    await initDefaults(db);

    const settings = await db.userSettings.get("default");
    expect(settings).toBeDefined();
    expect(settings!.historyContributionEnabled).toBe(false);
    expect(settings!.contributorId).toBe("");
    expect(settings!.submitToken).toBe("");
    expect(settings!.shareBrowser).toBe(false);
    expect(settings!.shareState).toBe(false);
    expect(settings!.shareCity).toBe(false);
    expect(settings!.shareStore).toBe(false);
    expect(settings!.inlineOverlayEnabled).toBe(false);
    expect(settings!.consentLog).toEqual([]);
  });

  it("does not overwrite existing settings on second call", async () => {
    await initDefaults(db);
    await db.userSettings.update("default", {
      historyContributionEnabled: true,
    });

    await initDefaults(db);

    const settings = await db.userSettings.get("default");
    expect(settings!.historyContributionEnabled).toBe(true);
  });
});

describe("saveSettings", () => {
  it("updates a single field in existing settings", async () => {
    await initDefaults(db);
    await saveSettings(db, { communityDownloadsEnabled: true });

    const settings = await db.userSettings.get("default");
    expect(settings!.communityDownloadsEnabled).toBe(true);
    expect(settings!.submitToken).toBe("");
  });

  it("creates defaults first if no settings exist, then applies changes", async () => {
    await saveSettings(db, { shareCity: true });

    const settings = await db.userSettings.get("default");
    expect(settings!.shareCity).toBe(true);
    expect(settings!.historyContributionEnabled).toBe(false);
  });
});
