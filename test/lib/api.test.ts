import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteContributorData,
  downloadCommunitySnapshot,
  registerContributor,
  submitObservations,
} from "@/lib/api";
import { PRODUCTION_API_ORIGIN } from "@/lib/api-origin";
import type { SubmitRequestV2 } from "@/lib/types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => mockFetch.mockReset());

const body: SubmitRequestV2 = {
  mode: "history",
  observations: [
    {
      schemaVersion: 2,
      clientObservationId: "00000000-0000-4000-8000-000000000001",
      productId: "woolworths:123",
      productName: "Vegemite 380g",
      brand: "Vegemite",
      category: null,
      gtin: null,
      storeChain: "woolworths",
      currentPriceCents: 750,
      regularPriceCents: null,
      unitPriceCents: null,
      unitMeasure: null,
      offerType: null,
      offerTextNormalized: null,
      offerId: null,
      requiredQuantity: null,
      sourceSurface: "product_page",
      extractionSource: "json_ld",
      scraperVersion: "2.1.0",
      instrumentMode: "silent",
      capturePhase: "baseline",
      comparisonId: null,
      storeId: null,
      coarseRegion: null,
      fulfilmentMode: "unknown",
      authState: "unknown",
      loyaltyState: "unknown",
      browserFamily: null,
      clientObservedAt: new Date().toISOString(),
    },
  ],
};

describe("registerContributor", () => {
  it("registers without sending identity fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          contributorId: "id",
          submitToken: "submit",
          deletionToken: "delete",
        }),
    });
    expect(await registerContributor()).toMatchObject({ contributorId: "id" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/contributors"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("submitObservations", () => {
  it("uses the v2 route and bearer submit token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ accepted: 1, duplicates: 0, rejected: 0 }),
    });
    expect((await submitObservations(body, "submit-secret")).accepted).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/observations"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer submit-secret",
        }),
      }),
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ message: "Too many requests" }),
    });
    await expect(submitObservations(body, "submit-secret")).rejects.toThrow(
      "Too many requests",
    );
  });
});

describe("downloadCommunitySnapshot", () => {
  it("downloads one bulk snapshot without a product identifier in the URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ ETag: '"snapshot-1"' }),
      json: () => Promise.resolve({ products: [] }),
    });
    const result = await downloadCommunitySnapshot();
    expect(result.notModified).toBe(false);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/v2/snapshots/products");
    expect(url).not.toContain("woolworths%3A");
  });

  it("targets the production API unless a build overrides it", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ products: [] }),
    });
    await downloadCommunitySnapshot();
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${PRODUCTION_API_ORIGIN}/api/v2/snapshots/products`,
    );
  });
});

describe("deleteContributorData", () => {
  it("uses a distinct bearer deletion token and no contributor ID in the URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deleted: 5 }),
    });
    expect((await deleteContributorData("delete-secret")).deleted).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v2\/contributor$/),
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer delete-secret" },
      }),
    );
  });
});
