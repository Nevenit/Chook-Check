import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getStorageStats, getRecentObservations } from "@/lib/data";
import { PopupHeader } from "@/components/popup/PopupHeader";
import { StatsBar } from "@/components/popup/StatsBar";
import { ObservationList } from "@/components/popup/ObservationList";
import { PopupFooter } from "@/components/popup/PopupFooter";
import { OnboardingBanner } from "@/components/popup/OnboardingBanner";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "@/lib/store";
import type { PriceObservation, UserSettings } from "@/lib/types";
import type { CommunitySnapshot } from "@/lib/types";
import { formatPrice } from "@/components/shared/formatPrice";

interface ActiveProductData {
  productId: string;
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
  community: CommunitySnapshot | null;
}

export default function App() {
  const [stats, setStats] = useState<{
    distinctProducts: number;
    totalObservations: number;
    byChain: Record<string, number>;
  }>({ distinctProducts: 0, totalObservations: 0, byChain: {} });
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [activeProduct, setActiveProduct] = useState<ActiveProductData | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getStorageStats(db),
      getRecentObservations(db, 10),
      getSettings(db),
      browser.runtime.sendMessage({ type: "GET_ACTIVE_PRODUCT_DATA" }),
    ])
      .then(([storageStats, recent, userSettings, active]) => {
        setStats({
          distinctProducts: storageStats.distinctProducts,
          totalObservations: storageStats.totalObservations,
          byChain: storageStats.byChain,
        });
        setObservations(recent);
        setSettings(userSettings);
        setActiveProduct(active as ActiveProductData | null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function handleDismissOnboarding() {
    await saveSettings(db, { onboardingDismissed: true });
    setSettings((prev) =>
      prev ? { ...prev, onboardingDismissed: true } : prev,
    );
  }

  async function refreshActiveProduct() {
    setActiveProduct(
      (await browser.runtime.sendMessage({
        type: "GET_ACTIVE_PRODUCT_DATA",
      })) as ActiveProductData | null,
    );
  }

  async function handleSnapshotRefresh() {
    try {
      const count = await browser.runtime.sendMessage({
        type: "SYNC_COMMUNITY_SNAPSHOT",
      });
      await refreshActiveProduct();
      setActionMessage(
        `Community snapshot refreshed (${count} products updated).`,
      );
    } catch {
      setActionMessage(
        "Community downloads are disabled or the refresh failed.",
      );
    }
  }

  if (loading) return null;

  return (
    <div style={{ padding: 16 }}>
      <PopupHeader />
      {settings && (
        <OnboardingBanner
          distinctProducts={stats.distinctProducts}
          contributionEnabled={
            settings.historyContributionEnabled || settings.fairnessStudyEnabled
          }
          onboardingDismissed={settings.onboardingDismissed}
          onDismiss={handleDismissOnboarding}
        />
      )}
      <StatsBar
        distinctProducts={error ? -1 : stats.distinctProducts}
        totalObservations={error ? -1 : stats.totalObservations}
        byChain={error ? {} : stats.byChain}
      />
      {activeProduct && (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            margin: "12px 0",
            padding: 12,
          }}
        >
          <strong>
            {activeProduct.history.at(-1)?.productName ??
              activeProduct.productId}
          </strong>
          <p style={{ margin: "6px 0", fontSize: 13 }}>
            Current local price:{" "}
            {activeProduct.history.at(-1)
              ? formatPrice(activeProduct.history.at(-1)!.priceCents)
              : "not captured yet"}
            <br />
            Local observations: {activeProduct.history.length}
            <br />
            Community median:{" "}
            {activeProduct.community?.currentMedianCents
              ? formatPrice(activeProduct.community.currentMedianCents)
              : "not available at the privacy threshold"}
          </p>
          {settings?.communityDownloadsEnabled && (
            <button onClick={handleSnapshotRefresh}>
              Refresh community snapshot
            </button>
          )}
          {actionMessage && <p style={{ fontSize: 12 }}>{actionMessage}</p>}
        </section>
      )}
      {error ? (
        <p style={{ color: "#888", fontSize: 13 }}>Unable to load data.</p>
      ) : (
        <ObservationList observations={observations} />
      )}
      <PopupFooter
        contributing={Boolean(
          settings?.historyContributionEnabled ||
          settings?.fairnessStudyEnabled,
        )}
      />
    </div>
  );
}
