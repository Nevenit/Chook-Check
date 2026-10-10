import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { initDefaults } from "../../lib/store";
import {
  showInlineOverlay,
  syncInlineOverlays,
} from "../../lib/inline-overlay";

let db: ChookCheckDB;
const sendMessage = vi.fn();
const executeScript = vi.fn();
const query = vi.fn();
const url = "https://www.coles.com.au/product/milk-123";
let page: { url: string; productId: string | null };
let reserved: boolean;
beforeEach(async () => {
  db = new ChookCheckDB("TestDB_inline_overlay");
  await initDefaults(db);
  page = { url, productId: "123" };
  reserved = false;
  sendMessage.mockReset().mockImplementation(async (_tab, message) => {
    if (message.type === "GET_INLINE_PAGE_STATE") return page;
    if (message.type === "PAUSE_SILENT_COLLECTION") {
      const alreadyPaused = reserved;
      reserved = true;
      return { paused: true, alreadyPaused };
    }
    if (message.type === "REMOVE_INLINE_OVERLAY") reserved = false;
  });
  executeScript.mockReset().mockResolvedValue([]);
  query.mockReset().mockResolvedValue([{ id: 1 }, { id: 2 }]);
  vi.stubGlobal("browser", {
    tabs: { sendMessage, query },
    scripting: { executeScript },
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});
const enable = () =>
  db.userSettings.update("default", { inlineOverlayEnabled: true });

describe("automatic inline overlay", () => {
  it("does not contact or inject into tabs by default", async () => {
    expect(await showInlineOverlay(db, 1)).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("reserves the product before injection and avoids concurrent duplicates", async () => {
    await enable();
    await Promise.all([showInlineOverlay(db, 1), showInlineOverlay(db, 1)]);
    expect(sendMessage).toHaveBeenCalledWith(1, {
      type: "PAUSE_SILENT_COLLECTION",
      pageUrl: url,
      productId: "123",
    });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["/content-scripts/overlay.js"],
    });
  });

  it.each([
    { url: "https://www.coles.com.au/browse/dairy", productId: "123" },
    { url: "https://www.coles.com.au/checkout", productId: "123" },
    { url: "https://example.com/product/milk-123", productId: "123" },
    { url, productId: null },
  ])("skips ineligible page state %j", async (state) => {
    await enable();
    page = state;
    expect(await showInlineOverlay(db, 1)).toBe(false);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("rejects a sample from the page before navigation", async () => {
    await enable();
    expect(await showInlineOverlay(db, 1, url + "-old")).toBe(false);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("honours opt-out while acquiring the page reservation", async () => {
    await enable();
    sendMessage.mockImplementation(async (_tab, message) => {
      if (message.type === "GET_INLINE_PAGE_STATE") return page;
      if (message.type === "PAUSE_SILENT_COLLECTION") {
        await db.userSettings.update("default", {
          inlineOverlayEnabled: false,
        });
        return { paused: true, alreadyPaused: false };
      }
    });
    expect(await showInlineOverlay(db, 1)).toBe(false);
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(1, {
      type: "REMOVE_INLINE_OVERLAY",
      pageUrl: url,
    });
  });

  it("applies enabling and disabling to open tabs and allows re-enabling", async () => {
    query.mockResolvedValue([{ id: 1 }]);
    await enable();
    await syncInlineOverlays(db);
    expect(executeScript).toHaveBeenCalledTimes(1);
    await db.userSettings.update("default", { inlineOverlayEnabled: false });
    await syncInlineOverlays(db);
    expect(reserved).toBe(false);
    await enable();
    await syncInlineOverlays(db);
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it("releases a failed injection so a later attempt can retry", async () => {
    await enable();
    executeScript.mockRejectedValueOnce(new Error("Tab navigated"));
    await expect(showInlineOverlay(db, 1)).rejects.toThrow("Tab navigated");
    expect(reserved).toBe(false);
    expect(await showInlineOverlay(db, 1)).toBe(true);
  });
});
