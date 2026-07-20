import type {
  AuthState,
  FulfilmentMode,
  LoyaltyState,
  PriceObservation,
} from "./types";

const MAX_SCRIPT_TEXT_LENGTH = 2_000_000;

export interface DetectedPageContext {
  authState: AuthState;
  loyaltyState: LoyaltyState;
  fulfilmentMode: FulfilmentMode;
  storeId: string | null;
}

export function detectPageContext(doc: Document): DetectedPageContext {
  const structuredText = getBoundedScriptText(doc);
  return {
    authState: detectBooleanState(
      structuredText,
      ["isAuthenticated", "isLoggedIn", "authenticated", "loggedIn"],
      "signed_in",
      "guest",
    ),
    loyaltyState: detectBooleanState(
      structuredText,
      ["isRewardsMember", "isLoyaltyMember", "hasRewardsAccount"],
      "member_eligible",
      "non_member",
    ),
    fulfilmentMode: detectFulfilmentMode(structuredText),
    storeId: detectSelectedStoreId(structuredText),
  };
}

export function enrichObservationWithPageContext(
  observation: PriceObservation,
  doc: Document,
): PriceObservation {
  return { ...observation, ...detectPageContext(doc) };
}

function getBoundedScriptText(doc: Document): string {
  let result = "";
  for (const script of doc.querySelectorAll("script")) {
    const text = script.textContent ?? "";
    const remaining = MAX_SCRIPT_TEXT_LENGTH - result.length;
    if (remaining <= 0) break;
    result += text.slice(0, remaining);
  }
  return result;
}

function detectBooleanState<T extends AuthState | LoyaltyState>(
  text: string,
  keys: string[],
  enabled: T,
  disabled: T,
): T | "unknown" {
  const keyPattern = keys.join("|");
  const match = text.match(
    new RegExp(`['"](?:${keyPattern})['"]\\s*:\\s*(true|false)`, "i"),
  );
  if (!match) return "unknown";
  return match[1].toLowerCase() === "true" ? enabled : disabled;
}

function detectFulfilmentMode(text: string): FulfilmentMode {
  const match = text.match(
    /['"](?:fulfilmentMode|fulfillmentMode|shoppingMode|deliveryMode)['"]\s*:\s*['"]([^'"]{1,32})['"]/i,
  );
  const mode = match?.[1].toLowerCase().replace(/[\s-]+/g, "_");
  if (mode === "delivery") return "delivery";
  if (["pickup", "pick_up", "click_and_collect"].includes(mode ?? "")) {
    return "pickup";
  }
  if (["in_store", "instore"].includes(mode ?? "")) return "in_store";
  return "unknown";
}

function detectSelectedStoreId(text: string): string | null {
  const match = text.match(
    /['"](?:selectedStoreId|currentStoreId|fulfilmentStoreId|fulfillmentStoreId)['"]\s*:\s*['"]([A-Za-z0-9_-]{1,64})['"]/i,
  );
  return match?.[1] ?? null;
}
