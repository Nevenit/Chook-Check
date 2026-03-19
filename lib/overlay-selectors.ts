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
