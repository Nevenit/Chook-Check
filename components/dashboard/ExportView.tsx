import { useState } from "react";
import { db } from "@/lib/db";
import { exportAsJSON, exportAsCSV } from "@/lib/export";
import styles from "./ExportView.module.css";

export function ExportView() {
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport(format: "json" | "csv") {
    setExporting(true);
    setStatus(null);
    try {
      const content =
        format === "json" ? await exportAsJSON(db) : await exportAsCSV(db);

      if (!content || content === "[]" || content === "") {
        setStatus("No data to export.");
        return;
      }

      const blob = new Blob([content], {
        type: format === "json" ? "application/json" : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chook-check-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Exported as ${format.toUpperCase()}.`);
    } catch {
      setStatus("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Download all your tracked price observations as JSON or CSV.
      </p>
      <div className={styles.buttons}>
        <button
          className={styles.button}
          onClick={() => handleExport("json")}
          disabled={exporting}
        >
          Export JSON
        </button>
        <button
          className={styles.button}
          onClick={() => handleExport("csv")}
          disabled={exporting}
        >
          Export CSV
        </button>
      </div>
      {status && <p className={styles.status}>{status}</p>}
    </div>
  );
}
