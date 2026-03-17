export default defineBackground(() => {
  console.log("[Chook Check] Background service worker started");

  // Listen for price observations from content scripts
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "PRICE_OBSERVATION") {
      console.log("[Chook Check] Received price observation:", message.data);
      // Storage layer will be wired up in Phase 3
    }
  });
});
