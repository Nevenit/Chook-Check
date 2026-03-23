import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "@/lib/db";
import { getAllProductSummaries, getBiggestPriceChanges } from "@/lib/data-dashboard";
import { makeObservation } from "../helpers";

describe("data-dashboard", () => {
  let db: ChookCheckDB;

  beforeEach(async () => {
    db = new ChookCheckDB("test-dashboard-" + Math.random());
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe("getAllProductSummaries", () => {
    it("returns empty array when no data", async () => {
      const result = await getAllProductSummaries(db);
      expect(result).toEqual([]);
    });

    it("returns one summary per product with latest price", async () => {
      await db.priceObservations.bulkAdd([
        makeObservation({
          productId: "woolworths:123",
          productName: "Milk",
          priceCents: 300,
          observedAt: "2026-03-01T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:123",
          productName: "Milk",
          priceCents: 350,
          observedAt: "2026-03-10T00:00:00Z",
        }),
        makeObservation({
          productId: "coles:456",
          productName: "Bread",
          storeChain: "coles",
          priceCents: 500,
          observedAt: "2026-03-05T00:00:00Z",
        }),
      ]);

      const result = await getAllProductSummaries(db);
      expect(result).toHaveLength(2);

      const milk = result.find((p) => p.productId === "woolworths:123")!;
      expect(milk.latestPriceCents).toBe(350);
      expect(milk.previousPriceCents).toBe(300);
      expect(milk.observationCount).toBe(2);

      const bread = result.find((p) => p.productId === "coles:456")!;
      expect(bread.latestPriceCents).toBe(500);
      expect(bread.previousPriceCents).toBeNull();
      expect(bread.observationCount).toBe(1);
    });
  });

  describe("getBiggestPriceChanges", () => {
    it("returns empty array when no data", async () => {
      const result = await getBiggestPriceChanges(db, 5);
      expect(result).toEqual([]);
    });

    it("returns changes sorted by absolute change descending", async () => {
      await db.priceObservations.bulkAdd([
        makeObservation({
          productId: "woolworths:1",
          productName: "Apple",
          priceCents: 100,
          observedAt: "2026-03-01T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:1",
          productName: "Apple",
          priceCents: 110,
          observedAt: "2026-03-10T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:2",
          productName: "Steak",
          priceCents: 1000,
          observedAt: "2026-03-01T00:00:00Z",
        }),
        makeObservation({
          productId: "woolworths:2",
          productName: "Steak",
          priceCents: 1500,
          observedAt: "2026-03-10T00:00:00Z",
        }),
      ]);

      const result = await getBiggestPriceChanges(db, 5);
      expect(result).toHaveLength(2);
      expect(result[0].productId).toBe("woolworths:2");
      expect(result[0].changeCents).toBe(500);
      expect(result[1].productId).toBe("woolworths:1");
      expect(result[1].changeCents).toBe(10);
    });

    it("skips products with only one observation", async () => {
      await db.priceObservations.add(
        makeObservation({ productId: "woolworths:1", priceCents: 100 }),
      );

      const result = await getBiggestPriceChanges(db, 5);
      expect(result).toEqual([]);
    });
  });
});
