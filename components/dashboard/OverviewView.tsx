import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getStorageStats } from "@/lib/data";
import {
  getBiggestPriceChanges,
  type PriceChange,
} from "@/lib/data-dashboard";
import { formatPrice } from "@/components/shared/formatPrice";
import { formatRelativeTime } from "@/components/shared/formatTime";
import styles from "./OverviewView.module.css";

interface OverviewViewProps {
  onSelectProduct: (productId: string) => void;
}

export function OverviewView({ onSelectProduct }: OverviewViewProps) {
  const [stats, setStats] = useState<{
    distinctProducts: number;
    totalObservations: number;
    byChain: Record<string, number>;
    newestDate: string | null;
  } | null>(null);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStorageStats(db), getBiggestPriceChanges(db, 5)])
      .then(([s, c]) => {
        setStats(s);
        setChanges(c);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className={styles.loading}>Loading...</p>;

  return (
    <div>
      <section className={styles.section}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats?.distinctProducts ?? 0}</div>
            <div className={styles.statLabel}>Products tracked</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats?.totalObservations ?? 0}</div>
            <div className={styles.statLabel}>Price observations</div>
          </div>
          {Object.entries(stats?.byChain ?? {}).map(([chain, count]) => (
            <div key={chain} className={styles.statCard}>
              <div className={styles.statValue}>{count}</div>
              <div className={styles.statLabel}>
                {chain.charAt(0).toUpperCase() + chain.slice(1)}
              </div>
            </div>
          ))}
        </div>
        {stats?.newestDate && (
          <p className={styles.changeMeta}>
            Last updated {formatRelativeTime(stats.newestDate)}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Biggest price changes</h2>
        {changes.length === 0 ? (
          <p className={styles.emptyState}>
            No price changes detected yet. Keep browsing to build history.
          </p>
        ) : (
          changes.map((c) => {
            const isIncrease = c.newPriceCents > c.oldPriceCents;
            return (
              <div
                key={c.productId}
                className={styles.changeCard}
                onClick={() => onSelectProduct(c.productId)}
              >
                <div className={styles.changeHeader}>
                  <span className={styles.changeName}>{c.productName}</span>
                  <span
                    className={`${styles.changeAmount} ${isIncrease ? styles.changeUp : styles.changeDown}`}
                  >
                    {isIncrease ? "+" : "-"}
                    {formatPrice(c.changeCents)} ({c.changePercent}%)
                  </span>
                </div>
                <div className={styles.changeMeta}>
                  {formatPrice(c.oldPriceCents)} → {formatPrice(c.newPriceCents)}
                  {" · "}
                  {c.storeChain.charAt(0).toUpperCase() + c.storeChain.slice(1)}
                  {" · "}
                  {formatRelativeTime(c.observedAt)}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Personalisation alerts</h2>
        <p className={styles.emptyState}>
          Community comparison coming soon — contribute your data to help detect personalised pricing.
        </p>
      </section>
    </div>
  );
}
