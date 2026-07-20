import type { StoreChain } from "./types";

const BLOCKED_SEGMENTS = [
  "/account",
  "/accounts",
  "/cart",
  "/checkout",
  "/login",
  "/orders",
  "/order-history",
  "/payment",
  "/rewards",
  "/flybuys",
  "/everyday-rewards",
];

const ALLOWED_PREFIXES: Record<StoreChain, string[]> = {
  woolworths: ["/shop/productdetails/", "/shop/search/", "/shop/browse/"],
  coles: ["/product/", "/search", "/browse/", "/category/"],
};

export function isAllowedRetailerRoute(
  value: string | URL,
  chain: StoreChain,
): boolean {
  let url: URL;
  try {
    url = typeof value === "string" ? new URL(value) : value;
  } catch {
    return false;
  }
  const path = url.pathname.toLowerCase();
  if (BLOCKED_SEGMENTS.some((segment) => path.includes(segment))) return false;
  return ALLOWED_PREFIXES[chain].some((prefix) => path.startsWith(prefix));
}
