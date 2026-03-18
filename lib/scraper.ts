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
      if (data["@type"] === "Product") {
        return data;
      }
    } catch {
      // malformed JSON, skip
    }
  }
  return null;
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

export type ObservationFields = Omit<PriceObservation, "id" | "contributed">;

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
    contributed: false,
  };
}
