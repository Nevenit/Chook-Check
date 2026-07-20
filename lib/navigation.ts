/**
 * Observes SPA navigation from the extension's isolated world without patching
 * retailer APIs or dispatching page-visible custom events.
 */
export function onUrlChange(callback: (url: string) => void): () => void {
  let lastKnownUrl = window.location.href;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const pollTimer = setInterval(() => {
    const nextUrl = window.location.href;
    if (nextUrl === lastKnownUrl) return;
    lastKnownUrl = nextUrl;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => callback(nextUrl), 250);
  }, 250);

  return () => {
    clearInterval(pollTimer);
    clearTimeout(debounceTimer);
  };
}

/**
 * Waits for an element matching the selector to appear in the DOM.
 * Polls every 200ms up to the timeout (default 5000ms).
 */
export function waitForElement(
  selector: string,
  timeout = 5000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) {
      resolve(el);
      return;
    }

    const interval = 200;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const found = document.querySelector(selector);
      if (found || elapsed >= timeout) {
        clearInterval(timer);
        resolve(found);
      }
    }, interval);
  });
}
