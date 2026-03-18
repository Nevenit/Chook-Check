import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChookCheckDB } from "../../lib/db";

let db: ChookCheckDB;

beforeEach(() => {
  db = new ChookCheckDB("TestDB");
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
