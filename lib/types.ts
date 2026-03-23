export interface PriceObservation {
  id?: number;
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  gtin: string | null;
  storeChain: "woolworths" | "coles";
  priceCents: number;
  wasPriceCents: number | null;
  unitPriceCents: number | null;
  unitMeasure: string | null;
  promoType: string | null;
  isPersonalised: boolean;
  pageUrl: string;
  observedAt: string;
  contributed: boolean;
}

export interface UserSettings {
  contributionEnabled: boolean;
  contributorId: string;
  contributorIdMode: "anonymous" | "account_linked";
  shareBrowser: boolean;
  shareState: boolean;
  shareCity: boolean;
  shareStore: boolean;
  linkAccount: boolean;
  consentLog: ConsentEvent[];
}

export interface ConsentEvent {
  action: "opted_in" | "opted_out" | "toggle_changed" | "data_deleted";
  detail: string;
  timestamp: string;
}

export interface ScraperConfig {
  chain: "woolworths" | "coles";
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
