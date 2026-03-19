interface SparklineProps {
  prices: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ prices, width = 200, height = 40 }: SparklineProps) {
  if (prices.length === 0) return null;

  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  if (prices.length === 1) {
    return (
      <svg width={width} height={height} className="cc-sparkline">
        <circle cx={width / 2} cy={height / 2} r={3} className="cc-sparkline-dot" />
      </svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices
    .map((price, i) => {
      const x = padding + (i / (prices.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((price - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const lastX = padding + chartWidth;
  const lastY =
    padding + chartHeight - ((prices[prices.length - 1] - min) / range) * chartHeight;

  return (
    <svg width={width} height={height} className="cc-sparkline">
      <polyline points={points} className="cc-sparkline-line" />
      <circle cx={lastX} cy={lastY} r={3} className="cc-sparkline-dot" />
    </svg>
  );
}
