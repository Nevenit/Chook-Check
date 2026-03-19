interface OverlayBadgeProps {
  isExpanded: boolean;
  priceBelowAvg: boolean;
  onClick: () => void;
}

export function OverlayBadge({ isExpanded, priceBelowAvg, onClick }: OverlayBadgeProps) {
  if (isExpanded) return null;

  return (
    <button
      className={`cc-badge ${priceBelowAvg ? "cc-badge-good" : "cc-badge-neutral"}`}
      onClick={onClick}
      title="Chook Check — view price history"
    >
      CC
    </button>
  );
}
