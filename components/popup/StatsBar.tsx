import styles from "./StatsBar.module.css";

interface StatsBarProps {
  distinctProducts: number;
  totalObservations: number;
  byChain: Record<string, number>;
}

export function StatsBar({ distinctProducts, totalObservations, byChain }: StatsBarProps) {
  const chains = Object.entries(byChain);
  const isError = distinctProducts < 0;

  return (
    <section className={styles.stats}>
      <div className={styles.summary}>
        <span>{isError ? "\u2014" : `${distinctProducts} products`}</span>
        {" · "}
        <span>{isError ? "\u2014" : `${totalObservations} prices`}</span>
      </div>
      {chains.length > 0 && (
        <div className={styles.chains}>
          {chains.map(([chain, count]) => (
            <span key={chain} className={styles.chain}>
              {chain.charAt(0).toUpperCase() + chain.slice(1)}: {count}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
