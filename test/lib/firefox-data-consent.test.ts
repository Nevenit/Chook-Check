import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasFirefoxDataConsent,
  requestFirefoxDataConsent,
} from "@/lib/firefox-data-consent";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function useFirefox() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla Firefox/140",
  );
}

describe("Firefox built-in data consent", () => {
  it("requires every declared permission for fairness mode", async () => {
    useFirefox();
    vi.stubGlobal("browser", {
      permissions: {
        getAll: vi.fn().mockResolvedValue({
          data_collection: ["websiteContent", "browsingActivity"],
        }),
      },
    });
    expect(await hasFirefoxDataConsent("fairnessStudyEnabled")).toBe(false);
  });

  it("requests optional data permission from the user action path", async () => {
    useFirefox();
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("browser", {
      permissions: {
        getAll: vi.fn().mockResolvedValue({ data_collection: [] }),
        request,
      },
    });
    expect(await requestFirefoxDataConsent("historyContributionEnabled")).toBe(
      true,
    );
    expect(request).toHaveBeenCalledWith({
      data_collection: ["websiteContent", "browsingActivity"],
    });
  });

  it("does not invoke Firefox-only permission APIs in Chromium", async () => {
    const request = vi.fn();
    vi.stubGlobal("browser", { permissions: { request } });
    expect(await requestFirefoxDataConsent("fairnessStudyEnabled")).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});
