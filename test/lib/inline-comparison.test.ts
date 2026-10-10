import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChookCheckDB } from "../../lib/db";
import { saveObservation } from "../../lib/store";
import {
  runInlineComparison,
  POST_UI_DELAY_MS,
} from "../../lib/inline-comparison";
import { makeObservation } from "../helpers";

let db: ChookCheckDB;
beforeEach(() => {
  db = new ChookCheckDB("TestDB_inline");
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

describe("inline measurement", () => {
  it.each([350, 400])(
    "stores a complete pair with post price %i after persisting the baseline",
    async (postPrice) => {
      let mounted = false;
      const capture = (phase: "pre_ui" | "post_ui", comparisonId: string) =>
        makeObservation({
          instrumentMode: "user_activated_inline",
          capturePhase: phase,
          comparisonId,
          priceCents: phase === "pre_ui" ? 350 : postPrice,
        });
      const baseline = makeObservation();
      await saveObservation(db, baseline);
      let mountedResolve!: () => void;
      const mountReady = new Promise<void>((resolve) => {
        mountedResolve = resolve;
      });
      const run = runInlineComparison({
        capture,
        isCurrent: () => true,
        persist: async (row) => {
          if (row.capturePhase === "pre_ui") expect(mounted).toBe(false);
          return saveObservation(db, row);
        },
        mount: () => {
          mounted = true;
          mountedResolve();
        },
      });
      await mountReady;
      expect(await db.priceObservations.count()).toBe(2);
      await vi.advanceTimersByTimeAsync(POST_UI_DELAY_MS);
      await run;
      const rows = await db.priceObservations.toArray();
      expect(rows).toHaveLength(3);
      expect(rows[1].comparisonId).toBe(rows[2].comparisonId);
      expect(rows[2]).toMatchObject({
        capturePhase: "post_ui",
        priceCents: postPrice,
      });
    },
  );

  it("does not mount UI when saving the pre-UI price fails", async () => {
    const mount = vi.fn();
    await expect(
      runInlineComparison({
        capture: () => makeObservation(),
        persist: async () => false,
        mount,
        isCurrent: () => true,
      }),
    ).rejects.toThrow("could not be saved");
    expect(mount).not.toHaveBeenCalled();
  });

  it.each(["navigation", "missing", "different product"])(
    "does not fabricate a pair after %s",
    async (reason) => {
      const persist = vi.fn(async () => true);
      let mounted = false;
      const run = runInlineComparison({
        capture: (phase) =>
          phase === "pre_ui"
            ? makeObservation()
            : reason === "missing"
              ? null
              : makeObservation({ productId: "another-product" }),
        persist,
        mount: () => {
          mounted = true;
        },
        isCurrent: () => !(mounted && reason === "navigation"),
      });
      await vi.advanceTimersByTimeAsync(POST_UI_DELAY_MS);
      await run;
      expect(persist).toHaveBeenCalledTimes(1);
    },
  );
});
