import styles from "./PopupFooter.module.css";

function getExtensionUrl(path: string): string {
  try {
    return browser.runtime.getURL(path);
  } catch {
    return `#${path}`;
  }
}

export function PopupFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links}>
        <a href={getExtensionUrl("/dashboard.html")} className={styles.link}>
          Dashboard
        </a>
        <a href={getExtensionUrl("/options.html")} className={styles.link}>
          Settings
        </a>
      </nav>
      <p className={styles.status}>Not contributing</p>
      <p className={styles.cta}>
        Help other Australians spot unfair pricing — start contributing
      </p>
    </footer>
  );
}
