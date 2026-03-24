import { useState } from "react";
import { db } from "@/lib/db";
import { deleteAllLocalData } from "@/lib/settings";
import styles from "./DataManagementSection.module.css";

interface DataManagementSectionProps {
  onDataDeleted: () => void;
  contributorId: string;
}

export function DataManagementSection({
  onDataDeleted,
  contributorId,
}: DataManagementSectionProps) {
  const [serverResult, setServerResult] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "This will permanently delete all your tracked price data. Your consent history will be preserved. Continue?",
    );
    if (!confirmed) return;

    await deleteAllLocalData(db);
    onDataDeleted();
  }

  async function handleServerDelete() {
    const confirmed = window.confirm(
      "This will permanently delete all your data from the community server. This cannot be undone. Continue?",
    );
    if (!confirmed) return;

    try {
      const response = await browser.runtime.sendMessage({
        type: "DELETE_SERVER_DATA",
        contributorId,
      });
      setServerResult(`Deleted ${response.deleted} observations from server.`);
    } catch {
      setServerResult("Failed to delete server data. Please try again.");
    }
  }

  return (
    <div>
      <div className={styles.buttons}>
        <button className={styles.deleteButton} onClick={handleDelete}>
          Delete all local data
        </button>
        <button
          className={styles.serverButton}
          disabled={!contributorId}
          onClick={handleServerDelete}
        >
          Request server deletion
        </button>
      </div>
      {serverResult ? (
        <p className={styles.hint}>{serverResult}</p>
      ) : (
        <p className={styles.hint}>
          {contributorId
            ? "Request deletion of all your data from the community server."
            : "Server deletion will be available after you've contributed data."}
        </p>
      )}
    </div>
  );
}
