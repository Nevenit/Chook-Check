import { scrapeWoolworths } from "@/lib/scrapers/woolworths";
import { onUrlChange, waitForElement } from "@/lib/navigation";

export default defineContentScript({
  matches: ["https://www.woolworths.com.au/*"],
  runAt: "document_idle",

  main() {
    console.log("[Chook Check] Woolworths content script loaded");

    // Scrape on initial load
    if (isProductPage()) {
      scrapeAndSend();
    }

    // Handle SPA navigation
    onUrlChange((url) => {
      if (isProductPage(url)) {
        // Wait for price element to render before scraping
        waitForElement('[class*="product-price_component"]').then(() => {
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
  return pathname.startsWith("/shop/productdetails/");
}

function scrapeAndSend(): void {
  const observation = scrapeWoolworths(document, window.location.href);
  if (observation) {
    console.log("[Chook Check] Scraped Woolworths product:", observation.productName);
    browser.runtime.sendMessage({
      type: "PRICE_OBSERVATION",
      data: observation,
    });
  } else {
    console.warn("[Chook Check] Failed to scrape Woolworths product page");
  }
}
