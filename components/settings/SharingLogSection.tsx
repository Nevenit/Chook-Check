import type { SharingEvent } from "@/lib/types";
import styles from "./SharingLogSection.module.css";

interface SharingLogSectionProps {
  events: SharingEvent[];
}

export function SharingLogSection({ events }: SharingLogSectionProps) {
  if (events.length === 0) {
    return (
      <div className={styles.emptyState}>
        No data has been shared yet. Enable contribution above to start helping
        the community.
      </div>
    );
  }

  // Show newest first
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className={styles.logList}>
      {sorted.map((event) => (
        <div key={event.id} className={styles.logEntry}>
          <span className={styles.logTime}>
            {new Date(event.timestamp).toLocaleString()}
          </span>
          <span className={event.status === "success" ? styles.logSuccess : styles.logError}>
            {event.status === "success"
              ? `${event.observationCount} observations shared`
              : `Error: ${event.errorMessage ?? "Unknown error"}`}
          </span>
        </div>
      ))}
    </div>
  );
}
