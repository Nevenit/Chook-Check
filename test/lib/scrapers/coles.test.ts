import { describe, it, expect } from "vitest";
import { scrapeColes } from "../../../lib/scrapers/coles";
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
  "https://www.coles.com.au/product/coca-cola-soft-drink-coke-2l-191736";
const MOCK_SALE_URL =
  "https://www.coles.com.au/product/ferrero-collection-rocher-raffaello-rondnoir-chocolate-gift-box-15-pack-172g-1545663";

describe("scrapeColes", () => {
  describe("regular product", () => {
    it("extracts a valid PriceObservation", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL);
      expect(obs).not.toBeNull();
    });

    it("extracts correct productId", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.productId).toBe("coles:191736");
    });

    it("extracts correct productName", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.productName).toBe("Coca-Cola Soft Drink Coke | 2L");
    });

    it("extracts correct price in cents", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.priceCents).toBe(350);
    });

    it("extracts correct brand", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.brand).toBe("Coca-Cola");
    });

    it("extracts correct gtin", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.gtin).toBe("9300675001007");
    });

    it("has correct storeChain", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.storeChain).toBe("coles");
    });

    it("has no wasPriceCents for non-sale item", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.wasPriceCents).toBeNull();
    });

    it("has pageUrl set", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.pageUrl).toBe(MOCK_URL);
    });

    it("has observedAt as valid ISO string", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(new Date(obs.observedAt).toISOString()).toBe(obs.observedAt);
    });

    it("has contributed set to false", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.contributed).toBe(false);
    });

    it("extracts unit price", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.unitPriceCents).toBe(175);
    });

    it("extracts unit measure", () => {
      const doc = loadFixture("coles product.html");
      const obs = scrapeColes(doc, MOCK_URL)!;
      expect(obs.unitMeasure).toBe("1L");
    });
  });

  describe("product on sale", () => {
    it("extracts correct sale price", () => {
      const doc = loadFixture("coles product on sale.html");
      const obs = scrapeColes(doc, MOCK_SALE_URL)!;
      expect(obs.priceCents).toBe(950);
    });

    it("extracts correct wasPriceCents", () => {
      const doc = loadFixture("coles product on sale.html");
      const obs = scrapeColes(doc, MOCK_SALE_URL)!;
      expect(obs.wasPriceCents).toBe(1900);
    });

    it("extracts promoType", () => {
      const doc = loadFixture("coles product on sale.html");
      const obs = scrapeColes(doc, MOCK_SALE_URL)!;
      expect(obs.promoType).not.toBeNull();
    });
  });

  describe("negative cases", () => {
    it("returns null for home page", () => {
      const doc = loadFixture("coles home page.html");
      const obs = scrapeColes(doc, "https://www.coles.com.au/");
      expect(obs).toBeNull();
    });

    it("returns null for search page", () => {
      const doc = loadFixture("coles product search.html");
      const obs = scrapeColes(
        doc,
        "https://www.coles.com.au/search?q=coca+cola",
      );
      expect(obs).toBeNull();
    });
  });
});
