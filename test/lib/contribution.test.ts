import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import {
  initDefaults,
  saveObservation,
  saveCapturedObservation,
} from "../../lib/store";
import { CONSENT_VERSION } from "../../lib/settings";
import { submitPendingObservations } from "../../lib/contribution";
import { submitObservations } from "../../lib/api";
import { makeObservation } from "../helpers";

vi.mock("../../lib/api", () => ({ submitObservations: vi.fn() }));
let db: ChookCheckDB;
beforeEach(async () => {
  db = new ChookCheckDB("TestDB_contribution");
  await initDefaults(db);
  await db.userSettings.update("default", {
    consentVersion: CONSENT_VERSION,
    contributorId: "contributor",
    submitToken: "submit",
    historyContributionEnabled: true,
  });
  vi.mocked(submitObservations)
    .mockReset()
    .mockImplementation(async (request) => ({
      accepted: request.observations.length,
      duplicates: 0,
      rejected: 0,
    }));
});
afterEach(async () => {
  await db.delete();
});
const observation = (overrides: Parameters<typeof makeObservation>[0] = {}) =>
  makeObservation({
    observedAt: new Date(Date.now() - 1000).toISOString(),
    userContextAtCapture: { state: "QLD", city: "", store: "" },
    ...overrides,
  });

describe("contribution pipeline", () => {
  it("uses captured region/store values even when settings change before upload", async () => {
    await db.userSettings.update("default", {
      fairnessStudyEnabled: true,
      shareState: true,
      userState: "NSW",
      shareStore: true,
      userStoreName: "Original store",
    });
    await saveCapturedObservation(db, observation());
    await db.userSettings.update("default", {
      userState: "QLD",
      userStoreName: "New store",
    });
    await submitPendingObservations(db);
    expect(vi.mocked(submitObservations).mock.calls[0][0]).toMatchObject({
      mode: "fairness",
      observations: [{ coarseRegion: "NSW", storeId: "Original store" }],
    });
  });

  it("does not assign current user context to older observations", async () => {
    await db.userSettings.update("default", {
      fairnessStudyEnabled: true,
      shareState: true,
      userState: "QLD",
    });
    await saveObservation(db, observation({ userContextAtCapture: undefined }));
    await submitPendingObservations(db);
    expect(vi.mocked(submitObservations).mock.calls[0][0]).toMatchObject({
      mode: "history",
      observations: [{ coarseRegion: null, storeId: null }],
    });
  });

  it("still honors revoked sharing choices for captured context", async () => {
    await db.userSettings.update("default", {
      fairnessStudyEnabled: true,
      shareState: false,
      shareStore: true,
    });
    await saveObservation(
      db,
      observation({
        storeId: "page-store",
        userContextAtCapture: { state: "NSW", city: "Sydney", store: "" },
      }),
    );
    await submitPendingObservations(db);
    expect(vi.mocked(submitObservations).mock.calls[0][0]).toMatchObject({
      mode: "fairness",
      observations: [{ coarseRegion: null, storeId: "page-store" }],
    });
  });

  it("does not snapshot user-entered context before fairness consent", async () => {
    await db.userSettings.update("default", {
      userState: "NSW",
      shareState: true,
    });
    await saveCapturedObservation(db, observation());
    expect(
      (await db.priceObservations.toArray())[0].userContextAtCapture,
    ).toBeNull();
  });

  it("uploads independent hourly samples without URLs or fairness context in history mode", async () => {
    await saveObservation(
      db,
      observation({ storeId: "secret-store", authState: "signed_in" }),
    );
    await saveObservation(
      db,
      observation({ observedAt: new Date(Date.now() - 3600000).toISOString() }),
    );
    await submitPendingObservations(db);
    const request = vi.mocked(submitObservations).mock.calls[0][0];
    expect(request.mode).toBe("history");
    expect(request.observations).toHaveLength(2);
    expect(request.observations[0]).not.toHaveProperty("pageUrl");
    expect(request.observations[0]).toMatchObject({
      storeId: null,
      authState: "unknown",
    });
    expect(
      await db.priceObservations.filter((row) => row.contributed).count(),
    ).toBe(2);
  });

  it("keeps inline observations local in history mode and preserves their phases in fairness mode", async () => {
    const comparisonId = crypto.randomUUID();
    for (const capturePhase of ["pre_ui", "post_ui"] as const)
      await saveObservation(
        db,
        observation({
          instrumentMode: "user_activated_inline",
          comparisonId,
          capturePhase,
        }),
      );
    await submitPendingObservations(db);
    expect(submitObservations).not.toHaveBeenCalled();
    await db.userSettings.update("default", {
      fairnessStudyEnabled: true,
      shareState: true,
      userState: "QLD",
    });
    await submitPendingObservations(db);
    expect(vi.mocked(submitObservations).mock.calls[0][0]).toMatchObject({
      mode: "fairness",
      observations: [
        { capturePhase: "pre_ui", comparisonId },
        { capturePhase: "post_ui", comparisonId },
      ],
    });
  });

  it.each(["legacy", "2.0.0", "2.1.0"])(
    "does not upgrade %s captures into fairness evidence",
    async (scraperVersion) => {
      await db.userSettings.update("default", {
        fairnessStudyEnabled: true,
        shareState: true,
        userState: "QLD",
      });
      await saveObservation(db, observation({ scraperVersion }));
      await submitPendingObservations(db);
      expect(vi.mocked(submitObservations).mock.calls[0][0].mode).toBe(
        "history",
      );
    },
  );

  it("stops subsequent requests after opt-out during an in-flight batch", async () => {
    await db.priceObservations.bulkAdd(
      Array.from({ length: 51 }, (_, index) =>
        observation({ productId: `product-${index}` }),
      ),
    );
    vi.mocked(submitObservations).mockImplementationOnce(async (request) => {
      await db.userSettings.update("default", {
        historyContributionEnabled: false,
      });
      return {
        accepted: request.observations.length,
        duplicates: 0,
        rejected: 0,
      };
    });
    await Promise.all([
      submitPendingObservations(db),
      submitPendingObservations(db),
    ]);
    expect(submitObservations).toHaveBeenCalledTimes(1);
    expect(
      await db.priceObservations.filter((row) => !row.contributed).count(),
    ).toBe(1);
  });

  it("retries the same IDs after a failed or incomplete response", async () => {
    await saveObservation(db, observation());
    vi.mocked(submitObservations).mockResolvedValueOnce({
      accepted: 0,
      duplicates: 0,
      rejected: 0,
    });
    await submitPendingObservations(db);
    expect(
      await db.priceObservations.filter((row) => !row.contributed).count(),
    ).toBe(1);
    await submitPendingObservations(db);
    const calls = vi.mocked(submitObservations).mock.calls;
    expect(calls[1][0].observations[0].clientObservationId).toBe(
      calls[0][0].observations[0].clientObservationId,
    );
  });

  it.each(["reconsent", "deletion"])(
    "does not send while blocked by %s",
    async (reason) => {
      await saveObservation(db, observation());
      await db.userSettings.update(
        "default",
        reason === "reconsent"
          ? { reconsentRequired: true }
          : {
              pendingServerDeletion: {
                contributorId: "contributor",
                deletionToken: "delete",
                requestedAt: "",
                lastAttemptAt: "",
                lastError: "offline",
              },
            },
      );
      await submitPendingObservations(db);
      expect(submitObservations).not.toHaveBeenCalled();
    },
  );
});
