import { describe, it, expect, vi, afterEach } from "vitest";
import { onUrlChange } from "../../lib/navigation";

describe("onUrlChange", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("calls callback when pushState is called", async () => {
    const callback = vi.fn();
    cleanup = onUrlChange(callback);

    history.pushState({}, "", "/new-page");

    // Debounce is 500ms
    await new Promise((r) => setTimeout(r, 600));
    expect(callback).toHaveBeenCalledWith(
      expect.stringContaining("/new-page"),
    );
  });

  it("calls callback when replaceState is called", async () => {
    const callback = vi.fn();
    cleanup = onUrlChange(callback);

    history.replaceState({}, "", "/replaced");

    await new Promise((r) => setTimeout(r, 600));
    expect(callback).toHaveBeenCalledWith(
      expect.stringContaining("/replaced"),
    );
  });

  it("debounces rapid URL changes", async () => {
    const callback = vi.fn();
    cleanup = onUrlChange(callback);

    history.pushState({}, "", "/first");
    history.pushState({}, "", "/second");
    history.pushState({}, "", "/third");

    await new Promise((r) => setTimeout(r, 600));
    // Should only fire once for the final URL
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.stringContaining("/third"),
    );
  });
});
