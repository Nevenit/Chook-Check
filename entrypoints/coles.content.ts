export default defineContentScript({
  matches: ["https://www.coles.com.au/*"],
  runAt: "document_idle",

  main() {
    console.log("[Chook Check] Coles content script loaded");

    if (isProductPage()) {
      console.log("[Chook Check] Product page detected:", window.location.href);
      // Scraping logic will be implemented in Phase 2
    }
  },
});

function isProductPage(): boolean {
  return window.location.pathname.startsWith("/product/");
}
