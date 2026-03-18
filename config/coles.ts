import type { ScraperConfig } from "@/lib/types";

export const colesConfig: ScraperConfig = {
  chain: "coles",
  version: "2.0.0",
  productPage: {
    urlPattern: "/product/",
    selectors: {
      jsonLd: 'script[type="application/ld+json"]',
      jsState: "",
      productName: [
        '[data-testid="title"]',
        "h1",
      ],
      price: [
        '[data-testid="pricing"]',
        ".price__value",
      ],
      wasPrice: [
        ".price__was",
      ],
      unitPrice: [
        ".price__calculation_method",
      ],
      unitMeasure: [
        ".price__calculation_method",
      ],
      promoLabel: [
        ".roundel-text",
        '[data-testid="complex-promotion-link"]',
      ],
      personalisedSection: [
        '[class*="personalised"]',
        '[class*="for-you"]',
      ],
      productId: [
        '[data-testid="product-code"]',
      ],
      brand: [
        '[data-testid="brand-link"]',
      ],
      category: [
        '[data-testid="breadcrumbs"]',
      ],
    },
  },
};
