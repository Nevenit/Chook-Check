import { scrapeColes } from "@/lib/scrapers/coles";
import { onUrlChange, waitForElement } from "@/lib/navigation";

export default defineContentScript({
  matches: ["https://www.coles.com.au/*"],
  runAt: "document_idle",

  main() {
    console.log("[Chook Check] Coles content script loaded");

    if (isProductPage()) {
      scrapeAndSend();
    }

    onUrlChange((url) => {
      if (isProductPage(url)) {
        waitForElement('[data-testid="pricing"]').then(() => {
          scrapeAndSend();
        });
      }
    });
  },
});

function isProductPage(url?: string): boolean {
  const pathname = url
    ? new URL(url).pathname
    : window.location.pathname;
  return pathname.startsWith("/product/");
}

function scrapeAndSend(): void {
  const observation = scrapeColes(document, window.location.href);
  if (observation) {
    console.log("[Chook Check] Scraped Coles product:", observation.productName);
    browser.runtime.sendMessage({
      type: "PRICE_OBSERVATION",
      data: observation,
    });
  } else {
    console.warn("[Chook Check] Failed to scrape Coles product page");
  }
}
