import { describe, expect, it } from "vitest";
import { detectPageContext } from "@/lib/page-context";

function documentWithState(state: Record<string, unknown>): Document {
  const doc = document.implementation.createHTMLDocument();
  const script = doc.createElement("script");
  script.type = "application/json";
  script.textContent = JSON.stringify(state);
  doc.head.appendChild(script);
  return doc;
}

describe("detectPageContext", () => {
  it("detects explicit signed-in, loyalty, fulfilment and selected-store state", () => {
    const context = detectPageContext(
      documentWithState({
        isAuthenticated: true,
        isRewardsMember: true,
        fulfilmentMode: "click-and-collect",
        selectedStoreId: "store_123",
      }),
    );

    expect(context).toEqual({
      authState: "signed_in",
      loyaltyState: "member_eligible",
      fulfilmentMode: "pickup",
      storeId: "store_123",
    });
  });

  it("only labels guest or non-member when an explicit false flag exists", () => {
    const context = detectPageContext(
      documentWithState({ isLoggedIn: false, isLoyaltyMember: false }),
    );

    expect(context.authState).toBe("guest");
    expect(context.loyaltyState).toBe("non_member");
  });

  it("does not mistake account identifiers for context", () => {
    const context = detectPageContext(
      documentWithState({ email: "person@example.com", loyaltyCard: "123" }),
    );

    expect(context).toEqual({
      authState: "unknown",
      loyaltyState: "unknown",
      fulfilmentMode: "unknown",
      storeId: null,
    });
  });
});
