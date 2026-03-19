import { Sparkline } from "./Sparkline";
import { formatPrice } from "../shared/formatPrice";
import type { PriceObservation } from "@/lib/types";

interface OverlayPanelProps {
  productName: string;
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
  currentPriceCents: number;
  onClose: () => void;
  error?: boolean;
}

export function OverlayPanel({
  productName,
  history,
  stats,
  currentPriceCents,
  onClose,
  error = false,
}: OverlayPanelProps) {
  const prices = history.map((o) => o.priceCents);

  return (
    <div className="cc-panel">
      <div className="cc-panel-header">
        <span className="cc-panel-title">{productName}</span>
        <button className="cc-panel-close" onClick={onClose}>
          ✕
        </button>
      </div>
      {error ? (
        <p className="cc-panel-empty">Unable to load price history.</p>
      ) : !stats ? (
        <p className="cc-panel-empty">
          First observation recorded — check back after your next visit to see
          trends.
        </p>
      ) : (
        <>
          <Sparkline prices={prices} />
          <div className="cc-panel-stats">
            <div className="cc-panel-row">
              <span className="cc-panel-label">Now</span>
              <span className="cc-panel-value">
                {formatPrice(currentPriceCents)}
              </span>
            </div>
            <div className="cc-panel-row">
              <span className="cc-panel-label">Avg</span>
              <span className="cc-panel-value">{formatPrice(stats.avg)}</span>
            </div>
            <div className="cc-panel-row">
              <span className="cc-panel-label">Low</span>
              <span className="cc-panel-value">{formatPrice(stats.min)}</span>
              <span className="cc-panel-sep"> · </span>
              <span className="cc-panel-label">High</span>
              <span className="cc-panel-value">{formatPrice(stats.max)}</span>
            </div>
            <div className="cc-panel-tracked">
              Tracked {stats.count} times
            </div>
          </div>
        </>
      )}
      <p className="cc-panel-community">Community data coming soon</p>
    </div>
  );
}
