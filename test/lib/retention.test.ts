import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { deleteOlderThan, deleteProduct, deleteAll } from "../../lib/retention";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_retention");
});

afterEach(async () => {
  await db.delete();
});

describe("deleteOlderThan", () => {
  it("deletes observations older than the specified number of days", async () => {
    const now = new Date();
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 400);
    const recentDate = new Date(now);
    recentDate.setDate(recentDate.getDate() - 100);

    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "old", observedAt: oldDate.toISOString() }),
      makeObservation({ productId: "recent", observedAt: recentDate.toISOString() }),
    ]);

    const deleted = await deleteOlderThan(db, 365);
    expect(deleted).toBe(1);

    const remaining = await db.priceObservations.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].productId).toBe("recent");
  });

  it("returns 0 when nothing to delete", async () => {
    await db.priceObservations.add(
      makeObservation({ observedAt: new Date().toISOString() }),
    );
    const deleted = await deleteOlderThan(db, 365);
    expect(deleted).toBe(0);
  });
});

describe("deleteProduct", () => {
  it("deletes all observations for a specific product", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "target", observedAt: "2026-03-16T12:00:00.000Z" }),
      makeObservation({ productId: "target", observedAt: "2026-03-17T12:00:00.000Z" }),
      makeObservation({ productId: "keep", observedAt: "2026-03-18T12:00:00.000Z" }),
    ]);
    const deleted = await deleteProduct(db, "target");
    expect(deleted).toBe(2);
    const remaining = await db.priceObservations.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].productId).toBe("keep");
  });
});

describe("deleteAll", () => {
  it("removes all observations from the table", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "a" }),
      makeObservation({ productId: "b" }),
      makeObservation({ productId: "c" }),
    ]);
    await deleteAll(db);
    const remaining = await db.priceObservations.toArray();
    expect(remaining).toEqual([]);
  });
});
