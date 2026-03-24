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

  useEffect(() => {
    Promise.all([
      getStorageStats(db),
      getRecentObservations(db, 10),
      getSettings(db),
    ])
      .then(([storageStats, recent, userSettings]) => {
        setStats({
          distinctProducts: storageStats.distinctProducts,
          totalObservations: storageStats.totalObservations,
          byChain: storageStats.byChain,
        });
        setObservations(recent);
        setSettings(userSettings);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function handleDismissOnboarding() {
    await saveSettings(db, { onboardingDismissed: true });
    setSettings((prev) => prev ? { ...prev, onboardingDismissed: true } : prev);
  }

  if (loading) return null;

  return (
    <div style={{ padding: 16 }}>
      <PopupHeader />
      {settings && (
        <OnboardingBanner
          distinctProducts={stats.distinctProducts}
          contributionEnabled={settings.contributionEnabled}
          onboardingDismissed={settings.onboardingDismissed}
          onDismiss={handleDismissOnboarding}
        />
      )}
      <StatsBar
        distinctProducts={error ? -1 : stats.distinctProducts}
        totalObservations={error ? -1 : stats.totalObservations}
        byChain={error ? {} : stats.byChain}
      />
      {error ? (
        <p style={{ color: "#888", fontSize: 13 }}>Unable to load data.</p>
      ) : (
        <ObservationList observations={observations} />
      )}
      <PopupFooter />
    </div>
  );
}
