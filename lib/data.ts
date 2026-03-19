import type { ChookCheckDB } from "./db";
import type { PriceObservation } from "./types";

export async function getProductHistory(
  db: ChookCheckDB,
  productId: string,
): Promise<PriceObservation[]> {
  return db.priceObservations
    .where("productId")
    .equals(productId)
    .sortBy("observedAt");
}

export async function getRecentObservations(
  db: ChookCheckDB,
  limit = 50,
): Promise<PriceObservation[]> {
  return db.priceObservations
    .orderBy("observedAt")
    .reverse()
    .limit(limit)
    .toArray();
}

export async function getProductStats(
  db: ChookCheckDB,
  productId: string,
): Promise<{ min: number; max: number; avg: number; count: number } | null> {
  const observations = await db.priceObservations
    .where("productId")
    .equals(productId)
    .toArray();

  if (observations.length === 0) return null;

  const prices = observations.map((o) => o.priceCents);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    count: observations.length,
  };
}

export async function searchProducts(
  db: ChookCheckDB,
  query: string,
): Promise<PriceObservation[]> {
  const lowerQuery = query.toLowerCase();
  return db.priceObservations
    .filter((obs) => obs.productName.toLowerCase().includes(lowerQuery))
    .toArray();
}

export async function getStorageStats(db: ChookCheckDB): Promise<{
  totalObservations: number;
  distinctProducts: number;
  oldestDate: string | null;
  newestDate: string | null;
  byChain: Record<string, number>;
}> {
  const total = await db.priceObservations.count();
  if (total === 0) {
    return { totalObservations: 0, distinctProducts: 0, oldestDate: null, newestDate: null, byChain: {} };
  }
  const productKeys = await db.priceObservations.orderBy("productId").uniqueKeys();
  const oldest = await db.priceObservations.orderBy("observedAt").first();
  const newest = await db.priceObservations.orderBy("observedAt").reverse().first();
  const byChain: Record<string, number> = {};
  const woolworths = await db.priceObservations.where("storeChain").equals("woolworths").count();
  const coles = await db.priceObservations.where("storeChain").equals("coles").count();
  if (woolworths > 0) byChain.woolworths = woolworths;
  if (coles > 0) byChain.coles = coles;
  return {
    totalObservations: total,
    distinctProducts: productKeys.length,
    oldestDate: oldest?.observedAt ?? null,
    newestDate: newest?.observedAt ?? null,
    byChain,
  };
}
