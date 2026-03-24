const THRESHOLD = 5;

interface OnboardingBannerProps {
  distinctProducts: number;
  contributionEnabled: boolean;
  onboardingDismissed: boolean;
  onDismiss: () => void;
}

export function OnboardingBanner({
  distinctProducts,
  contributionEnabled,
  onboardingDismissed,
  onDismiss,
}: OnboardingBannerProps) {
  if (contributionEnabled || onboardingDismissed || distinctProducts < THRESHOLD) {
    return null;
  }

  return (
    <div
      style={{
        background: "#e8f5e9",
        border: "1px solid #a5d6a7",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 12,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          You've tracked{" "}
          <strong>{distinctProducts} products</strong>! Help other Australians
          by sharing your price observations.
        </div>
        <button
          aria-label="dismiss"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 0 0 8px",
            color: "#666",
          }}
        >
          ✕
        </button>
      </div>
      <a
        href={browser.runtime.getURL("/options.html")}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          marginTop: 8,
          color: "#2e7d32",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Enable in settings →
      </a>
    </div>
  );
}
