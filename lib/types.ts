export type StoreChain = "woolworths" | "coles";
export type SourceSurface =
  | "product_page"
  | "search_result"
  | "category_tile"
  | "recommendation"
  | "personalised_placement"
  | "unknown";
export type ExtractionSource =
  | "json_ld"
  | "hydration_state"
  | "dom"
  | "unknown";
export type InstrumentMode = "silent" | "user_activated_inline";
export type CapturePhase = "baseline" | "pre_ui" | "post_ui";
export type FulfilmentMode = "delivery" | "pickup" | "in_store" | "unknown";
export type AuthState = "guest" | "signed_in" | "unknown";
export type LoyaltyState = "member_eligible" | "non_member" | "unknown";

export interface PriceObservation {
  id?: number;
  schemaVersion: 2;
  clientObservationId: string;
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  gtin: string | null;
  storeChain: StoreChain;
  priceCents: number;
  wasPriceCents: number | null;
  unitPriceCents: number | null;
  unitMeasure: string | null;
  promoType: string | null;
  offerTextNormalized: string | null;
  offerId: string | null;
  requiredQuantity: number | null;
  isPersonalised: boolean;
  sourceSurface: SourceSurface;
  extractionSource: ExtractionSource;
  scraperVersion: string;
  instrumentMode: InstrumentMode;
  capturePhase: CapturePhase;
  comparisonId: string | null;
  storeId: string | null;
  coarseRegion: string | null;
  fulfilmentMode: FulfilmentMode;
  authState: AuthState;
  loyaltyState: LoyaltyState;
  pageUrl: string;
  observedAt: string;
  contributed: boolean;
  // Local snapshot; omitted on older observations rather than reconstructed.
  userContextAtCapture?: { state: string; city: string; store: string } | null;
}

export type PrivacyModeKey =
  | "communityDownloadsEnabled"
  | "historyContributionEnabled"
  | "fairnessStudyEnabled"
  | "inlineOverlayEnabled";

export interface PendingServerDeletion {
  contributorId: string;
  deletionToken: string;
  requestedAt: string;
  lastAttemptAt: string;
  lastError: string;
}

export interface UserSettings {
  communityDownloadsEnabled: boolean;
  historyContributionEnabled: boolean;
  fairnessStudyEnabled: boolean;
  inlineOverlayEnabled: boolean;
  consentVersion: string;
  reconsentRequired: boolean;
  contributorId: string;
  submitToken: string;
  deletionToken: string;
  legacyContributorId: string;
  pendingServerDeletion: PendingServerDeletion | null;
  shareBrowser: boolean;
  shareState: boolean;
  shareCity: boolean;
  shareStore: boolean;
  onboardingDismissed: boolean;
  userState: string;
  userCity: string;
  userStoreName: string;
  consentLog: ConsentEvent[];
  communitySnapshotSyncedAt: string;
}

export interface ConsentEvent {
  action: "opted_in" | "opted_out" | "toggle_changed" | "data_deleted";
  detail: string;
  timestamp: string;
  mode?: PrivacyModeKey;
  consentVersion?: string;
  disclosureText?: string;
}

export interface ContributorCredentials {
  contributorId: string;
  submitToken: string;
  deletionToken: string;
}

export interface SubmitRequestV2 {
  mode: "history" | "fairness";
  observations: ObservationV2[];
}

export interface ObservationV2 {
  schemaVersion: 2;
  clientObservationId: string;
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  gtin: string | null;
  storeChain: StoreChain;
  currentPriceCents: number;
  regularPriceCents: number | null;
  unitPriceCents: number | null;
  unitMeasure: string | null;
  offerType: string | null;
  offerTextNormalized: string | null;
  offerId: string | null;
  requiredQuantity: number | null;
  sourceSurface: SourceSurface;
  extractionSource: ExtractionSource;
  scraperVersion: string;
  instrumentMode: InstrumentMode;
  capturePhase: CapturePhase;
  comparisonId: string | null;
  storeId: string | null;
  coarseRegion: string | null;
  fulfilmentMode: FulfilmentMode;
  authState: AuthState;
  loyaltyState: LoyaltyState;
  browserFamily: string | null;
  clientObservedAt: string;
}

export interface SubmitResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  reasons?: string[];
}

export interface ProductStats {
  productId: string;
  productName: string;
  brand: string | null;
  storeChain: string;
  quorum: boolean;
  currentMedianCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  observationCount: number;
  contributorCount: number;
  promoFrequency: Record<string, number>;
}

export interface CommunitySnapshot extends ProductStats {
  downloadedAt: string;
}

export interface SharingEvent {
  id?: number;
  timestamp: string;
  observationCount: number;
  status: "success" | "error";
  errorMessage?: string;
}

export interface ScraperConfig {
  chain: StoreChain;
  version: string;
  productPage: {
    urlPattern: string;
    selectors: {
      jsonLd: string;
      jsState: string;
      productName: string[];
      price: string[];
      wasPrice: string[];
      unitPrice: string[];
      unitMeasure: string[];
      promoLabel: string[];
      personalisedSection: string[];
      productId: string[];
      brand: string[];
      category: string[];
    };
  };
}
