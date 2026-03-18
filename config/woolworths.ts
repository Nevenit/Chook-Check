import type { ScraperConfig } from "@/lib/types";

export const woolworthsConfig: ScraperConfig = {
  chain: "woolworths",
  version: "2.0.0",
  productPage: {
    urlPattern: "/shop/productdetails/",
    selectors: {
      jsonLd: 'script[type="application/ld+json"]',
      jsState: "#__NEXT_DATA__",
      productName: [
        '[class*="product-title_component_product-title"]',
        "h1",
      ],
      price: [
        '[class*="product-price_component_price-lead"]',
        '[class*="product-price_component"]',
      ],
      wasPrice: [
        '[class*="product-unit-price_component_price-was-amount"]',
        '[class*="price-was"]',
      ],
      unitPrice: [
        '[class*="product-unit-price_component_price-cup-string"]',
      ],
      unitMeasure: [
        '[class*="product-unit-price_component_price-cup-string"]',
      ],
      promoLabel: [
        '[class*="product-label_component"]',
      ],
      personalisedSection: [
        '[class*="personalised"]',
        '[class*="for-you"]',
      ],
      productId: [
        'meta[itemprop="sku"]',
      ],
      brand: [
        '[itemprop="brand"]',
      ],
      category: [
        '[class*="breadcrumb"]',
      ],
    },
  },
};
