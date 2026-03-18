export default defineBackground(() => {
  console.log("[Chook Check] Background service worker started");

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "PRICE_OBSERVATION" && message.data) {
      const { productName, priceCents, storeChain } = message.data;
      console.log(
        `[Chook Check] ${storeChain}: ${productName} — $${(priceCents / 100).toFixed(2)}`,
      );
      // Storage layer will be wired up in Phase 3
    }
  });
});
