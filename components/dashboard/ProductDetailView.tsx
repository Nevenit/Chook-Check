import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { getProductHistory, getProductStats } from "@/lib/data";
import { formatPrice } from "@/components/shared/formatPrice";
import { PriceChart } from "./PriceChart";
import type { PriceObservation } from "@/lib/types";
import styles from "./ProductDetailView.module.css";

interface ProductDetailViewProps {
  productId: string;
  onBack: () => void;
}

export function ProductDetailView({ productId, onBack }: ProductDetailViewProps) {
  const [history, setHistory] = useState<PriceObservation[]>([]);
  const [stats, setStats] = useState<{
    min: number;
    max: number;
    avg: number;
    count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProductHistory(db, productId), getProductStats(db, productId)])
      .then(([h, s]) => {
        setHistory(h);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  const latest = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div>
      <button className={styles.backButton} onClick={onBack}>
        ← Back to products
      </button>

      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : !latest ? (
        <p className={styles.emptyState}>No data found for this product.</p>
      ) : (
        <>
          <h2 className={styles.productName}>{latest.productName}</h2>
          <p className={styles.productChain}>{latest.storeChain}</p>

          <PriceChart observations={history} />

          {stats && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{formatPrice(stats.min)}</div>
                <div className={styles.statLabel}>Lowest</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{formatPrice(stats.avg)}</div>
                <div className={styles.statLabel}>Average</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{formatPrice(stats.max)}</div>
                <div className={styles.statLabel}>Highest</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.count}</div>
                <div className={styles.statLabel}>Observations</div>
              </div>
            </div>
          )}

          <h3 className={styles.sectionTitle}>Community comparison</h3>
          <p className={styles.emptyState}>
            Community price comparison coming soon.
          </p>

          <h3 className={styles.sectionTitle}>Observation history</h3>
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Price</th>
                <th>Was Price</th>
                <th>Unit Price</th>
                <th>Promo</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((obs, i) => (
                <tr key={obs.id ?? i}>
                  <td>
                    {new Date(obs.observedAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{formatPrice(obs.priceCents)}</td>
                  <td>{obs.wasPriceCents ? formatPrice(obs.wasPriceCents) : "—"}</td>
                  <td>
                    {obs.unitPriceCents
                      ? `${formatPrice(obs.unitPriceCents)}${obs.unitMeasure ? ` / ${obs.unitMeasure}` : ""}`
                      : "—"}
                  </td>
                  <td>{obs.promoType ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
