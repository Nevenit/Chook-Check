import type { ChookCheckDB } from "./db";

export interface ProductSummary {
  productId: string;
  productName: string;
  storeChain: "woolworths" | "coles";
  latestPriceCents: number;
  previousPriceCents: number | null;
  observationCount: number;
  lastObservedAt: string;
}

export interface PriceChange {
  productId: string;
  productName: string;
  storeChain: "woolworths" | "coles";
  oldPriceCents: number;
  newPriceCents: number;
  changeCents: number;
  changePercent: number;
  observedAt: string;
}

export async function getAllProductSummaries(
  db: ChookCheckDB,
): Promise<ProductSummary[]> {
  const all = await db.priceObservations.orderBy("observedAt").toArray();
  const byProduct = new Map<
    string,
    { name: string; chain: "woolworths" | "coles"; prices: { cents: number; at: string }[] }
  >();

  for (const obs of all) {
    let entry = byProduct.get(obs.productId);
    if (!entry) {
      entry = { name: obs.productName, chain: obs.storeChain, prices: [] };
      byProduct.set(obs.productId, entry);
    }
    entry.prices.push({ cents: obs.priceCents, at: obs.observedAt });
  }

  const summaries: ProductSummary[] = [];
  for (const [productId, entry] of byProduct) {
    entry.prices.sort((a, b) => a.at.localeCompare(b.at));
    const latest = entry.prices[entry.prices.length - 1];
    const previous = entry.prices.length > 1 ? entry.prices[entry.prices.length - 2] : null;

    summaries.push({
      productId,
      productName: entry.name,
      storeChain: entry.chain,
      latestPriceCents: latest.cents,
      previousPriceCents: previous?.cents ?? null,
      observationCount: entry.prices.length,
      lastObservedAt: latest.at,
    });
  }

  return summaries;
}

export async function getBiggestPriceChanges(
  db: ChookCheckDB,
  limit: number,
): Promise<PriceChange[]> {
  const summaries = await getAllProductSummaries(db);
  const changes: PriceChange[] = [];

  for (const s of summaries) {
    if (s.previousPriceCents == null) continue;
    const changeCents = Math.abs(s.latestPriceCents - s.previousPriceCents);
    if (changeCents === 0) continue;

    changes.push({
      productId: s.productId,
      productName: s.productName,
      storeChain: s.storeChain,
      oldPriceCents: s.previousPriceCents,
      newPriceCents: s.latestPriceCents,
      changeCents,
      changePercent: Math.round((changeCents / s.previousPriceCents) * 100),
      observedAt: s.lastObservedAt,
    });
  }

  changes.sort((a, b) => b.changeCents - a.changeCents);
  return changes.slice(0, limit);
}
