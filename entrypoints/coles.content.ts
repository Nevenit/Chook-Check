import {
  scrapeColes,
  scrapeColesSearchTiles,
} from "@/lib/scrapers/coles";
import { onUrlChange, waitForElement } from "@/lib/navigation";

export default defineContentScript({
  matches: ["https://www.coles.com.au/*"],
  runAt: "document_idle",

  main() {
    console.log("[Chook Check] Coles content script loaded");
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
        waitForElement('[data-testid="pricing"]').then(() => {
          scrapeAndSend();
        });
      } else {
        waitForElement('[data-testid="product-tile"]').then(() => {
          scrapeSearchTiles(scrapedSkus);
          tileObserver = watchForNewTiles(scrapedSkus);
        });
      }
    });
  },
});

function isProductPage(url?: string): boolean {
  const pathname = url ? new URL(url).pathname : window.location.pathname;
  return pathname.startsWith("/product/");
}

function scrapeAndSend(): void {
  const observation = scrapeColes(document, window.location.href);
  if (observation) {
    console.log(
      "[Chook Check] Scraped Coles product:",
      observation.productName,
    );
    browser.runtime.sendMessage({
      type: "PRICE_OBSERVATION",
      data: observation,
    });
  } else {
    console.warn("[Chook Check] Failed to scrape Coles product page");
  }
}

function scrapeSearchTiles(scrapedSkus: Set<string>): void {
  const observations = scrapeColesSearchTiles(document);
  let newCount = 0;
  for (const obs of observations) {
    if (scrapedSkus.has(obs.productId)) continue;
    scrapedSkus.add(obs.productId);
    newCount++;
    browser.runtime.sendMessage({ type: "PRICE_OBSERVATION", data: obs });
  }
  if (newCount > 0) {
    console.log(`[Chook Check] Scraped ${newCount} Coles search tile(s)`);
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
