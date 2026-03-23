import { db } from "@/lib/db";
import { deleteAllLocalData } from "@/lib/settings";
import styles from "./DataManagementSection.module.css";

interface DataManagementSectionProps {
  onDataDeleted: () => void;
}

export function DataManagementSection({
  onDataDeleted,
}: DataManagementSectionProps) {
  async function handleDelete() {
    const confirmed = window.confirm(
      "This will permanently delete all your tracked price data. Your consent history will be preserved. Continue?",
    );
    if (!confirmed) return;

    await deleteAllLocalData(db);
    onDataDeleted();
  }

  return (
    <div>
      <div className={styles.buttons}>
        <button className={styles.deleteButton} onClick={handleDelete}>
          Delete all local data
        </button>
        <button className={styles.serverButton} disabled>
          Request server deletion
        </button>
      </div>
      <p className={styles.hint}>
        Server deletion will be available after you've contributed data.
      </p>
    </div>
  );
}
