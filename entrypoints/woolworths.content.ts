import {
  scrapeWoolworths,
  scrapeWoolworthsSearchTiles,
} from "@/lib/scrapers/woolworths";
import { onUrlChange, waitForElement } from "@/lib/navigation";

export default defineContentScript({
  matches: ["https://www.woolworths.com.au/*"],
  runAt: "document_idle",

  main() {
    console.log("[Chook Check] Woolworths content script loaded");
    const scrapedSkus = new Set<string>();
    let tileObserver: MutationObserver | null = null;

    if (isProductPage()) {
      scrapeAndSend();
    } else {
      scrapeSearchTiles(scrapedSkus);
      tileObserver = watchForNewTiles(scrapedSkus);
    }

    onUrlChange((url) => {
      scrapedSkus.clear();
      tileObserver?.disconnect();
      tileObserver = null;

      if (isProductPage(url)) {
        waitForElement('[class*="product-price_component"]').then(() => {
          scrapeAndSend();
        });
      } else {
        waitForElement("wc-product-tile").then(() => {
          scrapeSearchTiles(scrapedSkus);
          tileObserver = watchForNewTiles(scrapedSkus);
        });
      }
    });
  },
});

function isProductPage(url?: string): boolean {
  const pathname = url ? new URL(url).pathname : window.location.pathname;
  return pathname.startsWith("/shop/productdetails/");
}

function scrapeAndSend(): void {
  const observation = scrapeWoolworths(document, window.location.href);
  if (observation) {
    console.log(
      "[Chook Check] Scraped Woolworths product:",
      observation.productName,
    );
    browser.runtime.sendMessage({
      type: "PRICE_OBSERVATION",
      data: observation,
    });
  } else {
    console.warn("[Chook Check] Failed to scrape Woolworths product page");
  }
}

function scrapeSearchTiles(scrapedSkus: Set<string>): void {
  const observations = scrapeWoolworthsSearchTiles(document);
  let newCount = 0;
  for (const obs of observations) {
    if (scrapedSkus.has(obs.productId)) continue;
    scrapedSkus.add(obs.productId);
    newCount++;
    browser.runtime.sendMessage({ type: "PRICE_OBSERVATION", data: obs });
  }
  if (newCount > 0) {
    console.log(
      `[Chook Check] Scraped ${newCount} Woolworths search tile(s)`,
    );
  }
}

function watchForNewTiles(scrapedSkus: Set<string>): MutationObserver {
  let debounceTimer: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => scrapeSearchTiles(scrapedSkus), 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
