import styles from "./PopupHeader.module.css";

export function PopupHeader() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Chook Check</h1>
      <p className={styles.tagline}>Tracking Australian prices</p>
    </header>
  );
}
