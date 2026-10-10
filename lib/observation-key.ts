import type { PriceObservation } from "./types";

const MEASUREMENT_FIELDS = [
  "schemaVersion",
  "productId",
  "productName",
  "brand",
  "category",
  "gtin",
  "storeChain",
  "priceCents",
  "wasPriceCents",
  "unitPriceCents",
  "unitMeasure",
  "promoType",
  "offerTextNormalized",
  "offerId",
  "requiredQuantity",
  "isPersonalised",
  "sourceSurface",
  "extractionSource",
  "scraperVersion",
  "instrumentMode",
  "capturePhase",
  "comparisonId",
  "storeId",
  "coarseRegion",
  "fulfilmentMode",
  "authState",
  "loyaltyState",
  "userContextAtCapture",
] as const satisfies readonly (keyof PriceObservation)[];

export const SAMPLE_WINDOW_MS = 60 * 60 * 1000;

// Match the API's UTC hourly evidence windows. IDs, URL spelling, and upload
// state do not make a new measurement; offer/context and capture phase do.
export function observationKey(observation: PriceObservation): string {
  return JSON.stringify([
    Math.floor(Date.parse(observation.observedAt) / SAMPLE_WINDOW_MS),
    ...MEASUREMENT_FIELDS.map((field) => observation[field]),
  ]);
}
