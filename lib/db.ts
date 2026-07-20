import Dexie, { type EntityTable } from "dexie";
import type {
  CommunitySnapshot,
  PriceObservation,
  SharingEvent,
  UserSettings,
} from "./types";

export type StoredSettings = UserSettings & { key: string };

export class ChookCheckDB extends Dexie {
  priceObservations!: EntityTable<PriceObservation, "id">;
  userSettings!: EntityTable<StoredSettings, "key">;
  sharingLog!: EntityTable<SharingEvent, "id">;
  communitySnapshots!: EntityTable<CommunitySnapshot, "productId">;

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
    this.version(3)
      .stores({
        priceObservations:
          "++id, productId, storeChain, observedAt, [productId+observedAt]",
        userSettings: "key",
        sharingLog: "++id, timestamp",
      })
      .upgrade(async (tx) => {
        await tx
          .table("userSettings")
          .toCollection()
          .modify((settings: Record<string, unknown>) => {
            const wasContributing = settings.contributionEnabled === true;
            settings.communityDownloadsEnabled = false;
            settings.historyContributionEnabled = false;
            settings.fairnessStudyEnabled = false;
            settings.inlineOverlayEnabled = false;
            settings.consentVersion = "";
            settings.reconsentRequired = wasContributing;
            settings.legacyContributorId = wasContributing
              ? String(settings.contributorId ?? "")
              : "";
            settings.contributorId = "";
            settings.submitToken = "";
            settings.deletionToken = "";
            settings.pendingServerDeletion = null;
            settings.communitySnapshotSyncedAt = "";
            delete settings.contributionEnabled;
            delete settings.contributorIdMode;
            delete settings.linkAccount;
          });
      });
    this.version(4)
      .stores({
        priceObservations:
          "++id, &clientObservationId, productId, storeChain, observedAt, [productId+observedAt]",
        userSettings: "key",
        sharingLog: "++id, timestamp",
        communitySnapshots: "&productId, storeChain, downloadedAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("priceObservations")
          .toCollection()
          .modify((observation: Record<string, unknown>) => {
            observation.schemaVersion = 2;
            observation.clientObservationId = crypto.randomUUID();
            observation.offerTextNormalized = null;
            observation.offerId = null;
            observation.requiredQuantity = null;
            observation.sourceSurface = "unknown";
            observation.extractionSource = "unknown";
            observation.scraperVersion = "legacy";
            observation.instrumentMode = "silent";
            observation.capturePhase = "baseline";
            observation.comparisonId = null;
            observation.storeId = null;
            observation.coarseRegion = null;
            observation.fulfilmentMode = "unknown";
            observation.authState = "unknown";
            observation.loyaltyState = "unknown";
          });
      });
  }
}

export const db = new ChookCheckDB();
