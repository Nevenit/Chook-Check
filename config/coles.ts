import type { ScraperConfig } from "@/lib/types";

export const colesConfig: ScraperConfig = {
  chain: "coles",
  version: "1.0.0",
  productPage: {
    urlPattern: "https://www.coles.com.au/product/",
    selectors: {
      jsonLd: 'script[type="application/ld+json"]',
      jsState: "#__NEXT_DATA__",
      productName: [
        ".product__title",
        '[class*="product-name"]',
        "h1.product-header",
      ],
      price: [
        ".price__value",
        '[class*="price"]',
        ".product-price .primary",
      ],
      wasPrice: [
        ".price__was",
        '[class*="was-price"]',
        ".product-price .secondary",
      ],
      unitPrice: [
        ".price__calculation_method",
        '[class*="unit-price"]',
        '[class*="packagePrice"]',
      ],
      unitMeasure: [
        ".price__calculation_method",
        '[class*="unit-price"]',
        '[class*="packagePrice"]',
      ],
      promoLabel: [
        ".product__promotion",
        '[class*="promo"]',
        '[class*="special"]',
      ],
      personalisedSection: [
        '[class*="personalised"]',
        '[class*="for-you"]',
        '[data-testid*="personalised"]',
      ],
      productId: [
        '[data-product-id]',
        'meta[itemprop="sku"]',
        '[data-testid*="product-id"]',
      ],
      brand: ['[itemprop="brand"]', '[class*="brand"]'],
      category: [
        '[class*="breadcrumb"]',
        'meta[itemprop="category"]',
        '[data-testid*="breadcrumb"]',
      ],
    },
  },
};
