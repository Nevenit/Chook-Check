import { useRef, useEffect } from "react";
import { Chart, registerables } from "chart.js";
import type { PriceObservation } from "@/lib/types";
import styles from "./PriceChart.module.css";

Chart.register(...registerables);

const GREEN = "#1a7a2e";
const GREEN_FILL = "rgba(26, 122, 46, 0.1)";
const AMBER = "#f59e0b";
const AMBER_FILL = "rgba(245, 158, 11, 0.15)";

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
    const isSale = sorted.map((o) => o.promoType !== null);

    const pointBackgroundColor = isSale.map((s) => (s ? AMBER : GREEN));
    const pointBorderColor = pointBackgroundColor;
    const pointRadius = isSale.map((s) => (s ? 4 : 3));

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
            borderColor: GREEN,
            backgroundColor: GREEN_FILL,
            fill: true,
            tension: 0.2,
            pointRadius,
            pointHoverRadius: 5,
            pointBackgroundColor,
            pointBorderColor,
            segment: {
              borderColor: (ctx) => {
                const p0Sale = isSale[ctx.p0DataIndex];
                const p1Sale = isSale[ctx.p1DataIndex];
                return p0Sale || p1Sale ? AMBER : GREEN;
              },
              backgroundColor: (ctx) => {
                const p0Sale = isSale[ctx.p0DataIndex];
                const p1Sale = isSale[ctx.p1DataIndex];
                return p0Sale || p1Sale ? AMBER_FILL : GREEN_FILL;
              },
            },
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
              label: (ctx) => {
                const price = `$${ctx.parsed.y?.toFixed(2) ?? "0.00"}`;
                const promo = sorted[ctx.dataIndex]?.promoType;
                return promo ? `${price} (${promo})` : price;
              },
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
