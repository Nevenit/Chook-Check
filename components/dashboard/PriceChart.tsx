import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import type { PriceObservation } from "@/lib/types";
import styles from "./PriceChart.module.css";

Chart.register(...registerables);

interface PriceChartProps {
  observations: PriceObservation[];
}

export function PriceChart({ observations }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || observations.length === 0) return;

    const sorted = [...observations].sort((a, b) =>
      a.observedAt.localeCompare(b.observedAt),
    );

    const labels = sorted.map((o) =>
      new Date(o.observedAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      }),
    );
    const data = sorted.map((o) => o.priceCents / 100);

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Price ($)",
            data,
            borderColor: "#1a7a2e",
            backgroundColor: "rgba(26, 122, 46, 0.1)",
            fill: true,
            tension: 0.2,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (val) => `$${(val as number).toFixed(2)}`,
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [observations]);

  if (observations.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} height={300} />
    </div>
  );
}
