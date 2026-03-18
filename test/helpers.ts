import type { PriceObservation } from "../lib/types";

export function makeObservation(
  overrides: Partial<PriceObservation> = {},
): PriceObservation {
  return {
    productId: "test-product-1",
    productName: "Test Product",
    brand: null,
    category: null,
    gtin: null,
    storeChain: "woolworths",
    priceCents: 350,
    wasPriceCents: null,
    unitPriceCents: null,
    unitMeasure: null,
    promoType: null,
    isPersonalised: false,
    pageUrl: "https://www.woolworths.com.au/shop/productdetails/123",
    observedAt: "2026-03-18T12:00:00.000Z",
    contributed: false,
    ...overrides,
  };
}
