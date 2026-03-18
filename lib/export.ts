import type { ChookCheckDB } from "./db";
import type { PriceObservation } from "./types";

const CSV_HEADERS = [
  "id", "productId", "productName", "brand", "category", "gtin",
  "storeChain", "priceCents", "wasPriceCents", "unitPriceCents",
  "unitMeasure", "promoType", "isPersonalised", "pageUrl",
  "observedAt", "contributed",
] as const;

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAsJSON(db: ChookCheckDB): Promise<string> {
  const observations = await db.priceObservations.toArray();
  return JSON.stringify(observations, null, 2);
}

export async function exportAsCSV(db: ChookCheckDB): Promise<string> {
  const observations = await db.priceObservations.toArray();
  if (observations.length === 0) return "";

  const rows = observations.map((obs) =>
    CSV_HEADERS.map((h) =>
      escapeCsvField(obs[h as keyof PriceObservation]),
    ).join(","),
  );

  return [CSV_HEADERS.join(","), ...rows].join("\n");
}
