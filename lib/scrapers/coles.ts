import {
  parseJsonLd,
  parsePriceCents,
  parseUnitMeasure,
  parseStructuredPrice,
  buildObservation,
} from "../scraper";
import { extractColesSku } from "../product-id";
import type { PriceObservation } from "../types";
import type { ObservationFields } from "../scraper";

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
  const sku = jsonLd.sku != null ? String(jsonLd.sku) : extractColesSku(url);
  const gtin = typeof jsonLd.gtin === "string" ? jsonLd.gtin : null;

  const brandObj = jsonLd.brand as Record<string, unknown> | undefined;
  const brand = typeof brandObj?.name === "string" ? brandObj.name : null;

  // Offers is an array in Coles
  const offers = Array.isArray(jsonLd.offers)
    ? (jsonLd.offers[0] as Record<string, unknown> | undefined)
    : (jsonLd.offers as Record<string, unknown> | undefined);
  const price = parseStructuredPrice(offers?.price);
  const priceCents = price != null ? Math.round(price * 100) : null;

  // Was price from priceSpecification — only when different from current
  const priceSpec = offers?.priceSpecification as
    | Record<string, unknown>
    | undefined;
  const listPrice = parseStructuredPrice(priceSpec?.price);
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
    sourceSurface: "product_page",
    extractionSource: "json_ld",
    scraperVersion: "2.1.0",
    pageUrl: url,
    observedAt: new Date().toISOString(),
  });
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

/**
 * Scrapes all product tiles from a Coles search/category page.
 * Tiles use `[data-testid="product-tile"]` in regular DOM.
 */
export function scrapeColesSearchTiles(doc: Document): PriceObservation[] {
  const tiles = doc.querySelectorAll('[data-testid="product-tile"]');
  const results: PriceObservation[] = [];

  for (const tile of tiles) {
    const link = tile.querySelector('a[href*="/product/"]');
    const href = link?.getAttribute("href") ?? "";
    const sku = extractColesSku(href);
    if (!sku) continue;

    const name =
      tile.querySelector(".product__title")?.textContent?.trim() ?? null;
    if (!name) continue;

    const priceText =
      tile.querySelector("span.price__value")?.textContent?.trim() ?? null;
    const priceCents = parsePriceCents(priceText ?? "");
    if (priceCents == null) continue;

    const wasEl = tile.querySelector(".price__was");
    const wasPriceCents = wasEl?.textContent
      ? parsePriceCents(wasEl.textContent)
      : null;

    const calcEl = tile.querySelector(".price__calculation_method");
    let unitPriceCents: number | null = null;
    let unitMeasure: string | null = null;
    if (calcEl?.textContent) {
      const unitText = calcEl.textContent.split("|")[0].trim();
      unitPriceCents = parsePriceCents(unitText);
      unitMeasure = parseUnitMeasure(unitText);
    }

    const promoEl = tile.querySelector(".product_promotion");
    let promoType: string | null = null;
    if (promoEl) {
      const cls = promoEl.className;
      if (cls.includes("half-price")) promoType = "half_price";
      else if (cls.includes("special")) promoType = "special";
      else promoType = "special";
    }

    const fields: ObservationFields = {
      productId: `coles:${sku}`,
      productName: name,
      brand: null,
      category: null,
      gtin: null,
      storeChain: "coles",
      priceCents,
      wasPriceCents,
      unitPriceCents,
      unitMeasure,
      promoType,
      isPersonalised: false,
      sourceSurface: inferColesTileSurface(window.location.pathname),
      extractionSource: "dom",
      scraperVersion: "2.1.0",
      pageUrl: window.location.href,
      observedAt: new Date().toISOString(),
    };

    const obs = buildObservation(fields);
    if (obs) results.push(obs);
  }

  return results;
}

function inferColesTileSurface(pathname: string) {
  return pathname.includes("/search") ? "search_result" : "category_tile";
}
