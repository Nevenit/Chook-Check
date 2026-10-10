import { startCollector } from "@/lib/collector";
import { scrapeColes, scrapeColesSearchTiles } from "@/lib/scrapers/coles";

export default defineUnlistedScript(() => {
  startCollector({
    chain: "coles",
    productPrefix: "/product/",
    productSelector: '[data-testid="pricing"]',
    tileSelector: '[data-testid="product-tile"]',
    scrapeProduct: scrapeColes,
    scrapeTiles: scrapeColesSearchTiles,
  });
});
