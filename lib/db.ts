import Dexie, { type EntityTable } from "dexie";
import type { PriceObservation, UserSettings } from "./types";

export type StoredSettings = UserSettings & { key: string };

export class ChookCheckDB extends Dexie {
  priceObservations!: EntityTable<PriceObservation, "id">;
  userSettings!: EntityTable<StoredSettings, "key">;

  constructor(name = "ChookCheckDB") {
    super(name);
    this.version(1).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
    });
  }
}

export const db = new ChookCheckDB();
