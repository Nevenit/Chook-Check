import styles from "./AboutSection.module.css";

function getVersion(): string {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return "dev";
  }
}

export function AboutSection() {
  return (
    <div>
      <p className={styles.text}>
        Chook Check v{getVersion()}
        <br />
        Helping Australians track supermarket prices and spot unfair pricing.
      </p>
      <a
        href="https://github.com/Nevenit/Chook-Check"
        className={styles.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on GitHub →
      </a>
    </div>
  );
}
