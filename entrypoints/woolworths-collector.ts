import { startCollector } from "@/lib/collector";
import {
  scrapeWoolworths,
  scrapeWoolworthsSearchTiles,
} from "@/lib/scrapers/woolworths";

export default defineUnlistedScript(() => {
  startCollector({
    chain: "woolworths",
    productPrefix: "/shop/productdetails/",
    productSelector: '[class*="product-price_component"]',
    tileSelector: "wc-product-tile",
    scrapeProduct: scrapeWoolworths,
    scrapeTiles: scrapeWoolworthsSearchTiles,
  });
});
