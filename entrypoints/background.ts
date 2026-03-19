import { db } from "@/lib/db";
import { saveObservation, initDefaults } from "@/lib/store";
import { deleteOlderThan } from "@/lib/retention";
import { getProductHistory, getProductStats } from "@/lib/data";

const RETENTION_ALARM = "chook-check-retention";
const RETENTION_DAYS = 365;
const RETENTION_INTERVAL_MINUTES = 1440; // 24 hours

export default defineBackground(() => {
  console.log("[Chook Check] Background service worker started");

  initDefaults(db).catch((err) =>
    console.error("[Chook Check] Failed to initialize defaults:", err),
  );

  browser.alarms.create(RETENTION_ALARM, {
    periodInMinutes: RETENTION_INTERVAL_MINUTES,
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RETENTION_ALARM) {
      const deleted = await deleteOlderThan(db, RETENTION_DAYS);
      if (deleted > 0) {
        console.log(
          `[Chook Check] Retention cleanup: deleted ${deleted} old observations`,
        );
      }
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "PRICE_OBSERVATION" && message.data) {
      const { productName, priceCents, storeChain } = message.data;
      console.log(
        `[Chook Check] ${storeChain}: ${productName} — $${(priceCents / 100).toFixed(2)}`,
      );
      saveObservation(db, message.data).catch((err) =>
        console.error("[Chook Check] Unhandled saveObservation error:", err),
      );
    }

    if (message.type === "GET_PRODUCT_DATA" && message.productId) {
      return (async () => {
        const history = await getProductHistory(db, message.productId);
        const stats = await getProductStats(db, message.productId);
        return { history, stats };
      })();
    }
  });
});
