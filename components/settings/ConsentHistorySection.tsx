import type { ConsentEvent } from "@/lib/types";
import styles from "./ConsentHistorySection.module.css";

interface ConsentHistorySectionProps {
  consentLog: ConsentEvent[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConsentHistorySection({
  consentLog,
}: ConsentHistorySectionProps) {
  if (consentLog.length === 0) {
    return <p className={styles.emptyState}>No consent events recorded.</p>;
  }

  const reversed = [...consentLog].reverse();

  return (
    <div className={styles.list}>
      {reversed.map((event, i) => (
        <div key={i} className={styles.item}>
          <span className={styles.detail}>{event.detail}</span>
          <span className={styles.timestamp}>
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}
