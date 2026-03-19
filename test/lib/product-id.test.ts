import { describe, it, expect } from "vitest";
import {
  extractWoolworthsSku,
  extractColesSku,
  getProductIdFromUrl,
} from "../../lib/product-id";

describe("extractWoolworthsSku", () => {
  it("extracts SKU from product page URL", () => {
    expect(
      extractWoolworthsSku("https://www.woolworths.com.au/shop/productdetails/32731/coca-cola"),
    ).toBe("32731");
  });

  it("returns null for non-product URLs", () => {
    expect(
      extractWoolworthsSku("https://www.woolworths.com.au/shop/browse/drinks"),
    ).toBeNull();
  });
});

describe("extractColesSku", () => {
  it("extracts SKU from product page URL", () => {
    expect(
      extractColesSku("https://www.coles.com.au/product/coca-cola-classic-1234567"),
    ).toBe("1234567");
  });

  it("extracts SKU with query params", () => {
    expect(
      extractColesSku("https://www.coles.com.au/product/milk-2l-9876543?pid=abc"),
    ).toBe("9876543");
  });

  it("returns null for non-product URLs", () => {
    expect(
      extractColesSku("https://www.coles.com.au/browse/dairy"),
    ).toBeNull();
  });
});

describe("getProductIdFromUrl", () => {
  it("returns prefixed woolworths product ID", () => {
    expect(
      getProductIdFromUrl("https://www.woolworths.com.au/shop/productdetails/32731/coca-cola"),
    ).toBe("woolworths:32731");
  });

  it("returns prefixed coles product ID", () => {
    expect(
      getProductIdFromUrl("https://www.coles.com.au/product/coca-cola-1234567"),
    ).toBe("coles:1234567");
  });

  it("returns null for unknown domains", () => {
    expect(
      getProductIdFromUrl("https://www.example.com/product/123"),
    ).toBeNull();
  });

  it("returns null for non-product pages", () => {
    expect(
      getProductIdFromUrl("https://www.woolworths.com.au/shop/browse/drinks"),
    ).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(getProductIdFromUrl("not-a-url")).toBeNull();
  });
});
