import styles from "./ToggleSwitch.module.css";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.track}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
