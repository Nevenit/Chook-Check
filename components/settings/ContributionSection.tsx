import type { UserSettings } from "@/lib/types";
import { ToggleSwitch } from "./ToggleSwitch";
import styles from "./ContributionSection.module.css";

interface ContributionSectionProps {
  settings: UserSettings;
  onToggle: (key: keyof UserSettings, value: boolean) => void;
}

const CONTEXT_TOGGLES: {
  key: keyof UserSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "shareBrowser",
    label: "Browser",
    description:
      "e.g. Chrome, Firefox — helps detect browser-based price differences",
  },
  {
    key: "shareState",
    label: "State",
    description: "e.g. VIC, NSW — helps detect regional pricing",
  },
  {
    key: "shareCity",
    label: "City / Region",
    description: "e.g. Melbourne, Perth — helps detect city-level pricing",
  },
  {
    key: "shareStore",
    label: "Specific store",
    description: "e.g. Coles Fitzroy — helps detect store-level pricing",
  },
  {
    key: "linkAccount",
    label: "Link supermarket account",
    description:
      "Hashed email — enables cross-device personalisation detection",
  },
];

export function ContributionSection({
  settings,
  onToggle,
}: ContributionSectionProps) {
  return (
    <div>
      <div className={styles.toggleCard}>
        <div className={styles.toggleRow}>
          <div>
            <div className={styles.toggleLabel}>Contribute price data</div>
            <div className={styles.toggleDescription}>
              Share the prices you see with the Chook Check community
            </div>
          </div>
          <ToggleSwitch
            checked={settings.contributionEnabled}
            onChange={(v) => onToggle("contributionEnabled", v)}
          />
        </div>
      </div>

      <div className={styles.infoBox}>
        <div className={styles.infoTitle}>
          What gets shared when you contribute
        </div>
        <div className={styles.infoText}>
          Product name, brand, price, unit price, store chain, and when you saw
          it.
          <br />A random anonymous ID (not linked to you in any way).
        </div>
      </div>

      <div className={styles.contextTitle}>
        Optional context (more detail = better community insights)
      </div>

      <div className={styles.contextGroup}>
        {CONTEXT_TOGGLES.map((toggle) => (
          <div key={toggle.key} className={styles.contextItem}>
            <div>
              <div className={styles.contextLabel}>{toggle.label}</div>
              <div className={styles.contextDescription}>
                {toggle.description}
              </div>
            </div>
            <ToggleSwitch
              checked={settings[toggle.key] as boolean}
              onChange={(v) => onToggle(toggle.key, v)}
              disabled={!settings.contributionEnabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
