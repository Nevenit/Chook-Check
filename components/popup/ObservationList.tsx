import { ObservationItem } from "./ObservationItem";
import styles from "./ObservationList.module.css";
import type { PriceObservation } from "@/lib/types";

interface ObservationListProps {
  observations: PriceObservation[];
}

export function ObservationList({ observations }: ObservationListProps) {
  if (observations.length === 0) {
    return (
      <section className={styles.empty}>
        Visit a Woolworths or Coles product page to start tracking prices.
      </section>
    );
  }

  return (
    <section className={styles.list}>
      <h2 className={styles.heading}>Recent Observations</h2>
      {observations.map((obs) => (
        <ObservationItem key={obs.id ?? obs.observedAt} observation={obs} />
      ))}
    </section>
  );
}
