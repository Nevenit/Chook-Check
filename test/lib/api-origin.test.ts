import { describe, it, expect } from "vitest";
import { PRODUCTION_API_ORIGIN, resolveApiOrigin } from "@/lib/api-origin";

describe("resolveApiOrigin", () => {
  it("uses the production API when no override is set", () => {
    expect(resolveApiOrigin(undefined)).toBe(PRODUCTION_API_ORIGIN);
    expect(resolveApiOrigin("")).toBe(PRODUCTION_API_ORIGIN);
  });

  it("accepts a loopback development API", () => {
    expect(resolveApiOrigin("http://localhost:8787")).toBe(
      "http://localhost:8787",
    );
    expect(resolveApiOrigin("http://127.0.0.1:8787/")).toBe(
      "http://127.0.0.1:8787",
    );
  });

  it("rejects remote hosts so a test build cannot send data elsewhere", () => {
    expect(() => resolveApiOrigin("https://example.com")).toThrow(
      /CHOOK_API_ORIGIN/,
    );
    expect(() => resolveApiOrigin("http://localhost.example.com")).toThrow();
  });

  it("rejects values that are not a bare origin", () => {
    expect(() => resolveApiOrigin("http://localhost:8787/api")).toThrow();
    expect(() => resolveApiOrigin("http://localhost:8787?x=1")).toThrow();
    expect(() => resolveApiOrigin("ftp://localhost")).toThrow();
    expect(() => resolveApiOrigin("not a url")).toThrow();
  });
});
