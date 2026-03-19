import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectChain, findPriceElement } from "../../lib/overlay-selectors";

describe("detectChain", () => {
  it("detects woolworths from hostname", () => {
    vi.stubGlobal("location", { hostname: "www.woolworths.com.au" });
    expect(detectChain()).toBe("woolworths");
  });

  it("detects coles from hostname", () => {
    vi.stubGlobal("location", { hostname: "www.coles.com.au" });
    expect(detectChain()).toBe("coles");
  });

  it("returns null for unknown hostname", () => {
    vi.stubGlobal("location", { hostname: "www.example.com" });
    expect(detectChain()).toBeNull();
  });
});

describe("findPriceElement", () => {
  beforeEach(() => {
    document.body.textContent = "";
  });

  it("finds woolworths price element", () => {
    vi.stubGlobal("location", { hostname: "www.woolworths.com.au" });
    const el = document.createElement("div");
    el.className = "price-dollars";
    document.body.appendChild(el);
    expect(findPriceElement()).toBe(el);
  });

  it("returns null when no price element found", () => {
    vi.stubGlobal("location", { hostname: "www.woolworths.com.au" });
    expect(findPriceElement()).toBeNull();
  });
});
