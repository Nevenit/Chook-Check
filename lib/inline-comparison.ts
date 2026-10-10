import type { PriceObservation } from "./types";

export const POST_UI_DELAY_MS = 1000;

interface InlineComparison {
  capture: (
    phase: "pre_ui" | "post_ui",
    comparisonId: string,
  ) => PriceObservation | null;
  persist: (observation: PriceObservation) => Promise<boolean>;
  mount: (preUi: PriceObservation) => void;
  isCurrent: () => boolean;
}

/** A fixed post-insertion sample includes unchanged prices in the denominator. */
export async function runInlineComparison(
  options: InlineComparison,
): Promise<void> {
  const comparisonId = crypto.randomUUID();
  if (!options.isCurrent()) throw new Error("The retailer page changed");
  const preUi = options.capture("pre_ui", comparisonId);
  if (!preUi) throw new Error("No product price was found on this page");
  if (!(await options.persist(preUi)))
    throw new Error("The pre-UI price could not be saved");
  if (!options.isCurrent()) throw new Error("The retailer page changed");
  options.mount(preUi);
  await new Promise((resolve) => setTimeout(resolve, POST_UI_DELAY_MS));
  if (!options.isCurrent()) return;
  const postUi = options.capture("post_ui", comparisonId);
  if (!postUi || postUi.productId !== preUi.productId) return;
  // Missing or failed captures remain incomplete; never fabricate an unchanged price.
  await options.persist(postUi);
}
