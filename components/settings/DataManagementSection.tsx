import { useState } from "react";
import { db } from "@/lib/db";
import {
  clearLocalLogs,
  clearPriceHistory,
  deleteAllLocalData,
} from "@/lib/settings";
import type { UserSettings } from "@/lib/types";
import styles from "./DataManagementSection.module.css";

interface DataManagementSectionProps {
  onDataDeleted: () => void;
  settings: UserSettings;
}

export function DataManagementSection({
  onDataDeleted,
  settings,
}: DataManagementSectionProps) {
  const [result, setResult] = useState<string | null>(null);

  async function handleClearHistory() {
    if (!window.confirm("Delete all locally stored price history?")) return;
    await clearPriceHistory(db);
    setResult("Local price history deleted.");
    onDataDeleted();
  }

  async function handleClearLogs() {
    if (!window.confirm("Delete the local sharing and consent logs?")) return;
    await clearLocalLogs(db);
    setResult("Local sharing and consent logs deleted.");
    onDataDeleted();
  }

  async function handleServerDelete() {
    if (
      !window.confirm(
        "Permanently delete raw server contributions still linked to this install? Privacy-thresholded daily aggregates cannot be reversed after raw records expire.",
      )
    )
      return;
    try {
      const response = await browser.runtime.sendMessage({
        type: "DELETE_SERVER_DATA",
        userInitiated: true,
      });
      setResult(`Deleted ${response.deleted} server observations.`);
      onDataDeleted();
    } catch {
      setResult(
        "Server deletion failed. Uploads are paused and the deletion credential is retained for retry.",
      );
      onDataDeleted();
    }
  }

  async function handleReset() {
    if (!window.confirm("Reset Chook Check and delete all local data?")) return;
    if (settings.deletionToken) {
      try {
        await browser.runtime.sendMessage({
          type: "DELETE_SERVER_DATA",
          userInitiated: true,
        });
      } catch {
        setResult(
          "Reset stopped because server deletion failed. The recovery credential was retained.",
        );
        onDataDeleted();
        return;
      }
    }
    await deleteAllLocalData(db);
    setResult("Chook Check was reset.");
    onDataDeleted();
  }

  function exportRecoveryCode() {
    const token =
      settings.pendingServerDeletion?.deletionToken ?? settings.deletionToken;
    if (!token) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { contributorId: settings.contributorId, deletionToken: token },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "chook-check-deletion-recovery.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className={styles.buttons}>
        <button className={styles.deleteButton} onClick={handleClearHistory}>
          Clear price history
        </button>
        <button className={styles.deleteButton} onClick={handleClearLogs}>
          Clear local logs
        </button>
        <button
          className={styles.serverButton}
          disabled={!settings.deletionToken}
          onClick={handleServerDelete}
        >
          Delete raw server contributions
        </button>
        <button
          className={styles.serverButton}
          disabled={!settings.deletionToken && !settings.pendingServerDeletion}
          onClick={exportRecoveryCode}
        >
          Export deletion recovery code
        </button>
        <button className={styles.deleteButton} onClick={handleReset}>
          Reset Chook Check
        </button>
      </div>
      <p className={styles.hint}>
        Delete server data before uninstalling or clearing extension storage.
        Otherwise the only deletion credential may be lost.
      </p>
      {settings.pendingServerDeletion && (
        <p className={styles.hint} role="alert">
          Server deletion is pending. Uploads are paused. Last error:{" "}
          {settings.pendingServerDeletion.lastError}
        </p>
      )}
      {settings.legacyContributorId && (
        <p className={styles.hint} role="alert">
          A pre-release contributor ID was found. The insecure UUID-only API was
          retired before public release and cannot be used as deletion
          authority. Contact the project maintainer before clearing this ID if
          you used a pre-release server.
        </p>
      )}
      {result && <p className={styles.hint}>{result}</p>}
    </div>
  );
}
