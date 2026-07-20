import type { PriceObservation } from "./types";

/**
 * Finds and parses JSON-LD with @type "Product" from the document.
 * Returns null if not found or malformed.
 */
export function parseJsonLd(doc: Document): Record<string, unknown> | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "");
      const product = findProductJsonLd(data);
      if (product) return product;
    } catch {
      // malformed JSON, skip
    }
  }
  return null;
}

function findProductJsonLd(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = findProductJsonLd(item);
      if (product) return product;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const types = Array.isArray(object["@type"])
    ? object["@type"]
    : [object["@type"]];
  if (types.includes("Product")) return object;
  return findProductJsonLd(object["@graph"]);
}

export function parseStructuredPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tries each CSS selector in order, returns the first matching element.
 */
export function queryFallbackChain(
  doc: Document,
  selectors: string[],
): Element | null {
  for (const selector of selectors) {
    try {
      const el = doc.querySelector(selector);
      if (el) return el;
    } catch {
      // invalid selector, skip
    }
  }
  return null;
}

/**
 * Tries each CSS selector in order, returns trimmed text content of first match.
 */
export function extractTextFallbackChain(
  doc: Document,
  selectors: string[],
): string | null {
  const el = queryFallbackChain(doc, selectors);
  if (!el?.textContent) return null;
  return el.textContent.trim() || null;
}

/**
 * Extracts a price in cents from text like "$3.50", "3.50", "$1.75 / 1L".
 * Returns null if no price pattern found.
 */
export function parsePriceCents(text: string): number | null {
  if (!text) return null;
  const match = text.match(/\$?([\d]+(?:\.[\d]{1,2})?)/);
  if (!match) return null;
  const dollars = parseFloat(match[1]);
  if (isNaN(dollars)) return null;
  return Math.round(dollars * 100);
}

/**
 * Extracts the unit measure string from text like "$1.75 / 1L" -> "1L",
 * or "$5.52/ 100g" -> "100g".
 */
export function parseUnitMeasure(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\/\s*(.+)$/);
  if (!match) return null;
  return match[1].trim() || null;
}

export type ObservationFields = Omit<
  PriceObservation,
  | "id"
  | "schemaVersion"
  | "clientObservationId"
  | "offerTextNormalized"
  | "offerId"
  | "requiredQuantity"
  | "instrumentMode"
  | "capturePhase"
  | "comparisonId"
  | "storeId"
  | "coarseRegion"
  | "fulfilmentMode"
  | "authState"
  | "loyaltyState"
  | "sourceSurface"
  | "extractionSource"
  | "scraperVersion"
  | "contributed"
> &
  Partial<
    Pick<
      PriceObservation,
      | "offerTextNormalized"
      | "offerId"
      | "requiredQuantity"
      | "instrumentMode"
      | "capturePhase"
      | "comparisonId"
      | "storeId"
      | "coarseRegion"
      | "fulfilmentMode"
      | "authState"
      | "loyaltyState"
      | "sourceSurface"
      | "extractionSource"
      | "scraperVersion"
    >
  >;

/**
 * Validates required fields and builds a PriceObservation.
 * Returns null if minimum fields (productId, productName, priceCents) are missing.
 */
export function buildObservation(
  fields: ObservationFields,
): PriceObservation | null {
  if (!fields.productId || !fields.productName || !fields.priceCents) {
    return null;
  }
  if (isNaN(fields.priceCents)) {
    return null;
  }
  return {
    ...fields,
    schemaVersion: 2,
    clientObservationId: crypto.randomUUID(),
    offerTextNormalized: fields.offerTextNormalized ?? null,
    offerId: fields.offerId ?? null,
    requiredQuantity: fields.requiredQuantity ?? null,
    instrumentMode: fields.instrumentMode ?? "silent",
    capturePhase: fields.capturePhase ?? "baseline",
    comparisonId: fields.comparisonId ?? null,
    storeId: fields.storeId ?? null,
    coarseRegion: fields.coarseRegion ?? null,
    fulfilmentMode: fields.fulfilmentMode ?? "unknown",
    authState: fields.authState ?? "unknown",
    loyaltyState: fields.loyaltyState ?? "unknown",
    sourceSurface: fields.sourceSurface ?? "unknown",
    extractionSource: fields.extractionSource ?? "unknown",
    scraperVersion: fields.scraperVersion ?? "unknown",
    contributed: false,
  };
}
