interface SparklineProps {
  prices: number[];
  onSale?: boolean[];
  width?: number;
  height?: number;
}

const GREEN = "#16a34a";
const AMBER = "#f59e0b";

export function Sparkline({
  prices,
  onSale,
  width = 200,
  height = 40,
}: SparklineProps) {
  if (prices.length === 0) return null;

  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  if (prices.length === 1) {
    const isSale = onSale?.[0] ?? false;
    return (
      <svg width={width} height={height} className="cc-sparkline">
        <circle
          cx={width / 2}
          cy={height / 2}
          r={3}
          fill={isSale ? AMBER : GREEN}
        />
      </svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = prices.map((price, i) => ({
    x: padding + (i / (prices.length - 1)) * chartWidth,
    y: padding + chartHeight - ((price - min) / range) * chartHeight,
  }));

  return (
    <svg width={width} height={height} className="cc-sparkline">
      {coords.map((coord, i) => {
        if (i === 0) return null;
        const prev = coords[i - 1];
        const isSale = onSale?.[i] ?? false;
        return (
          <line
            key={`seg-${i}`}
            x1={prev.x}
            y1={prev.y}
            x2={coord.x}
            y2={coord.y}
            stroke={isSale ? AMBER : GREEN}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
      {coords.map((coord, i) => {
        const isSale = onSale?.[i] ?? false;
        const isLast = i === coords.length - 1;
        if (!isSale && !isLast) return null;
        return (
          <circle
            key={`dot-${i}`}
            cx={coord.x}
            cy={coord.y}
            r={3}
            fill={isSale ? AMBER : GREEN}
          />
        );
      })}
    </svg>
  );
}
