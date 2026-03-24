import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitObservations, getProductStats, deleteContributorData } from "@/lib/api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("submitObservations", () => {
  it("sends POST with correct body and returns response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ accepted: 1, duplicates: 0, rejected: 0 }),
    });

    const body = {
      contributorId: "00000000-0000-0000-0000-000000000001",
      observations: [
        {
          productId: "woolworths:123",
          productName: "Vegemite 380g",
          storeChain: "woolworths" as const,
          priceCents: 750,
          isPersonalised: false,
          observedAt: new Date().toISOString(),
        },
      ],
    };

    const result = await submitObservations(body);
    expect(result.accepted).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/observations"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: "rate_limited", message: "Too many requests" }),
    });

    await expect(submitObservations({
      contributorId: "00000000-0000-0000-0000-000000000001",
      observations: [],
    })).rejects.toThrow();
  });
});

describe("getProductStats", () => {
  it("sends GET with query params and returns stats", async () => {
    const stats = {
      productId: "woolworths:123",
      productName: "Vegemite",
      brand: null,
      storeChain: "woolworths",
      quorum: true,
      currentMedianCents: 750,
      minCents: 700,
      maxCents: 800,
      observationCount: 10,
      contributorCount: 3,
      priceHistory: [],
      promoFrequency: {},
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(stats),
    });

    const result = await getProductStats("woolworths:123", 30, "woolworths");
    expect(result).toEqual(stats);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/products/woolworths%3A123/stats?days=30&chain=woolworths"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "not_found" }),
    });

    const result = await getProductStats("woolworths:999");
    expect(result).toBeNull();
  });
});

describe("deleteContributorData", () => {
  it("sends DELETE and returns deleted count", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deleted: 5 }),
    });

    const result = await deleteContributorData("00000000-0000-0000-0000-000000000001");
    expect(result.deleted).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/contributor/00000000-0000-0000-0000-000000000001"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
