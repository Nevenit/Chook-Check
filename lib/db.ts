import Dexie, { type EntityTable } from "dexie";
import type { PriceObservation, UserSettings, SharingEvent } from "./types";

export type StoredSettings = UserSettings & { key: string };

export class ChookCheckDB extends Dexie {
  priceObservations!: EntityTable<PriceObservation, "id">;
  userSettings!: EntityTable<StoredSettings, "key">;
  sharingLog!: EntityTable<SharingEvent, "id">;

  constructor(name = "ChookCheckDB") {
    super(name);
    this.version(1).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
    });
    this.version(2).stores({
      priceObservations:
        "++id, productId, storeChain, observedAt, [productId+observedAt]",
      userSettings: "key",
      sharingLog: "++id, timestamp",
    });
  }
}

export const db = new ChookCheckDB();
