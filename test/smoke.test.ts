import { describe, it, expect } from "vitest";

describe("project setup", () => {
  it("vitest is working", () => {
    expect(1 + 1).toBe(2);
  });

  it("can import types", async () => {
    const types = await import("../lib/types");
    expect(types).toBeDefined();
  });
});
