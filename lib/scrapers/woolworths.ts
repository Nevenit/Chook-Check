import {
  parseJsonLd,
  parsePriceCents,
  parseUnitMeasure,
  buildObservation,
} from "../scraper";
import { extractWoolworthsSku } from "../product-id";
import type { PriceObservation } from "../types";
import type { ObservationFields } from "../scraper";

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
    jsonLd.sku != null ? String(jsonLd.sku) : extractWoolworthsSku(url);
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

/**
 * Scrapes all product tiles from a Woolworths search/category page.
 * Tiles use Shadow DOM (open mode) with `wc-product-tile` elements.
 */
export function scrapeWoolworthsSearchTiles(
  doc: Document,
): PriceObservation[] {
  const tiles = doc.querySelectorAll("wc-product-tile");
  const results: PriceObservation[] = [];

  for (const tile of tiles) {
    const sr = tile.shadowRoot;
    if (!sr) continue;

    const link = sr.querySelector('a[href*="/shop/productdetails/"]');
    const href = link?.getAttribute("href") ?? "";
    const sku = extractWoolworthsSku(href);
    if (!sku) continue;

    const name = sr.querySelector(".title a")?.textContent?.trim() ?? null;
    if (!name) continue;

    const priceText =
      sr.querySelector(".product-tile-price .primary")?.textContent?.trim() ??
      null;
    const priceCents = parsePriceCents(priceText ?? "");
    if (priceCents == null) continue;

    const wasText =
      sr.querySelector(".was-price")?.textContent?.trim() ?? null;
    const wasPriceCents = wasText ? parsePriceCents(wasText) : null;

    const cupText =
      sr.querySelector(".price-per-cup")?.textContent?.trim() ?? null;
    const unitPriceCents = cupText ? parsePriceCents(cupText) : null;
    const unitMeasure = cupText ? parseUnitMeasure(cupText) : null;

    const labelEl = sr.querySelector(".product-tile-label");
    let promoType: string | null = null;
    if (labelEl) {
      const cls = labelEl.className;
      if (cls.includes("lowerShelfPrice")) promoType = "lower_price";
      else if (cls.includes("special")) promoType = "special";
      else if (labelEl.textContent?.includes("SAVE")) promoType = "special";
    }

    const fields: ObservationFields = {
      productId: `woolworths:${sku}`,
      productName: name,
      brand: null,
      category: null,
      gtin: null,
      storeChain: "woolworths",
      priceCents,
      wasPriceCents,
      unitPriceCents,
      unitMeasure,
      promoType,
      isPersonalised: false,
      pageUrl: window.location.href,
      observedAt: new Date().toISOString(),
    };

    const obs = buildObservation(fields);
    if (obs) results.push(obs);
  }

  return results;
}
