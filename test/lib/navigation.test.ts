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

  it("supports multiple listeners without overwriting", async () => {
    const calls1: string[] = [];
    const calls2: string[] = [];

    const cleanup1 = onUrlChange((url) => calls1.push(url));
    const cleanup2 = onUrlChange((url) => calls2.push(url));

    history.pushState({}, "", "/multi-test");

    await vi.waitFor(() => {
      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
    }, { timeout: 2000 });

    expect(calls1[0]).toContain("/multi-test");
    expect(calls2[0]).toContain("/multi-test");

    cleanup1();
    cleanup2();
  });
});
