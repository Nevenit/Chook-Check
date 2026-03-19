import { describe, it, expect } from "vitest";
import { formatPrice } from "../../../components/shared/formatPrice";

describe("formatPrice", () => {
  it("formats cents to dollar string", () => {
    expect(formatPrice(350)).toBe("$3.50");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("formats large amounts", () => {
    expect(formatPrice(12345)).toBe("$123.45");
  });

  it("formats single digit cents", () => {
    expect(formatPrice(5)).toBe("$0.05");
  });
});
