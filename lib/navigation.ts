const URL_CHANGE_EVENT = "chook-check:url-change";
let patched = false;
let listenerCount = 0;
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownUrl = "";

function dispatchUrlChange(): void {
  lastKnownUrl = window.location.href;
  window.dispatchEvent(new CustomEvent(URL_CHANGE_EVENT));
}

function ensurePatched(): void {
  if (patched) return;
  patched = true;

  originalPushState = history.pushState.bind(history);
  originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    originalPushState!(...args);
    dispatchUrlChange();
  };

  history.replaceState = (
    ...args: Parameters<typeof history.replaceState>
  ) => {
    originalReplaceState!(...args);
    dispatchUrlChange();
  };

  window.addEventListener("popstate", dispatchUrlChange);

  // Fallback: poll for URL changes not caught by pushState/replaceState patching.
  // SPA routers (Next.js, Angular) may cache the original pushState before our
  // content script loads, bypassing our patch entirely.
  lastKnownUrl = window.location.href;
  pollTimer = setInterval(() => {
    if (window.location.href !== lastKnownUrl) {
      dispatchUrlChange();
    }
  }, 500);
}

function restorePatches(): void {
  if (!patched) return;
  if (originalPushState) history.pushState = originalPushState;
  if (originalReplaceState) history.replaceState = originalReplaceState;
  window.removeEventListener("popstate", dispatchUrlChange);
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  patched = false;
  originalPushState = null;
  originalReplaceState = null;
}

/**
 * Listens for client-side URL changes (SPA navigation).
 * Patches pushState/replaceState once, dispatches a custom event.
 * Multiple callers each get their own debounced listener.
 * Returns a cleanup function; when all listeners are removed, restores originals.
 */
export function onUrlChange(callback: (url: string) => void): () => void {
  ensurePatched();
  listenerCount++;

  let debounceTimer: ReturnType<typeof setTimeout>;

  const handler = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(window.location.href);
    }, 500);
  };

  window.addEventListener(URL_CHANGE_EVENT, handler);

  return () => {
    clearTimeout(debounceTimer);
    window.removeEventListener(URL_CHANGE_EVENT, handler);
    listenerCount--;
    if (listenerCount === 0) {
      restorePatches();
    }
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
