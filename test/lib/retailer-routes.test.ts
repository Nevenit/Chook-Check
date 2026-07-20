import { describe, expect, it } from "vitest";
import { isAllowedRetailerRoute } from "@/lib/retailer-routes";

describe("retailer route allowlist", () => {
  it.each([
    ["woolworths", "https://www.woolworths.com.au/shop/productdetails/123"],
    [
      "woolworths",
      "https://www.woolworths.com.au/shop/search/products?searchTerm=milk",
    ],
    ["coles", "https://www.coles.com.au/product/example-123"],
    ["coles", "https://www.coles.com.au/search?q=milk"],
  ] as const)("allows %s price surfaces", (chain, url) => {
    expect(isAllowedRetailerRoute(url, chain)).toBe(true);
  });

  it.each([
    ["woolworths", "https://www.woolworths.com.au/shop/checkout"],
    ["woolworths", "https://www.woolworths.com.au/account/orders"],
    ["woolworths", "https://www.woolworths.com.au/everyday-rewards/manage"],
    ["coles", "https://www.coles.com.au/cart"],
    ["coles", "https://www.coles.com.au/account/order-history"],
    ["coles", "https://www.coles.com.au/flybuys"],
  ] as const)("blocks sensitive %s routes", (chain, url) => {
    expect(isAllowedRetailerRoute(url, chain)).toBe(false);
  });

  it("fails closed for malformed URLs", () => {
    expect(isAllowedRetailerRoute("not a URL", "coles")).toBe(false);
  });
});
