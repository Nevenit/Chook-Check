import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import {
  getProductHistory,
  getRecentObservations,
  getProductStats,
  searchProducts,
  getStorageStats,
} from "../../lib/data";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_data");
});

afterEach(async () => {
  await db.delete();
});

describe("getProductHistory", () => {
  it("returns observations for a specific product sorted by date", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "prod-1", observedAt: "2026-03-18T12:00:00.000Z" }),
      makeObservation({ productId: "prod-1", observedAt: "2026-03-16T12:00:00.000Z" }),
      makeObservation({ productId: "prod-2", observedAt: "2026-03-17T12:00:00.000Z" }),
    ]);
    const history = await getProductHistory(db, "prod-1");
    expect(history).toHaveLength(2);
    expect(history[0].observedAt).toBe("2026-03-16T12:00:00.000Z");
    expect(history[1].observedAt).toBe("2026-03-18T12:00:00.000Z");
  });

  it("returns empty array for unknown product", async () => {
    const history = await getProductHistory(db, "nonexistent");
    expect(history).toEqual([]);
  });
});

describe("getRecentObservations", () => {
  it("returns observations ordered by most recent first", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "a", observedAt: "2026-03-16T12:00:00.000Z" }),
      makeObservation({ productId: "b", observedAt: "2026-03-18T12:00:00.000Z" }),
      makeObservation({ productId: "c", observedAt: "2026-03-17T12:00:00.000Z" }),
    ]);
    const recent = await getRecentObservations(db, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].productId).toBe("b");
    expect(recent[1].productId).toBe("c");
  });

  it("defaults to 50 results", async () => {
    const recent = await getRecentObservations(db);
    expect(recent).toEqual([]);
  });
});

describe("getProductStats", () => {
  it("computes min, max, avg, count for a product", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "prod-1", priceCents: 200, observedAt: "2026-03-16T12:00:00.000Z" }),
      makeObservation({ productId: "prod-1", priceCents: 400, observedAt: "2026-03-17T12:00:00.000Z" }),
      makeObservation({ productId: "prod-1", priceCents: 300, observedAt: "2026-03-18T12:00:00.000Z" }),
    ]);
    const stats = await getProductStats(db, "prod-1");
    expect(stats).toEqual({ min: 200, max: 400, avg: 300, count: 3 });
  });

  it("rounds average to nearest integer", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "prod-2", priceCents: 100, observedAt: "2026-03-16T12:00:00.000Z" }),
      makeObservation({ productId: "prod-2", priceCents: 200, observedAt: "2026-03-17T12:00:00.000Z" }),
      makeObservation({ productId: "prod-2", priceCents: 200, observedAt: "2026-03-18T12:00:00.000Z" }),
    ]);
    const stats = await getProductStats(db, "prod-2");
    expect(stats).toEqual({ min: 100, max: 200, avg: 167, count: 3 });
  });

  it("returns null for unknown product", async () => {
    const stats = await getProductStats(db, "nonexistent");
    expect(stats).toBeNull();
  });
});

describe("searchProducts", () => {
  it("finds observations by product name substring (case-insensitive)", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productName: "Woolworths Full Cream Milk 2L" }),
      makeObservation({ productId: "prod-2", productName: "Coles Skim Milk 1L" }),
      makeObservation({ productId: "prod-3", productName: "Cadbury Chocolate Block" }),
    ]);
    const results = await searchProducts(db, "milk");
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.productName);
    expect(names).toContain("Woolworths Full Cream Milk 2L");
    expect(names).toContain("Coles Skim Milk 1L");
  });

  it("returns empty array when no match", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productName: "Cadbury Chocolate Block" }),
    ]);
    const results = await searchProducts(db, "bread");
    expect(results).toEqual([]);
  });
});

describe("getStorageStats", () => {
  it("returns stats with observations present", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ storeChain: "woolworths", observedAt: "2026-03-16T12:00:00.000Z" }),
      makeObservation({ productId: "prod-2", storeChain: "woolworths", observedAt: "2026-03-18T12:00:00.000Z" }),
      makeObservation({ productId: "prod-3", storeChain: "coles", observedAt: "2026-03-17T12:00:00.000Z" }),
    ]);
    const stats = await getStorageStats(db);
    expect(stats.totalObservations).toBe(3);
    expect(stats.oldestDate).toBe("2026-03-16T12:00:00.000Z");
    expect(stats.newestDate).toBe("2026-03-18T12:00:00.000Z");
    expect(stats.byChain).toEqual({ woolworths: 2, coles: 1 });
  });

  it("returns zeroed stats for empty database", async () => {
    const stats = await getStorageStats(db);
    expect(stats).toEqual({ totalObservations: 0, distinctProducts: 0, oldestDate: null, newestDate: null, byChain: {} });
  });

  it("returns distinct product count", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "product-a", observedAt: "2026-03-18T01:00:00.000Z" }),
      makeObservation({ productId: "product-a", observedAt: "2026-03-18T02:00:00.000Z", priceCents: 400 }),
      makeObservation({ productId: "product-b", observedAt: "2026-03-18T03:00:00.000Z" }),
    ]);

    const stats = await getStorageStats(db);
    expect(stats.distinctProducts).toBe(2);
    expect(stats.totalObservations).toBe(3);
  });

  it("returns zero distinct products for empty database", async () => {
    const stats = await getStorageStats(db);
    expect(stats.distinctProducts).toBe(0);
  });
});

describe("getProductHistory + getProductStats (GET_PRODUCT_DATA handler path)", () => {
  it("returns history and stats for known product", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "woolworths:123", priceCents: 300, observedAt: "2026-03-17T00:00:00.000Z" }),
      makeObservation({ productId: "woolworths:123", priceCents: 400, observedAt: "2026-03-18T00:00:00.000Z" }),
    ]);

    const history = await getProductHistory(db, "woolworths:123");
    const stats = await getProductStats(db, "woolworths:123");

    expect(history).toHaveLength(2);
    expect(stats).toEqual({ min: 300, max: 400, avg: 350, count: 2 });
  });

  it("returns empty results for unknown product", async () => {
    const history = await getProductHistory(db, "unknown:999");
    const stats = await getProductStats(db, "unknown:999");

    expect(history).toHaveLength(0);
    expect(stats).toBeNull();
  });
});
