import { formatPrice } from "../shared/formatPrice";
import { formatRelativeTime } from "../shared/formatTime";
import styles from "./ObservationItem.module.css";
import type { PriceObservation } from "@/lib/types";

interface ObservationItemProps {
  observation: PriceObservation;
}

export function ObservationItem({ observation }: ObservationItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.top}>
        <span className={styles.name}>{observation.productName}</span>
        <span className={styles.price}>{formatPrice(observation.priceCents)}</span>
      </div>
      <div className={styles.bottom}>
        <span className={styles.chain}>{observation.storeChain}</span>
        <span className={styles.dot}> · </span>
        <span className={styles.time}>{formatRelativeTime(observation.observedAt)}</span>
      </div>
    </div>
  );
}
