import { formatRelativeTime } from "@/components/shared/formatTime";
import styles from "./DataSummarySection.module.css";

interface DataSummarySectionProps {
  stats: {
    totalObservations: number;
    distinctProducts: number;
    newestDate: string | null;
  };
}

function getExtensionUrl(path: string): string {
  try {
    return browser.runtime.getURL(path);
  } catch {
    return `#${path}`;
  }
}

export function DataSummarySection({ stats }: DataSummarySectionProps) {
  return (
    <div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.distinctProducts}</div>
          <div className={styles.statLabel}>Products tracked</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.totalObservations}</div>
          <div className={styles.statLabel}>Price observations</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {stats.newestDate ? formatRelativeTime(stats.newestDate) : "—"}
          </div>
          <div className={styles.statLabel}>Last observation</div>
        </div>
      </div>
      <div className={styles.links}>
        <a href={getExtensionUrl("/dashboard.html")} className={styles.link}>
          View in Dashboard →
        </a>
        <a href={getExtensionUrl("/dashboard.html")} className={styles.link}>
          Export data →
        </a>
      </div>
    </div>
  );
}
