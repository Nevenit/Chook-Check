import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { exportAsJSON, exportAsCSV } from "../../lib/export";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB_export");
});

afterEach(async () => {
  await db.delete();
});

describe("exportAsJSON", () => {
  it("exports all observations as formatted JSON", async () => {
    await db.priceObservations.bulkAdd([
      makeObservation({ productId: "prod-1", priceCents: 350 }),
      makeObservation({ productId: "prod-2", priceCents: 500 }),
    ]);
    const json = await exportAsJSON(db);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].productId).toBe("prod-1");
    expect(parsed[1].productId).toBe("prod-2");
  });

  it("returns empty array JSON for empty database", async () => {
    const json = await exportAsJSON(db);
    expect(JSON.parse(json)).toEqual([]);
  });
});

describe("exportAsCSV", () => {
  it("exports observations with header row and data rows", async () => {
    await db.priceObservations.add(
      makeObservation({
        productId: "prod-1",
        productName: "Test Product",
        priceCents: 350,
        storeChain: "woolworths",
      }),
    );
    const csv = await exportAsCSV(db);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "id,productId,productName,brand,category,gtin,storeChain,priceCents,wasPriceCents,unitPriceCents,unitMeasure,promoType,isPersonalised,pageUrl,observedAt,contributed",
    );
    expect(lines).toHaveLength(2);
    const fields = lines[1].split(",");
    expect(fields[1]).toBe("prod-1");
    expect(fields[2]).toBe("Test Product");
    expect(fields[6]).toBe("woolworths");
    expect(fields[7]).toBe("350");
  });

  it("escapes fields containing commas", async () => {
    await db.priceObservations.add(
      makeObservation({ productName: "Milk, Full Cream 2L" }),
    );
    const csv = await exportAsCSV(db);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Milk, Full Cream 2L"');
  });

  it("returns empty string for empty database", async () => {
    const csv = await exportAsCSV(db);
    expect(csv).toBe("");
  });
});
