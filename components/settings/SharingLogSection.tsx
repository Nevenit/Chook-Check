import styles from "./SharingLogSection.module.css";

export function SharingLogSection() {
  return (
    <div className={styles.emptyState}>
      No data has been shared yet. Enable contribution above to start helping
      the community.
    </div>
  );
}
