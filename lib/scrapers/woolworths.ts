import {
  parseJsonLd,
  parsePriceCents,
  parseUnitMeasure,
  buildObservation,
} from "../scraper";
import type { PriceObservation } from "../types";

/**
 * Extracts a PriceObservation from a Woolworths product page.
 * Returns null if minimum fields cannot be extracted.
 */
export function scrapeWoolworths(
  doc: Document,
  url: string,
): PriceObservation | null {
  const jsonLd = parseJsonLd(doc);
  if (!jsonLd) return null;

  // Extract from JSON-LD
  const name = typeof jsonLd.name === "string" ? jsonLd.name : null;
  const sku =
    jsonLd.sku != null ? String(jsonLd.sku) : extractSkuFromUrl(url);
  const gtin = typeof jsonLd.gtin === "string" ? jsonLd.gtin : null;

  // Brand is an object: { @type: "Organization", name: "..." }
  const brandObj = jsonLd.brand as Record<string, unknown> | undefined;
  const brand = typeof brandObj?.name === "string" ? brandObj.name : null;

  // Woolworths offers is an object (not an array)
  const offers = jsonLd.offers as Record<string, unknown> | undefined;
  const price =
    typeof offers?.price === "number" ? offers.price : null;
  const priceCents = price != null ? Math.round(price * 100) : null;

  // Unit price from JSON-LD priceSpecification
  const priceSpec = offers?.priceSpecification as
    | Record<string, unknown>
    | undefined;
  const unitPrice =
    typeof priceSpec?.price === "number" ? priceSpec.price : null;
  const unitPriceCents =
    unitPrice != null ? Math.round(unitPrice * 100) : null;

  // DOM: unit measure from cup price string (e.g., "$1.75 / 1L")
  const unitMeasure = extractUnitMeasureFromDom(doc);

  // DOM: was price — only present on sale items
  const wasPriceCents = extractWasPriceFromDom(doc);

  // DOM: promo type from product label
  const promoType = detectWoolworthsPromoType(doc);

  // Data layer: personalisation flag
  const isPersonalised = detectPersonalised(doc);

  // Category from breadcrumbs
  const category = extractWoolworthsCategory(doc);

  if (!name || !sku || priceCents == null) return null;

  return buildObservation({
    productId: `woolworths:${sku}`,
    productName: name,
    brand,
    category,
    gtin,
    storeChain: "woolworths",
    priceCents,
    wasPriceCents,
    unitPriceCents,
    unitMeasure,
    promoType,
    isPersonalised,
    pageUrl: url,
    observedAt: new Date().toISOString(),
  });
}

function extractSkuFromUrl(url: string): string | null {
  // URL pattern: /shop/productdetails/{id}/{slug}
  const match = url.match(/\/shop\/productdetails\/(\d+)/);
  return match ? match[1] : null;
}

function extractUnitMeasureFromDom(doc: Document): string | null {
  const el = doc.querySelector(
    '[class*="product-unit-price_component_price-cup-string"]',
  );
  if (!el?.textContent) return null;
  return parseUnitMeasure(el.textContent);
}

function extractWasPriceFromDom(doc: Document): number | null {
  const el = doc.querySelector('[class*="price-was"]');
  if (!el?.textContent) return null;
  return parsePriceCents(el.textContent);
}

function detectWoolworthsPromoType(doc: Document): string | null {
  const label = doc.querySelector('[class*="product-label_component"]');
  if (!label) return null;
  const classes = label.className;
  if (classes.includes("lower-shelf-price")) return "lower_price";
  if (classes.includes("special")) return "special";
  return null;
}

function detectPersonalised(doc: Document): boolean {
  // Search all script tags for IsPersonalisedByPurchaseHistory
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent || "";
    if (text.includes('"IsPersonalisedByPurchaseHistory":true')) {
      return true;
    }
  }
  return false;
}

function extractWoolworthsCategory(doc: Document): string | null {
  const el = doc.querySelector('[class*="breadcrumb"]');
  if (!el) return null;
  const links = el.querySelectorAll("a");
  if (links.length === 0) return null;
  const last = links[links.length - 1];
  return last.textContent?.trim() || null;
}
