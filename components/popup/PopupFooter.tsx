import styles from "./PopupFooter.module.css";

type ExtensionPage = "/dashboard.html" | "/options.html";

function getExtensionUrl(path: ExtensionPage): string {
  try {
    return browser.runtime.getURL(path);
  } catch {
    return `#${path}`;
  }
}

export function PopupFooter({
  contributing = false,
}: {
  contributing?: boolean;
}) {
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
      <p className={styles.status}>
        {contributing ? "Pseudonymous contribution enabled" : "Local only"}
      </p>
      <p className={styles.cta}>
        Help other Australians spot unfair pricing — start contributing
      </p>
    </footer>
  );
}
