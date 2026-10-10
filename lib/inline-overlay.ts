import type { ChookCheckDB } from "./db";
import { getSettings } from "./settings";
import { isAllowedRetailerRoute } from "./retailer-routes";

export function isRetailerProductUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const chain =
      url.origin === "https://www.coles.com.au"
        ? "coles"
        : url.origin === "https://www.woolworths.com.au"
          ? "woolworths"
          : null;
    return (
      chain !== null &&
      isAllowedRetailerRoute(url, chain) &&
      url.pathname.startsWith(
        chain === "coles" ? "/product/" : "/shop/productdetails/",
      )
    );
  } catch {
    return false;
  }
}

interface InlinePageState {
  url: string;
  productId: string | null;
}

export async function showInlineOverlay(
  db: ChookCheckDB,
  tabId: number,
  expectedUrl?: string,
): Promise<boolean> {
  if (!(await getSettings(db)).inlineOverlayEnabled) return false;
  const page = (await browser.tabs.sendMessage(tabId, {
    type: "GET_INLINE_PAGE_STATE",
  })) as InlinePageState | null;
  if (
    !page?.productId ||
    !isRetailerProductUrl(page.url) ||
    (expectedUrl !== undefined && page.url !== expectedUrl)
  )
    return false;

  // The reservation lives in the collector, so simultaneous samples and worker
  // restarts cannot insert another overlay into an already instrumented page.
  const pause = await browser.tabs.sendMessage(tabId, {
    type: "PAUSE_SILENT_COLLECTION",
    pageUrl: page.url,
    productId: page.productId,
  });
  if (pause?.paused !== true) return false;
  if (pause.alreadyPaused) return true;
  if (!(await getSettings(db)).inlineOverlayEnabled) {
    await hideInlineOverlay(tabId, page.url);
    return false;
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/overlay.js"],
    });
    return true;
  } catch (error) {
    await hideInlineOverlay(tabId, page.url);
    throw error;
  }
}

export async function hideInlineOverlay(
  tabId: number,
  pageUrl?: string,
): Promise<void> {
  await browser.tabs
    .sendMessage(tabId, { type: "REMOVE_INLINE_OVERLAY", pageUrl })
    .catch(() => undefined);
}

/** Apply the setting to open retailer tabs as well as subsequent navigation. */
export async function syncInlineOverlays(db: ChookCheckDB): Promise<void> {
  const enabled = (await getSettings(db)).inlineOverlayEnabled;
  const tabs = await browser.tabs.query({
    url: ["https://www.coles.com.au/*", "https://www.woolworths.com.au/*"],
  });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      try {
        if (enabled) await showInlineOverlay(db, tab.id);
        else await hideInlineOverlay(tab.id);
      } catch {
        // Tabs may close or navigate while a settings change is being applied.
        // Their next captured product will retry through the normal collection path.
      }
    }),
  );
}
