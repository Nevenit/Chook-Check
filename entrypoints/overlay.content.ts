import { runInlineComparison } from "@/lib/inline-comparison";
import { onUrlChange } from "@/lib/navigation";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { waitForPriceElement } from "@/lib/overlay-selectors";
import { OverlayRoot } from "@/components/overlay/OverlayRoot";
import { scrapeColes } from "@/lib/scrapers/coles";
import { scrapeWoolworths } from "@/lib/scrapers/woolworths";
import { isAllowedRetailerRoute } from "@/lib/retailer-routes";
import { enrichObservationWithPageContext } from "@/lib/page-context";
import type { PriceObservation, StoreChain } from "@/lib/types";
import sparklineCss from "@/components/overlay/sparkline.css?inline";
import panelCss from "@/components/overlay/overlay-panel.css?inline";
import badgeCss from "@/components/overlay/overlay-badge.css?inline";

export default defineContentScript({
  matches: ["https://www.woolworths.com.au/*", "https://www.coles.com.au/*"],
  runAt: "document_idle",
  registration: "runtime",
  noScriptStartedPostMessage: true,

  main() {
    return showOverlay();
  },
});

async function showOverlay(): Promise<void> {
  const chain = getChain();
  if (!chain || !isAllowedRetailerRoute(window.location.href, chain)) {
    throw new Error(
      "Inline overlay is only available on approved retailer routes",
    );
  }

  const url = window.location.href;
  let active = true;
  let removeUi: (() => void) | undefined;
  const dispose = () => {
    active = false;
    removeUi?.();
    stopNavigation();
    browser.runtime.onMessage.removeListener(onMessage);
  };
  const onMessage = (message: { type?: string; pageUrl?: string }) => {
    if (
      message.type === "REMOVE_INLINE_OVERLAY" &&
      (message.pageUrl === undefined || message.pageUrl === url)
    )
      dispose();
  };
  const stopNavigation = onUrlChange(dispose);
  browser.runtime.onMessage.addListener(onMessage);
  try {
    // An injection queued before opt-out must not recreate the badge afterwards.
    if (
      !(await browser.runtime.sendMessage({ type: "INLINE_OVERLAY_ALLOWED" }))
    ) {
      dispose();
      return;
    }
    const priceElement = await waitForPriceElement(3000);
    await runInlineComparison({
      capture: (phase, comparisonId) => capture(chain, phase, comparisonId),
      persist: (observation) =>
        browser.runtime.sendMessage({
          type: "PRICE_OBSERVATION",
          data: observation,
        }),
      isCurrent: () => active && window.location.href === url,
      mount: (preUi) => {
        const container = document.createElement("div");
        container.setAttribute(
          `data-${crypto.randomUUID()}`,
          preUi.comparisonId!,
        );
        const shadow = container.attachShadow({ mode: "closed" });
        const style = document.createElement("style");
        style.textContent = [sparklineCss, panelCss, badgeCss].join("\n");
        const mountPoint = document.createElement("div");
        shadow.append(style, mountPoint);
        if (priceElement?.isConnected) {
          container.style.position = "relative";
          priceElement.insertAdjacentElement("afterend", container);
        } else {
          container.style.position = "fixed";
          container.style.bottom = "20px";
          container.style.right = "20px";
          container.style.zIndex = "999999";
          document.body.appendChild(container);
        }
        const root = createRoot(mountPoint);
        removeUi = () => {
          root.unmount();
          container.remove();
        };
        root.render(
          createElement(OverlayRoot, {
            productId: preUi.productId,
            fixed: !priceElement?.isConnected,
          }),
        );
      },
    });
  } catch (error) {
    dispose();
    throw error;
  }
}

function getChain(): StoreChain | null {
  if (window.location.hostname === "www.woolworths.com.au") return "woolworths";
  if (window.location.hostname === "www.coles.com.au") return "coles";
  return null;
}

function capture(
  chain: StoreChain,
  capturePhase: "pre_ui" | "post_ui",
  comparisonId: string,
): PriceObservation | null {
  const observation =
    chain === "woolworths"
      ? scrapeWoolworths(document, window.location.href)
      : scrapeColes(document, window.location.href);
  if (!observation) return null;
  return {
    ...enrichObservationWithPageContext(observation, document),
    clientObservationId: crypto.randomUUID(),
    instrumentMode: "user_activated_inline",
    capturePhase,
    comparisonId,
  };
}
