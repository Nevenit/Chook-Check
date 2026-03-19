import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getStorageStats, getRecentObservations } from "@/lib/data";
import { PopupHeader } from "@/components/popup/PopupHeader";
import { StatsBar } from "@/components/popup/StatsBar";
import { ObservationList } from "@/components/popup/ObservationList";
import { PopupFooter } from "@/components/popup/PopupFooter";
import type { PriceObservation } from "@/lib/types";

export default function App() {
  const [stats, setStats] = useState<{
    distinctProducts: number;
    totalObservations: number;
    byChain: Record<string, number>;
  }>({ distinctProducts: 0, totalObservations: 0, byChain: {} });
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([getStorageStats(db), getRecentObservations(db, 10)])
      .then(([storageStats, recent]) => {
        setStats({
          distinctProducts: storageStats.distinctProducts,
          totalObservations: storageStats.totalObservations,
          byChain: storageStats.byChain,
        });
        setObservations(recent);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div style={{ padding: 16 }}>
      <PopupHeader />
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
