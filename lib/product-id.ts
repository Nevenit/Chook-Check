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
