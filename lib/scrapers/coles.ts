import {
  parseJsonLd,
  parsePriceCents,
  parseUnitMeasure,
  buildObservation,
} from "../scraper";
import type { PriceObservation } from "../types";

/**
 * Extracts a PriceObservation from a Coles product page.
 * Returns null if minimum fields cannot be extracted.
 */
export function scrapeColes(
  doc: Document,
  url: string,
): PriceObservation | null {
  const jsonLd = parseJsonLd(doc);
  if (!jsonLd) return null;

  // Extract from JSON-LD
  const name = typeof jsonLd.name === "string" ? jsonLd.name : null;
  const sku = jsonLd.sku != null ? String(jsonLd.sku) : extractSkuFromUrl(url);
  const gtin = typeof jsonLd.gtin === "string" ? jsonLd.gtin : null;

  const brandObj = jsonLd.brand as Record<string, unknown> | undefined;
  const brand = typeof brandObj?.name === "string" ? brandObj.name : null;

  // Offers is an array in Coles
  const offers = Array.isArray(jsonLd.offers)
    ? (jsonLd.offers[0] as Record<string, unknown> | undefined)
    : null;
  const price =
    typeof offers?.price === "number" ? offers.price : null;
  const priceCents = price != null ? Math.round(price * 100) : null;

  // Was price from priceSpecification — only when different from current
  const priceSpec = offers?.priceSpecification as
    | Record<string, unknown>
    | undefined;
  const listPrice =
    typeof priceSpec?.price === "number" ? priceSpec.price : null;
  const wasPriceCents =
    listPrice != null && price != null && listPrice !== price
      ? Math.round(listPrice * 100)
      : null;

  // DOM extraction for unit price
  const unitPriceEl = doc.querySelector(".price__calculation_method");
  let unitPriceCents: number | null = null;
  let unitMeasure: string | null = null;
  if (unitPriceEl?.textContent) {
    // Strip " | Was $X.XX" suffix if present (child .price__was element)
    const unitText = unitPriceEl.textContent.split("|")[0].trim();
    unitPriceCents = parsePriceCents(unitText);
    unitMeasure = parseUnitMeasure(unitText);
  }

  // Promo type from roundel classes
  const promoType = detectColesPromoType(doc);

  // Category from breadcrumbs
  const category = extractColesCategory(doc);

  if (!name || !sku || priceCents == null) return null;

  return buildObservation({
    productId: `coles:${sku}`,
    productName: name,
    brand,
    category,
    gtin,
    storeChain: "coles",
    priceCents,
    wasPriceCents,
    unitPriceCents,
    unitMeasure,
    promoType,
    isPersonalised: false,
    pageUrl: url,
    observedAt: new Date().toISOString(),
  });
}

function extractSkuFromUrl(url: string): string | null {
  // URL pattern: /product/{slug}-{sku}
  const match = url.match(/\/product\/.*?-(\d+)(?:\?|$)/);
  return match ? match[1] : null;
}

function detectColesPromoType(doc: Document): string | null {
  const roundels = doc.querySelectorAll(".roundel-text");
  for (const el of roundels) {
    const classes = el.className;
    if (classes.includes("is-half-price")) return "half_price";
    if (classes.includes("simple-fixed-price-specials")) return "special";
    if (classes.includes("every-day")) return "everyday_low";
    if (classes.includes("multi_save")) return "multi_save";
    if (classes.includes("reduced-to-clear")) return "clearance";
  }
  return null;
}

function extractColesCategory(doc: Document): string | null {
  const breadcrumbs = doc.querySelector('[data-testid="breadcrumbs"]');
  if (!breadcrumbs) return null;
  const links = breadcrumbs.querySelectorAll("a");
  if (links.length === 0) return null;
  // Last breadcrumb link is the most specific category
  const last = links[links.length - 1];
  return last.textContent?.trim() || null;
}
