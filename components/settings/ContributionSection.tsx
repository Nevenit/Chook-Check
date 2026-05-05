import type { UserSettings } from "@/lib/types";
import { ToggleSwitch } from "./ToggleSwitch";
import styles from "./ContributionSection.module.css";

type TextKey = "userState" | "userCity" | "userStoreName";

interface ContributionSectionProps {
  settings: UserSettings;
  onToggle: (key: keyof UserSettings, value: boolean) => void;
  onTextChange: (key: TextKey, value: string) => void;
}

const AU_STATES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

const CONTEXT_TOGGLES: {
  key: keyof UserSettings;
  label: string;
  description: string;
  textKey?: TextKey;
  inputType?: "select" | "text";
  placeholder?: string;
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
    textKey: "userState",
    inputType: "select",
  },
  {
    key: "shareCity",
    label: "City / Region",
    description: "e.g. Melbourne, Perth — helps detect city-level pricing",
    textKey: "userCity",
    inputType: "text",
    placeholder: "e.g. Melbourne",
  },
  {
    key: "shareStore",
    label: "Specific store",
    description: "e.g. Coles Fitzroy — helps detect store-level pricing",
    textKey: "userStoreName",
    inputType: "text",
    placeholder: "e.g. Coles Fitzroy",
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
  onTextChange,
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
        {CONTEXT_TOGGLES.map((toggle) => {
          const toggleOn = settings[toggle.key] as boolean;
          const showInput =
            toggle.textKey && toggleOn && settings.contributionEnabled;

          return (
            <div key={toggle.key}>
              <div className={styles.contextItem}>
                <div>
                  <div className={styles.contextLabel}>{toggle.label}</div>
                  <div className={styles.contextDescription}>
                    {toggle.description}
                  </div>
                </div>
                <ToggleSwitch
                  checked={toggleOn}
                  onChange={(v) => onToggle(toggle.key, v)}
                  disabled={!settings.contributionEnabled}
                />
              </div>
              {showInput && (
                <div className={styles.contextInputRow}>
                  {toggle.inputType === "select" ? (
                    <select
                      className={styles.contextInput}
                      value={settings[toggle.textKey!] as string}
                      onChange={(e) =>
                        onTextChange(toggle.textKey!, e.target.value)
                      }
                    >
                      <option value="">Select state…</option>
                      {AU_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className={styles.contextInput}
                      value={settings[toggle.textKey!] as string}
                      onChange={(e) =>
                        onTextChange(toggle.textKey!, e.target.value)
                      }
                      placeholder={toggle.placeholder}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
