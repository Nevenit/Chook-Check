/**
 * Listens for client-side URL changes (SPA navigation).
 * Monkey-patches pushState/replaceState and listens for popstate.
 * Debounces rapid changes (500ms).
 * Returns a cleanup function that restores the original methods.
 */
export function onUrlChange(callback: (url: string) => void): () => void {
  let debounceTimer: ReturnType<typeof setTimeout>;

  const notify = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(window.location.href);
    }, 500);
  };

  // Monkey-patch pushState
  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    originalPushState(...args);
    notify();
  };

  // Monkey-patch replaceState
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (
    ...args: Parameters<typeof history.replaceState>
  ) => {
    originalReplaceState(...args);
    notify();
  };

  // Listen for browser back/forward
  window.addEventListener("popstate", notify);

  // Return cleanup function
  return () => {
    clearTimeout(debounceTimer);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", notify);
  };
}

/**
 * Waits for an element matching the selector to appear in the DOM.
 * Polls every 200ms up to the timeout (default 5000ms).
 * Returns null if the element doesn't appear in time.
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
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (elapsed >= timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}
