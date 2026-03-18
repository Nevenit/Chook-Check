import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { saveObservation } from "../../lib/store";
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
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-18T14:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].observedAt).toBe("2026-03-18T14:00:00.000Z");
  });

  it("inserts new row when same product, same day, different price", async () => {
    const obs1 = makeObservation({
      priceCents: 350,
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      priceCents: 300,
      observedAt: "2026-03-18T14:00:00.000Z",
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
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      productId: "product-b",
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs2);

    const all = await db.priceObservations.toArray();
    expect(all).toHaveLength(2);
  });

  it("inserts new row for same product on different days", async () => {
    const obs1 = makeObservation({
      observedAt: "2026-03-18T12:00:00.000Z",
    });
    await saveObservation(db, obs1);

    const obs2 = makeObservation({
      observedAt: "2026-03-19T12:00:00.000Z",
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
