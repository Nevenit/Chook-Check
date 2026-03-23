import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getProductIdFromUrl, getProductIdFromDom } from "@/lib/product-id";
import { onUrlChange } from "@/lib/navigation";
import { findPriceElement } from "@/lib/overlay-selectors";
import { OverlayRoot } from "@/components/overlay/OverlayRoot";

// Import CSS as inline strings for Shadow DOM injection
import sparklineCss from "@/components/overlay/sparkline.css?inline";
import panelCss from "@/components/overlay/overlay-panel.css?inline";
import badgeCss from "@/components/overlay/overlay-badge.css?inline";

export default defineContentScript({
  matches: [
    "https://www.woolworths.com.au/*",
    "https://www.coles.com.au/*",
  ],
  runAt: "document_idle",

  main() {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;
    let currentProductId: string | null = null;
    let observer: MutationObserver | null = null;

    function cleanup() {
      if (root) {
        root.unmount();
        root = null;
      }
      if (container) {
        container.remove();
        container = null;
      }
      currentProductId = null;
    }

    function inject() {
      const productId =
        getProductIdFromUrl(window.location.href) ?? getProductIdFromDom();
      if (!productId) return;
      if (productId === currentProductId) return;

      cleanup();
      currentProductId = productId;

      container = document.createElement("div");
      container.id = "chook-check-overlay";
      const shadow = container.attachShadow({ mode: "open" });

      // Inject styles
      const style = document.createElement("style");
      style.textContent = [sparklineCss, panelCss, badgeCss].join("\n");
      shadow.appendChild(style);

      // React mount point
      const mountPoint = document.createElement("div");
      shadow.appendChild(mountPoint);

      // Position near price element or fall back to fixed
      const priceEl = findPriceElement();
      if (priceEl) {
        priceEl.insertAdjacentElement("afterend", container);
      } else {
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.right = "20px";
        container.style.zIndex = "999999";
        document.body.appendChild(container);
      }

      root = createRoot(mountPoint);
      root.render(createElement(OverlayRoot, { productId }));
    }

    // Watch for JSON-LD scripts added dynamically (SPA product views)
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node instanceof HTMLScriptElement &&
            node.type === "application/ld+json"
          ) {
            inject();
            return;
          }
          // Also check children (e.g. a container div with a script inside)
          if (node instanceof HTMLElement) {
            const ldScript = node.querySelector?.(
              'script[type="application/ld+json"]',
            );
            if (ldScript) {
              inject();
              return;
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Inject on initial load (if on a product page)
    inject();

    // Re-inject on SPA navigation
    onUrlChange(() => {
      cleanup();
      inject();
    });
  },
});
