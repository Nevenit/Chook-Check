# Price-History and Fairness Measurement Methodology

**Reviewed:** 20 July 2026

## Purpose

Chook Check records the prices actually rendered to participating browsers. It aims to provide useful historical price context and identify persistent, like-for-like price differences that deserve investigation.

It does not determine a retailer’s intent, internal pricing rule, experiment assignment, or legal compliance. A “possible differential pricing” result is not proof of personalisation or wrongdoing.

## Observation model

An observation includes:

- product and retailer identifiers;
- current, regular, and unit price where available;
- normalized offer type, offer ID/text, and required quantity where available;
- source surface such as product page, search result, category tile, recommendation, or personalised placement;
- extraction source and scraper version;
- observed time; and
- instrument mode and capture phase.

Fairness-study observations may also include coarse store/region, fulfilment, sign-in, loyalty eligibility, and optional browser-family context. Ambiguous context is represented as `unknown`, not guessed.

Client timestamps must be recent, and exact duplicate observation IDs from the same contributor are rejected. Product IDs must have the matching retailer prefix. Unknown input fields are rejected, preventing accidental page-URL upload.

## Local versus community history

Local history is the user’s own browser record and requires no crowd threshold. The community service exposes product statistics only when at least five distinct contributors are represented.

For aggregation, repeated samples are balanced to one observation per contributor per product/day. This limits the influence of heavy browsers. Daily prices use the median; the minimum and maximum are also reported. “Current” community price refers to the latest represented day, not a median across the whole lookback window.

Raw observations are kept for approximately 180 days. Eligible product-days are then reduced to daily aggregates only if they independently meet the five-contributor threshold. These daily aggregates can support up to three years of price history.

## Offer and context matching

Price differences can be legitimate when observations differ by:

- store or region;
- fulfilment mode;
- offer type, offer ID, or required quantity;
- source surface;
- capture instrument/phase;
- sign-in or loyalty eligibility; or
- time.

The analysis first groups by product and the non-account context above. If explicit sign-in or loyalty groups have different medians, the result is labelled `contextual_difference`, not unexplained personalisation. The explanation states that the difference coincides with disclosed context and does not establish causation.

For an unexplained signal, sign-in and loyalty state are included in the matching key as well. Unknown sign-in, loyalty, fulfilment, surface, or extraction values cannot support an unexplained-pricing signal. They are never silently treated as known states. Captures from the older 2.0.0/2.1.0 collection pipeline and legacy/unknown scraper versions remain usable for history but are excluded from fairness signals, because their sampling context or comparison pairs may have been lost.

## Local sampling and submission

Local storage retains the first immutable observation for each product, complete measured context, and UTC hour. Repeated notifications within that window do not change the original timestamp or observation ID. Changed prices, offers, context, capture phases, and comparison IDs remain separate. An open approved page is checked once per minute and on debounced DOM changes; unchanged samples are retained at most once per hour for the same context. These checks do not refresh the retailer page or make network requests.

History charts and exports use these retained observations; multiple equal-price points represent separate sampling windows or contexts. The community history calculation continues to balance samples to one per contributor/product/day. No schema migration is needed for the new deduplication rules, and lost historical context is not reconstructed.

User-entered state, city/region, and store choices are saved with each new capture only when fairness mode and the corresponding sharing choices are enabled. Uploads use that saved context, filtered by the current sharing choices; changing settings cannot relabel older observations. Older observations without a context snapshot may use their original page-detected store when sharing permits, but cannot acquire a retrospective user-entered region/store.

Only silent baseline observations are eligible for history-only uploads. Inline pairs remain local unless fairness contribution is enabled and has the required sharing context. Submission rechecks consent and credentials before every batch; opting out prevents later requests but cannot recall a request already sent. Failed or incompletely acknowledged batches retry with the same immutable observation IDs.

## Differential-pricing thresholds

A cohort can be labelled `possible_differential_pricing` only when:

1. at least ten distinct contributors are in the fully matched cohort;
2. at least two price groups remain;
3. each reported price group contains at least three distinct contributors; and
4. the same set of qualifying prices appears in at least two separate UTC hourly buckets, each with ten contributors. Within each matched hourly cohort only the latest sample per contributor is used, so one contributor cannot populate both price groups.

The current classification is “moderate” confidence in an anomaly worth reviewing, not confidence in a causal mechanism. Cohorts below the thresholds remain `insufficient_evidence`.

## Inline observer-effect measurement

The optional inline overlay is detectable because it changes the retailer page. To distinguish an already-delivered price from a price that changes after UI insertion:

1. with the inline setting enabled, a random comparison ID is created automatically for each product page;
2. the page price is scraped and persisted as `pre_ui` before any DOM insertion;
3. silent collection is paused for the current page and the overlay is inserted in a closed shadow root; and
4. one price is sampled one second after insertion and persisted as `post_ui` with the same comparison ID, whether the price changed or remained the same.

Navigation or a failed/missing capture leaves an incomplete pair; no unchanged value is invented. The API excludes ambiguous pairs with repeated phases, different products/context, reversed timestamps, or more than ten seconds between captures. Timer throttling can therefore leave a pair ineligible. Silent collection resumes after navigation; the overlay is removed on navigation or when the setting is disabled. While enabled, it is inserted again on the next product page after saving its pre-UI price. The protocol retains the instrument name `user_activated_inline` for these user-enabled captures. An injection failure leaves collection paused until navigation or reload.

Observer-effect output is withheld until at least five contributors have complete pre/post pairs. A changed price after injection is evidence of a temporal association only. Page refreshes, retailer timers, stock/location updates, and other scripts are alternative explanations.

## Outliers and abuse resistance

An incoming value is quarantined when at least five comparable same-product/day/offer values exist and it falls below one-fifth or above five times their median. Quarantined rows are excluded from public aggregates.

This broad rule catches obvious unit/selector failures without automatically discarding genuine specials. It is not a complete fraud detector. Registration throttling, authenticated submissions, deduplication, quorum, and contributor/day balancing raise the cost of poisoning but do not prevent coordinated Sybil attacks.

## Known limitations

- Retailer DOM and structured data can change without notice.
- The same catalogue product may have variants or offer conditions not captured by available markup.
- Store and region fields may be user-entered and incorrect.
- Page-provided sign-in, loyalty, fulfilment, and store fields may be absent or stale.
- Contributors are self-selected and not a representative population sample.
- Device, app, cookie, experiment, subscription, stock, delivery-window, and retailer-side segmentation may remain unobserved.
- Many products and cohorts may be examined, increasing the chance of coincidental anomalies.
- Sparse thresholds protect privacy and integrity but reduce coverage.
- The extension cannot observe the price a user would have received without their existing cookies/account context.

Any public claim based on Chook Check data should include the product, time range, cohort definition, contributor counts, price groups, known context, and plausible alternative explanations. Independent reproduction—ideally with controlled accounts/devices and retailer receipts—is required before making a causal allegation.
