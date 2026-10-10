import { onUrlChange, waitForElement } from "./navigation";
import { detectPageContext } from "./page-context";
import { observationKey } from "./observation-key";
import { isAllowedRetailerRoute } from "./retailer-routes";
import type { PriceObservation, StoreChain } from "./types";

interface Collector {
  chain: StoreChain;
  productPrefix: string;
  productSelector: string;
  tileSelector: string;
  scrapeProduct: (document: Document, url: string) => PriceObservation | null;
  scrapeTiles: (document: Document) => PriceObservation[];
}

// This module must remain read-only in the retailer page's DOM. Internal
// extension messages pause collection before detectable inline UI is inserted.
export function startCollector(config: Collector): () => void {
  const scraped = new Map<string, string>();
  let route = window.location.href;
  let paused = false;
  let overlayRequested = false;
  let stopped = false;
  let ready = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;

  const collect = () => {
    if (
      stopped ||
      !ready ||
      paused ||
      window.location.href !== route ||
      !isAllowedRetailerRoute(route, config.chain)
    )
      return;
    const productPage = new URL(route).pathname.startsWith(
      config.productPrefix,
    );
    const product = productPage ? config.scrapeProduct(document, route) : null;
    const observations = productPage
      ? product
        ? [product]
        : []
      : config.scrapeTiles(document);
    const context = detectPageContext(document);
    for (const observation of observations) {
      const enriched = { ...observation, ...context };
      const key = observationKey(enriched);
      if (scraped.get(enriched.productId) === key) continue;
      scraped.set(enriched.productId, key);
      void browser.runtime
        .sendMessage({ type: "PRICE_OBSERVATION", data: enriched })
        .then((saved) => {
          if (!saved && scraped.get(enriched.productId) === key)
            scraped.delete(enriched.productId);
        })
        .catch(() => {
          if (scraped.get(enriched.productId) === key)
            scraped.delete(enriched.productId);
        });
    }
  };

  const processRoute = async (url: string) => {
    route = url;
    ready = false;
    paused = false;
    overlayRequested = false;
    observer?.disconnect();
    clearTimeout(debounceTimer);
    scraped.clear();
    if (!isAllowedRetailerRoute(url, config.chain)) return;
    const productPage = new URL(url).pathname.startsWith(config.productPrefix);
    await waitForElement(
      productPage ? config.productSelector : config.tileSelector,
    );
    if (stopped || route !== url || window.location.href !== url) return;
    ready = true;
    collect();
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(collect, 500);
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true,
    });
  };

  const onMessage = (message: {
    type?: string;
    pageUrl?: string;
    productId?: string;
  }) => {
    if (message.type === "REMOVE_INLINE_OVERLAY") {
      if (
        message.pageUrl === undefined ||
        message.pageUrl === window.location.href
      )
        overlayRequested = false;
      // Removing visible UI cannot undo its earlier effects on this page.
      return;
    }
    if (
      message.type === "GET_ACTIVE_PRODUCT_ID" ||
      message.type === "GET_INLINE_PAGE_STATE"
    ) {
      const productPage =
        !stopped &&
        ready &&
        window.location.href === route &&
        isAllowedRetailerRoute(route, config.chain) &&
        new URL(route).pathname.startsWith(config.productPrefix);
      const productId = productPage
        ? (config.scrapeProduct(document, route)?.productId ?? null)
        : null;
      return Promise.resolve(
        message.type === "GET_ACTIVE_PRODUCT_ID"
          ? productId
          : { url: window.location.href, productId },
      );
    }
    if (message.type !== "PAUSE_SILENT_COLLECTION") return;
    if (
      message.pageUrl !== undefined &&
      (message.pageUrl !== route ||
        route !== window.location.href ||
        !ready ||
        config.scrapeProduct(document, route)?.productId !== message.productId)
    ) {
      return Promise.resolve({ paused: false, alreadyPaused: false });
    }
    const alreadyPaused = overlayRequested;
    paused = true;
    overlayRequested = true;
    return Promise.resolve({ paused: true, alreadyPaused });
  };
  browser.runtime.onMessage.addListener(onMessage);
  void processRoute(route);
  const stopNavigation = onUrlChange((url) => void processRoute(url));
  // A still-open page may provide another hourly sample without a DOM mutation.
  // This timer only reads the page; it never refreshes it or contacts a service.
  const sampleTimer = setInterval(collect, 60_000);
  return () => {
    stopped = true;
    stopNavigation();
    observer?.disconnect();
    clearTimeout(debounceTimer);
    clearInterval(sampleTimer);
    browser.runtime.onMessage.removeListener(onMessage);
  };
}
