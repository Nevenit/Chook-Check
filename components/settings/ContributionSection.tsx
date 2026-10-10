import type { PrivacyModeKey, UserSettings } from "@/lib/types";
import { MODE_DISCLOSURES } from "@/lib/settings";
import { ToggleSwitch } from "./ToggleSwitch";
import styles from "./ContributionSection.module.css";

type TextKey = "userState" | "userCity" | "userStoreName";
type ContextToggleKey =
  | "shareBrowser"
  | "shareState"
  | "shareCity"
  | "shareStore";

interface ContributionSectionProps {
  settings: UserSettings;
  onToggle: (
    key: PrivacyModeKey | ContextToggleKey,
    value: boolean,
  ) => void | Promise<void>;
  onTextChange: (key: TextKey, value: string) => void;
  error?: string | null;
}

const AU_STATES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

const PRIVACY_MODES: Array<{
  key: PrivacyModeKey;
  label: string;
  summary: string;
}> = [
  {
    key: "communityDownloadsEnabled",
    label: "Community snapshot downloads",
    summary: "Download a bulk, privacy-thresholded comparison dataset.",
  },
  {
    key: "historyContributionEnabled",
    label: "Contribute price history",
    summary: "Share pseudonymous price and offer observations.",
  },
  {
    key: "fairnessStudyEnabled",
    label: "Join the fairness study",
    summary: "Share extra coarse context for matched price comparisons.",
  },
  {
    key: "inlineOverlayEnabled",
    label: "Show price history on product pages",
    summary: "Automatically show the chicken badge as you browse products.",
  },
];

const CONTEXT_TOGGLES: Array<{
  key: ContextToggleKey;
  label: string;
  description: string;
  textKey?: TextKey;
  inputType?: "select" | "text";
  placeholder?: string;
}> = [
  {
    key: "shareBrowser",
    label: "Browser family",
    description: "Chrome, Firefox, Edge, or Safari; never the full user-agent.",
  },
  {
    key: "shareState",
    label: "State",
    description: "A coarse state used to match regional cohorts.",
    textKey: "userState",
    inputType: "select",
  },
  {
    key: "shareCity",
    label: "City / region",
    description:
      "Optional coarse region; avoid entering an address or postcode.",
    textKey: "userCity",
    inputType: "text",
    placeholder: "e.g. Brisbane",
  },
  {
    key: "shareStore",
    label: "Store name or ID",
    description: "Optional store context; never enter account information.",
    textKey: "userStoreName",
    inputType: "text",
    placeholder: "e.g. Coles Toowong",
  },
];

export function ContributionSection({
  settings,
  onToggle,
  onTextChange,
  error,
}: ContributionSectionProps) {
  const fairnessContextReady = Boolean(
    (settings.shareStore && settings.userStoreName) ||
    (settings.shareState && settings.userState) ||
    (settings.shareCity && settings.userCity),
  );
  return (
    <div>
      {settings.reconsentRequired && (
        <div className={styles.infoBox} role="alert">
          A previous contribution setting was found. Uploads remain paused until
          you review and enable one of the new, separate modes below.
        </div>
      )}
      {error && (
        <div className={styles.infoBox} role="alert">
          {error}
        </div>
      )}
      {settings.fairnessStudyEnabled && !fairnessContextReady && (
        <div className={styles.infoBox} role="status">
          Fairness-study uploads are paused until you select at least one coarse
          state, city/region, or store context below.
        </div>
      )}

      <div className={styles.contextGroup}>
        {PRIVACY_MODES.map((mode) => (
          <div className={styles.toggleCard} key={mode.key}>
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>{mode.label}</div>
                <div className={styles.toggleDescription}>{mode.summary}</div>
              </div>
              <ToggleSwitch
                checked={settings[mode.key]}
                onChange={(value) => onToggle(mode.key, value)}
              />
            </div>
            <div className={styles.infoText}>{MODE_DISCLOSURES[mode.key]}</div>
          </div>
        ))}
      </div>

      <div className={styles.infoBox}>
        <div className={styles.infoTitle}>Pseudonymous, not anonymous</div>
        <div className={styles.infoText}>
          Contributions use a random ID plus separate secret submit and deletion
          tokens. Chook Check does not collect supermarket account identifiers,
          but repeated submissions can still be linked to that random ID.
        </div>
      </div>

      <div className={styles.contextTitle}>Optional fairness-study context</div>
      <div className={styles.contextGroup}>
        {CONTEXT_TOGGLES.map((toggle) => {
          const toggleOn = settings[toggle.key];
          const showInput =
            Boolean(toggle.textKey) &&
            toggleOn &&
            settings.fairnessStudyEnabled;
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
                  onChange={(value) => onToggle(toggle.key, value)}
                  disabled={!settings.fairnessStudyEnabled}
                />
              </div>
              {showInput && (
                <div className={styles.contextInputRow}>
                  {toggle.inputType === "select" ? (
                    <select
                      className={styles.contextInput}
                      value={settings[toggle.textKey!]}
                      onChange={(event) =>
                        onTextChange(toggle.textKey!, event.target.value)
                      }
                    >
                      <option value="">Select state…</option>
                      {AU_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className={styles.contextInput}
                      value={settings[toggle.textKey!]}
                      onChange={(event) =>
                        onTextChange(toggle.textKey!, event.target.value)
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
