import { Sparkline } from "./Sparkline";
import { formatPrice } from "../shared/formatPrice";
import type { PriceObservation, ProductStats } from "@/lib/types";

interface OverlayPanelProps {
  productName: string;
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
  currentPriceCents: number;
  onClose: () => void;
  error?: boolean;
  communityStats?: ProductStats | null;
  communityLoading?: boolean;
}

export function OverlayPanel({
  productName,
  history,
  stats,
  currentPriceCents,
  onClose,
  error = false,
  communityStats,
  communityLoading = false,
}: OverlayPanelProps) {
  const prices = history.map((o) => o.priceCents);
  const onSale = history.map((o) => o.promoType !== null);

  const showCommunity = communityLoading || communityStats != null;

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
          <Sparkline prices={prices} onSale={onSale} />
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
      {showCommunity && (
        <div className="cc-panel-community">
          <div className="cc-panel-community-title">Community</div>
          {communityLoading ? (
            <p className="cc-panel-community-loading">Loading...</p>
          ) : communityStats?.quorum ? (
            <div className="cc-panel-community-stats">
              <div className="cc-panel-row">
                <span className="cc-panel-label">Median</span>
                <span className="cc-panel-value">
                  {formatPrice(communityStats.currentMedianCents!)}
                </span>
              </div>
              <div className="cc-panel-row">
                <span className="cc-panel-label">Low</span>
                <span className="cc-panel-value">
                  {formatPrice(communityStats.minCents!)}
                </span>
                <span className="cc-panel-sep"> · </span>
                <span className="cc-panel-label">High</span>
                <span className="cc-panel-value">
                  {formatPrice(communityStats.maxCents!)}
                </span>
              </div>
              <div className="cc-panel-tracked">
                {communityStats.observationCount} observations from{" "}
                {communityStats.contributorCount} contributors
              </div>
              {Object.keys(communityStats.promoFrequency).length > 0 && (
                <div className="cc-panel-promos">
                  {Object.entries(communityStats.promoFrequency).map(
                    ([type, count]) => (
                      <span key={type} className="cc-panel-promo-tag">
                        {type}: {count}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : communityStats ? (
            <p className="cc-panel-community-quorum">
              Not enough community data yet ({communityStats.contributorCount}{" "}
              of 3 contributors needed)
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
