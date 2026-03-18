import { describe, it, expect } from "vitest";
import {
  parseJsonLd,
  parsePriceCents,
  parseUnitMeasure,
  queryFallbackChain,
  extractTextFallbackChain,
  buildObservation,
} from "../../lib/scraper";

function createDocument(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html") as unknown as Document;
}

describe("parseJsonLd", () => {
  it("extracts Product JSON-LD from a page with one block", () => {
    const doc = createDocument(`
      <html><head>
        <script type="application/ld+json">{"@type":"Product","name":"Test","sku":"123"}</script>
      </head><body></body></html>
    `);
    const result = parseJsonLd(doc);
    expect(result).toEqual({ "@type": "Product", name: "Test", sku: "123" });
  });

  it("finds Product type among multiple JSON-LD blocks", () => {
    const doc = createDocument(`
      <html><head>
        <script type="application/ld+json">{"@type":"BreadcrumbList","items":[]}</script>
        <script type="application/ld+json">{"@type":"Product","name":"Found"}</script>
      </head><body></body></html>
    `);
    const result = parseJsonLd(doc);
    expect(result).toEqual({ "@type": "Product", name: "Found" });
  });

  it("returns null when no Product JSON-LD exists", () => {
    const doc = createDocument(`
      <html><head>
        <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      </head><body></body></html>
    `);
    expect(parseJsonLd(doc)).toBeNull();
  });

  it("returns null when no JSON-LD scripts exist", () => {
    const doc = createDocument(`<html><head></head><body></body></html>`);
    expect(parseJsonLd(doc)).toBeNull();
  });

  it("handles malformed JSON gracefully", () => {
    const doc = createDocument(`
      <html><head>
        <script type="application/ld+json">{not valid json</script>
      </head><body></body></html>
    `);
    expect(parseJsonLd(doc)).toBeNull();
  });
});

describe("parsePriceCents", () => {
  it("parses $3.50 to 350", () => {
    expect(parsePriceCents("$3.50")).toBe(350);
  });

  it("parses 3.50 without dollar sign to 350", () => {
    expect(parsePriceCents("3.50")).toBe(350);
  });

  it("parses $32.00 to 3200", () => {
    expect(parsePriceCents("$32.00")).toBe(3200);
  });

  it("parses $1.75 / 1L (unit price string) to 175", () => {
    expect(parsePriceCents("$1.75 / 1L")).toBe(175);
  });

  it("parses $5.52/ 100g to 552", () => {
    expect(parsePriceCents("$5.52/ 100g")).toBe(552);
  });

  it("parses whole dollar amounts like $3 to 300", () => {
    expect(parsePriceCents("$3")).toBe(300);
  });

  it("returns null for empty string", () => {
    expect(parsePriceCents("")).toBeNull();
  });

  it("returns null for non-price text", () => {
    expect(parsePriceCents("GET ONE BONUS COOKWARE CREDIT")).toBeNull();
  });

  it("parses numeric value 3.5 (number coerced to string) to 350", () => {
    expect(parsePriceCents("3.5")).toBe(350);
  });
});

describe("parseUnitMeasure", () => {
  it("extracts '1L' from '$1.75 / 1L'", () => {
    expect(parseUnitMeasure("$1.75 / 1L")).toBe("1L");
  });

  it("extracts '100g' from '$5.52/ 100g'", () => {
    expect(parseUnitMeasure("$5.52/ 100g")).toBe("100g");
  });

  it("returns null for text without slash", () => {
    expect(parseUnitMeasure("$3.50")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseUnitMeasure("")).toBeNull();
  });
});

describe("queryFallbackChain", () => {
  it("returns first matching element", () => {
    const doc = createDocument(
      `<html><body><div class="a">A</div><div class="b">B</div></body></html>`,
    );
    const el = queryFallbackChain(doc, [".missing", ".a", ".b"]);
    expect(el?.textContent).toBe("A");
  });

  it("returns null when no selectors match", () => {
    const doc = createDocument(`<html><body><div>X</div></body></html>`);
    expect(queryFallbackChain(doc, [".missing", ".also-missing"])).toBeNull();
  });
});

describe("extractTextFallbackChain", () => {
  it("returns trimmed text of first match", () => {
    const doc = createDocument(
      `<html><body><span class="price">  $3.50  </span></body></html>`,
    );
    expect(extractTextFallbackChain(doc, [".price"])).toBe("$3.50");
  });

  it("returns null when no selectors match", () => {
    const doc = createDocument(`<html><body></body></html>`);
    expect(extractTextFallbackChain(doc, [".nope"])).toBeNull();
  });
});

describe("buildObservation", () => {
  const validFields = {
    productId: "coles:123",
    productName: "Test Product",
    brand: "Brand",
    category: null,
    gtin: "1234567890",
    storeChain: "coles" as const,
    priceCents: 350,
    wasPriceCents: null,
    unitPriceCents: 175,
    unitMeasure: "1L",
    promoType: null,
    isPersonalised: false,
    pageUrl: "https://www.coles.com.au/product/test-123",
    observedAt: "2026-03-18T10:00:00.000Z",
  };

  it("returns a valid PriceObservation with contributed=false", () => {
    const obs = buildObservation(validFields);
    expect(obs).not.toBeNull();
    expect(obs!.contributed).toBe(false);
    expect(obs!.productId).toBe("coles:123");
    expect(obs!.priceCents).toBe(350);
  });

  it("returns null when productId is missing", () => {
    expect(buildObservation({ ...validFields, productId: "" })).toBeNull();
  });

  it("returns null when productName is missing", () => {
    expect(buildObservation({ ...validFields, productName: "" })).toBeNull();
  });

  it("returns null when priceCents is 0", () => {
    expect(buildObservation({ ...validFields, priceCents: 0 })).toBeNull();
  });

  it("returns null when priceCents is NaN", () => {
    expect(buildObservation({ ...validFields, priceCents: NaN })).toBeNull();
  });
});
