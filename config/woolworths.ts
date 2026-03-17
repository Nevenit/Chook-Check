import type { ScraperConfig } from "@/lib/types";

export const woolworthsConfig: ScraperConfig = {
  chain: "woolworths",
  version: "1.0.0",
  productPage: {
    urlPattern: "https://www.woolworths.com.au/shop/productdetails/",
    selectors: {
      jsonLd: 'script[type="application/ld+json"]',
      jsState: "#__NEXT_DATA__",
      productName: [
        ".shelfProductTile-descriptionLink",
        ".product-title h1",
        '[class*="productTitle"]',
      ],
      price: [
        ".price-dollars",
        '[class*="price"]',
        ".product-price .primary",
      ],
      wasPrice: [
        ".was-price",
        '[class*="was-price"]',
        ".product-price .secondary",
      ],
      unitPrice: [
        ".price-per-cup",
        '[class*="cup-price"]',
        '[class*="unitPrice"]',
      ],
      unitMeasure: [
        ".price-per-cup",
        '[class*="cup-price"]',
        '[class*="unitMeasure"]',
      ],
      promoLabel: [
        ".product-specials",
        '[class*="promo"]',
        '[class*="special"]',
      ],
      personalisedSection: [
        '[class*="personalised"]',
        '[class*="for-you"]',
        '[data-testid*="personalised"]',
      ],
      productId: [
        '[data-stockcode]',
        '[data-product-id]',
        'meta[itemprop="sku"]',
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
