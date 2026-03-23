export function extractWoolworthsSku(url: string): string | null {
  const match = url.match(/\/shop\/productdetails\/(\d+)/);
  return match ? match[1] : null;
}

export function extractColesSku(url: string): string | null {
  const match = url.match(/\/product\/.*?-(\d+)(?:\?|$)/);
  return match ? match[1] : null;
}

export function getProductIdFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("woolworths.com.au")) {
      const sku = extractWoolworthsSku(url);
      return sku ? `woolworths:${sku}` : null;
    }
    if (hostname.includes("coles.com.au")) {
      const sku = extractColesSku(url);
      return sku ? `coles:${sku}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function getProductIdFromDom(): string | null {
  const chain = window.location.hostname.includes("woolworths.com.au")
    ? "woolworths"
    : window.location.hostname.includes("coles.com.au")
      ? "coles"
      : null;
  if (!chain) return null;

  // 1. Try JSON-LD structured data
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" && item.sku) {
          return `${chain}:${item.sku}`;
        }
      }
    } catch {
      // invalid JSON-LD, skip
    }
  }

  // 2. Try canonical link
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const href = canonical.getAttribute("href") ?? "";
    const id = getProductIdFromUrl(
      href.startsWith("/") ? window.location.origin + href : href,
    );
    if (id) return id;
  }

  // 3. Try og:url meta tag
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) {
    const content = ogUrl.getAttribute("content") ?? "";
    const id = getProductIdFromUrl(
      content.startsWith("/") ? window.location.origin + content : content,
    );
    if (id) return id;
  }

  return null;
}
