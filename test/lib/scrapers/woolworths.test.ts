import { describe, it, expect } from "vitest";
import { scrapeWoolworths } from "../../../lib/scrapers/woolworths";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadFixture(filename: string): Document {
  const html = readFileSync(
    resolve(__dirname, "../../fixtures", filename),
    "utf-8",
  );
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html") as unknown as Document;
}

const MOCK_URL =
  "https://www.woolworths.com.au/shop/productdetails/38121/coca-cola-classic-soft-drink-bottle-bottle";
const MOCK_SALE_URL =
  "https://www.woolworths.com.au/shop/productdetails/84552/coca-cola-classic-soft-drink-multipack-cans";

describe("scrapeWoolworths", () => {
  describe("regular product", () => {
    it("extracts a valid PriceObservation", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL);
      expect(obs).not.toBeNull();
    });

    it("extracts correct productId", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.productId).toBe("woolworths:38121");
    });

    it("extracts correct productName", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.productName).toContain("Coca-Cola Classic");
    });

    it("extracts correct price in cents", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.priceCents).toBe(350);
    });

    it("extracts correct brand", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.brand).toBe("Coca-Cola");
    });

    it("extracts correct gtin", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.gtin).toBe("9300675001007");
    });

    it("has correct storeChain", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.storeChain).toBe("woolworths");
    });

    it("has no wasPriceCents for non-sale item", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.wasPriceCents).toBeNull();
    });

    it("extracts unit price", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.unitPriceCents).toBe(175);
    });

    it("has pageUrl set", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.pageUrl).toBe(MOCK_URL);
    });

    it("has contributed set to false", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.contributed).toBe(false);
    });

    it("has promoType for lower shelf price", () => {
      const doc = loadFixture("woolworths product.html");
      const obs = scrapeWoolworths(doc, MOCK_URL)!;
      expect(obs.promoType).toBe("lower_price");
    });
  });

  describe("product on sale", () => {
    it("extracts correct sale price", () => {
      const doc = loadFixture("woolworths product on sale.html");
      const obs = scrapeWoolworths(doc, MOCK_SALE_URL)!;
      expect(obs.priceCents).toBe(3200);
    });

    it("extracts correct wasPriceCents", () => {
      const doc = loadFixture("woolworths product on sale.html");
      const obs = scrapeWoolworths(doc, MOCK_SALE_URL)!;
      expect(obs.wasPriceCents).toBe(4000);
    });

    it("extracts promoType as special", () => {
      const doc = loadFixture("woolworths product on sale.html");
      const obs = scrapeWoolworths(doc, MOCK_SALE_URL)!;
      expect(obs.promoType).toBe("special");
    });

    it("extracts correct productId", () => {
      const doc = loadFixture("woolworths product on sale.html");
      const obs = scrapeWoolworths(doc, MOCK_SALE_URL)!;
      expect(obs.productId).toBe("woolworths:84552");
    });
  });

  describe("negative cases", () => {
    it("returns null for home page", () => {
      const doc = loadFixture("woolworths home page.html");
      const obs = scrapeWoolworths(doc, "https://www.woolworths.com.au/");
      expect(obs).toBeNull();
    });

    it("returns null for search page", () => {
      const doc = loadFixture("woolworths product search.html");
      const obs = scrapeWoolworths(
        doc,
        "https://www.woolworths.com.au/shop/search/products?searchTerm=coca+cola",
      );
      expect(obs).toBeNull();
    });
  });
});
