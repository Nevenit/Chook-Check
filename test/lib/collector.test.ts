// @vitest-environment-options {"url":"https://www.coles.com.au/product/example-123"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCollector } from "../../lib/collector";
import { makeObservation } from "../helpers";

let stop: (() => void) | undefined;
let listener: (message: {
  type: string;
  pageUrl?: string;
  productId?: string;
}) => unknown;
const sendMessage = vi.fn();
const scrapeProduct = vi.fn();
const scrapeTiles = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T02:59:00Z"));
  document.body.innerHTML = '<div data-testid="pricing">$3.50</div>';
  window.history.replaceState(
    {},
    "",
    "https://www.coles.com.au/product/example-123",
  );
  sendMessage.mockReset().mockResolvedValue(true);
  scrapeProduct.mockReset().mockImplementation(() =>
    makeObservation({
      storeChain: "coles",
      observedAt: new Date().toISOString(),
    }),
  );
  scrapeTiles.mockReset().mockReturnValue([]);
  vi.stubGlobal("browser", {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (callback: typeof listener) => {
          listener = callback;
        },
        removeListener: vi.fn(),
      },
    },
  });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function start() {
  stop = startCollector({
    chain: "coles",
    productPrefix: "/product/",
    productSelector: '[data-testid="pricing"]',
    tileSelector: '[data-testid="product-tile"]',
    scrapeProduct,
    scrapeTiles,
  });
  await vi.advanceTimersByTimeAsync(0);
}

describe("silent collector", () => {
  it("takes a new hourly sample without changing the page", async () => {
    const before = document.documentElement.outerHTML;
    await start();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it("retains changed context at an unchanged price", async () => {
    vi.setSystemTime(new Date("2026-09-06T02:01:00Z"));
    await start();
    const script = document.createElement("script");
    script.type = "application/json";
    script.textContent = '{"isLoggedIn":true}';
    document.body.append(script);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage.mock.calls.at(-1)?.[0].data.authState).toBe("signed_in");
  });

  it("pauses before inline insertion until the page changes", async () => {
    await start();
    await listener({ type: "PAUSE_SILENT_COLLECTION" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    window.history.pushState({}, "", "/product/another-456");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("answers active-product queries independently of background-worker state", async () => {
    await start();
    await expect(listener({ type: "GET_ACTIVE_PRODUCT_ID" })).resolves.toBe(
      "test-product-1",
    );
    await listener({ type: "PAUSE_SILENT_COLLECTION" });
    await expect(listener({ type: "GET_ACTIVE_PRODUCT_ID" })).resolves.toBe(
      "test-product-1",
    );
    window.history.pushState({}, "", "/checkout");
    await expect(
      listener({ type: "GET_ACTIVE_PRODUCT_ID" }),
    ).resolves.toBeNull();
  });

  it("keeps the overlay activation guard in the page across worker restarts", async () => {
    await start();
    await expect(
      listener({ type: "PAUSE_SILENT_COLLECTION" }),
    ).resolves.toEqual({ paused: true, alreadyPaused: false });
    await expect(
      listener({ type: "PAUSE_SILENT_COLLECTION" }),
    ).resolves.toEqual({ paused: true, alreadyPaused: true });
    window.history.pushState({}, "", "/product/another-456");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(
      listener({ type: "PAUSE_SILENT_COLLECTION" }),
    ).resolves.toEqual({ paused: true, alreadyPaused: false });
  });

  it("releases a removed badge reservation without resuming silent capture", async () => {
    await start();
    await listener({ type: "PAUSE_SILENT_COLLECTION" });
    listener({ type: "REMOVE_INLINE_OVERLAY" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await expect(
      listener({ type: "PAUSE_SILENT_COLLECTION" }),
    ).resolves.toEqual({
      paused: true,
      alreadyPaused: false,
    });
  });

  it("rejects stale product reservations without pausing the current page", async () => {
    await start();
    await expect(listener({ type: "GET_INLINE_PAGE_STATE" })).resolves.toEqual({
      url: window.location.href,
      productId: "test-product-1",
    });
    await expect(
      listener({
        type: "PAUSE_SILENT_COLLECTION",
        pageUrl: window.location.href,
        productId: "previous-product",
      }),
    ).resolves.toEqual({
      paused: false,
      alreadyPaused: false,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not capture excluded routes or finish a stale readiness wait", async () => {
    document.body.innerHTML = "";
    await start();
    window.history.pushState({}, "", "/checkout");
    await vi.advanceTimersByTimeAsync(65_000);
    expect(scrapeProduct).not.toHaveBeenCalled();
    expect(scrapeTiles).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("retries a sample after a storage failure", async () => {
    sendMessage.mockResolvedValueOnce(false);
    vi.setSystemTime(new Date("2026-09-06T02:01:00Z"));
    await start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
