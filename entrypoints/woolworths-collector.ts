import {
  scrapeWoolworths,
  scrapeWoolworthsSearchTiles,
} from "@/lib/scrapers/woolworths";
import { onUrlChange, waitForElement } from "@/lib/navigation";
import { isAllowedRetailerRoute } from "@/lib/retailer-routes";
import { enrichObservationWithPageContext } from "@/lib/page-context";
import type { PriceObservation } from "@/lib/types";

export default defineUnlistedScript(() => {
  const scraped = new Map<string, string>();
  let tileObserver: MutationObserver | null = null;

  const stopTiles = () => {
    tileObserver?.disconnect();
    tileObserver = null;
    scraped.clear();
  };

  const processRoute = async (url = window.location.href) => {
    stopTiles();
    if (!isAllowedRetailerRoute(url, "woolworths")) return;

    if (isProductPage(url)) {
      await waitForElement('[class*="product-price_component"]');
      scrapeAndSend();
      return;
    }

    await waitForElement("wc-product-tile");
    scrapeSearchTiles(scraped);
    tileObserver = watchForNewTiles(scraped);
  };

  void processRoute();
  onUrlChange((url) => void processRoute(url));
});

function isProductPage(url: string): boolean {
  return new URL(url).pathname.startsWith("/shop/productdetails/");
}

function sendObservation(observation: PriceObservation): void {
  const enriched = enrichObservationWithPageContext(observation, document);
  void browser.runtime.sendMessage({
    type: "PRICE_OBSERVATION",
    data: enriched,
  });
  void browser.runtime.sendMessage({
    type: "ACTIVE_PRODUCT",
    productId: enriched.productId,
  });
}

function scrapeAndSend(): void {
  const observation = scrapeWoolworths(document, window.location.href);
  if (observation) sendObservation(observation);
}

function fingerprint(observation: PriceObservation): string {
  return `${observation.priceCents}:${observation.wasPriceCents ?? ""}:${observation.promoType ?? ""}`;
}

function scrapeSearchTiles(scraped: Map<string, string>): void {
  for (const observation of scrapeWoolworthsSearchTiles(document)) {
    const nextFingerprint = fingerprint(observation);
    if (scraped.get(observation.productId) === nextFingerprint) continue;
    scraped.set(observation.productId, nextFingerprint);
    sendObservation(observation);
  }
}

function watchForNewTiles(scraped: Map<string, string>): MutationObserver {
  let debounceTimer: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => scrapeSearchTiles(scraped), 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
