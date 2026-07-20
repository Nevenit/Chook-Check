const PRICE_SELECTORS: Record<string, string[]> = {
  woolworths: [
    '[class*="price-dollars"]',
    '[class*="product-price_component"]',
    ".shelfProductTile-price",
  ],
  coles: ['[data-testid="pricing"]', ".price__value", ".product-price"],
};

export function detectChain(): "woolworths" | "coles" | null {
  const hostname = window.location.hostname;
  if (hostname.includes("woolworths.com.au")) return "woolworths";
  if (hostname.includes("coles.com.au")) return "coles";
  return null;
}

export function findPriceElement(): Element | null {
  const chain = detectChain();
  if (!chain) return null;

  const selectors = PRICE_SELECTORS[chain];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Polls every 200ms for any of the chain's price selectors until found or timeout.
 * Resolves null on timeout — caller can fall back to fixed positioning.
 */
export function waitForPriceElement(timeoutMs = 3000): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = findPriceElement();
    if (found) {
      resolve(found);
      return;
    }
    const interval = 200;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const el = findPriceElement();
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}
