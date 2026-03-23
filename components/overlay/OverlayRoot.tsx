import { useState, useEffect } from "react";
import { OverlayBadge } from "./OverlayBadge";
import { OverlayPanel } from "./OverlayPanel";
import type { PriceObservation } from "@/lib/types";

interface ProductData {
  history: PriceObservation[];
  stats: { min: number; max: number; avg: number; count: number } | null;
}

export function OverlayRoot({ productId }: { productId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 5000),
    );

    Promise.race([
      browser.runtime.sendMessage({ type: "GET_PRODUCT_DATA", productId }),
      timeout,
    ])
      .then((response: ProductData) => {
        setData(response);
      })
      .catch(() => {
        setError(true);
        setData({ history: [], stats: null });
      });
  }, [productId]);

  if (!data) return null;

  const latestObs =
    data.history.length > 0 ? data.history[data.history.length - 1] : null;
  const currentPrice = latestObs?.priceCents ?? 0;
  const productName = latestObs?.productName ?? "Product";
  const priceBelowAvg = data.stats ? currentPrice <= data.stats.avg : false;

  return (
    <>
      <OverlayBadge
        isExpanded={expanded}
        priceBelowAvg={priceBelowAvg}
        onClick={() => setExpanded(true)}
      />
      {expanded && (
        <OverlayPanel
          productName={productName}
          history={data.history}
          stats={data.stats}
          currentPriceCents={currentPrice}
          onClose={() => setExpanded(false)}
          error={error}
        />
      )}
    </>
  );
}
