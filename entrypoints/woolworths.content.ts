export default defineContentScript({
  matches: ["https://www.woolworths.com.au/*"],
  runAt: "document_idle",

  main() {
    console.log("[Chook Check] Woolworths content script loaded");

    // Check if we're on a product page
    if (isProductPage()) {
      console.log("[Chook Check] Product page detected:", window.location.href);
      // Scraping logic will be implemented in Phase 2
    }
  },
});

function isProductPage(): boolean {
  return window.location.pathname.startsWith("/shop/productdetails/");
}
