# Public Release, Privacy, and Measurement Hardening — Implementation Plan

**Status:** Proposed. This plan replaces the current release path; it does not authorize publishing until every release gate at the end is satisfied.

**Goal:** Turn Chook Check into a public, privacy-first extension that provides trustworthy local price history and can report _possible differential pricing_ without confusing ordinary specials, region, store, fulfilment mode, loyalty eligibility, time, or extension-detection effects with individualised pricing.

**Repositories:**

- Extension: `/Users/michaelryan/pp/JavaScript/Chook_Check`
- API: `/Users/michaelryan/pp/JavaScript/chook-check-api`

**Implementation order:** API compatibility work first where noted, then extension migration, then aggregation and public claims. Use the checkbox steps as the source of truth. Do not combine phases merely because their code changes overlap.

---

## 1. Product and research decisions

These decisions are requirements, not implementation suggestions.

### 1.1 Product modes

Chook Check will expose four independent modes:

1. **Local history** — on by default. Read retailer pages and store observations locally. No Chook Check network request.
2. **Community aggregate downloads** — off by default. Download a bulk, quorum-filtered aggregate snapshot. The request must not identify the product currently being viewed.
3. **History contribution** — off by default. Submit price history observations with the minimum useful context.
4. **Pricing fairness study** — separately consented and off by default. Submit the additional matched context required to investigate differential pricing.

The old `contributionEnabled` switch must not silently opt an upgraded user into modes 3 or 4. Existing contributors must be shown the new disclosure and explicitly reconfirm.

### 1.2 Claims and terminology

- Use **“possible differential pricing”** for a matched price difference.
- Use **“individualised pricing”** only when identical observable context has been controlled and the difference persists across independent matched windows.
- Never claim the extension has _proved_ discrimination or retailer intent.
- `isPersonalised` or retailer “for you” metadata is supporting evidence, not ground truth.
- “Three contributors” is a privacy/publication quorum only. It is not an evidence threshold.
- Remove “cross-chain comparison” from store copy until canonical product matching exists.

### 1.3 Privacy boundaries

- A default install performs no requests to Chook Check infrastructure.
- No email address, account identifier, loyalty number, cart, order history, or raw account page content is collected.
- Do not implement deterministic email hashing or account linking.
- The API never stores a raw IP address. Cloudflare’s role as network processor must still be disclosed.
- Server-side raw observations have a documented retention period. Proposed initial value: 180 days.
- Quorum-filtered daily aggregates may be retained longer. Proposed initial value: three years.
- Exact product-page URLs remain local and are never contributed.

### 1.4 Observer-effect boundary

Perfect invisibility cannot be promised. The public extension will minimise observable effects and measure the remaining observer effect:

- The normal collector is read-only and runs in an isolated content-script world.
- It creates no DOM nodes, page attributes, custom page events, page-world globals, or extension-origin resource URLs.
- Primary UI lives in the extension popup/dashboard. An inline overlay is optional and is treated as a detectable instrument mode.
- When inline UI is enabled, capture the price before insertion and separately record any post-insertion change.

---

## 2. Target architecture

```text
Retailer page
  |
  | read-only isolated content script
  v
Local observation normalizer
  |                    \
  |                     \ explicit opt-in only
  v                      v
IndexedDB history       Background submission queue
  |                      |
  v                      v
Popup/dashboard          Chook Check API v2
                             |
                             +-- raw matched observations (180 days)
                             +-- quorum-filtered daily aggregates
                             +-- versioned bulk snapshot

Bulk aggregate snapshot -----------------> Extension snapshot cache
                                            |
                                            v
                                  Local comparison with current price
```

The extension should perform the user-specific comparison locally. The server publishes cohorts and aggregates, not a user’s browsing history back to the extension.

---

## 3. Phase 0 — Freeze release claims and establish a green baseline

**Outcome:** Both repositories have reproducible, passing CI before architectural changes begin.

### Task 0.1: Mark current store material as pre-release

**Extension files:**

- Modify: `README.md`
- Modify: `PRIVACY.md`
- Review/update: `docs/store-listing.md`

- [ ] State that community comparison and differential-pricing detection are experimental and not ready for store submission.
- [ ] Remove “nothing is sent anywhere” until the default network behavior has been fixed.
- [ ] Remove claims that browser sharing defaults on; the actual default is off.
- [ ] Remove claims that account linking works or will use a hashed email.
- [ ] Correct the GitHub link in `components/settings/AboutSection.tsx`.
- [ ] Do not publish the store-listing draft as authoritative during this phase.

### Task 0.2: Fix extension quality gates

**Extension files:**

- Modify: `lib/settings.ts`
- Modify: `components/popup/PopupFooter.tsx`
- Modify: `components/settings/DataSummarySection.tsx`
- Modify: affected settings tests
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] Fix the committed ESLint error without weakening the rule.
- [ ] Fix all `tsc --noEmit` failures in application and test code.
- [ ] Resolve the WXT typing gap for Firefox `data_collection_permissions` with a narrow typed extension or supported dependency upgrade; do not remove the valid manifest field just to satisfy TypeScript.
- [ ] Add `"typecheck": "tsc --noEmit"`.
- [ ] Run lint, typecheck, tests, Chrome build, and Firefox build in CI.
- [ ] Stop fixture parsing from attempting live third-party resource loads during unit tests.

### Task 0.3: Establish API quality gates

**API files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] Perform a clean `npm ci` and record the working Node version.
- [ ] Add `typecheck`, `lint`, and formatting checks.
- [ ] Require tests and typecheck before tagged deployment.
- [ ] Add a migration-application test against a clean local D1 database.
- [ ] Add dependency update automation with review, not automatic production deployment.

**Phase 0 acceptance criteria:**

- [ ] Both worktrees pass their documented CI commands from a clean checkout.
- [ ] There are no untracked/generated files required to build or test.
- [ ] Store copy no longer claims unimplemented functionality.

---

## 4. Phase 1 — Enforce the privacy contract in the extension

**Outcome:** Default local history produces zero requests to Chook Check and the settings model accurately represents every network action.

### Task 1.1: Replace the settings model

**Extension files:**

- Modify: `lib/types.ts`
- Modify: `lib/db.ts`
- Modify: `lib/store.ts`
- Modify: `lib/settings.ts`
- Modify: `components/settings/ContributionSection.tsx`
- Modify: settings and migration tests

Add settings equivalent to:

```typescript
interface PrivacyModes {
  communityDownloadsEnabled: boolean;
  historyContributionEnabled: boolean;
  fairnessStudyEnabled: boolean;
  inlineOverlayEnabled: boolean;
}
```

- [ ] Add a Dexie migration; never mutate an already released schema version.
- [ ] Migrate `contributionEnabled: false` to all new modes off.
- [ ] Migrate `contributionEnabled: true` to a `reconsentRequired` state with submissions paused.
- [ ] Retain the legacy contributor ID only long enough to offer legacy server deletion.
- [ ] Present the exact required and optional fields before each opt-in action.
- [ ] Describe the contributor ID as pseudonymous, not anonymous or “not linked in any way.”
- [ ] Record consent text/version as well as the setting change timestamp.

### Task 1.2: Add a central network policy

**Extension files:**

- Create: `lib/network-policy.ts`
- Modify: `entrypoints/background.ts`
- Modify: `lib/api.ts`
- Create: `test/lib/network-policy.test.ts`

- [ ] Route every Chook Check API call through the background service worker and network policy.
- [ ] Deny community snapshot downloads unless `communityDownloadsEnabled` is true.
- [ ] Deny submissions unless the corresponding contribution mode is true and consent version is current.
- [ ] Deny direct per-product lookups unless initiated by an explicit user action with a disclosure.
- [ ] Remove the current automatic community request on panel expansion.
- [ ] Make denial fail closed and local history continue functioning.
- [ ] Test that browsing, opening the popup, dashboard navigation, and local history use cause zero `fetch` calls in default mode.

### Task 1.3: Implement Firefox data-collection permission handling

**Extension files:**

- Create: `lib/firefox-data-consent.ts`
- Modify: `wxt.config.ts`
- Modify: settings components
- Add browser-specific tests

- [ ] Raise the Firefox desktop minimum to 140 unless a complete older-version custom consent flow is deliberately retained.
- [ ] On Firefox, request optional data permissions from a user-activated settings event before enabling the corresponding network mode.
- [ ] Map fairness/history fields to `websiteContent`, `browsingActivity`, `locationInfo`, and `technicalAndInteraction` conservatively.
- [ ] Check current grants before every transition from off to on.
- [ ] If permission is denied or later revoked, disable the affected mode immediately without deleting local history.
- [ ] Keep `required: ["none"]` only if no network data collection is required for core local operation.

### Task 1.4: Redesign deletion and retention controls

**Extension files:**

- Modify: `lib/settings.ts`
- Modify: `components/settings/DataManagementSection.tsx`
- Modify: `components/settings/SharingLogSection.tsx`
- Add deletion-flow tests

- [ ] Split actions into “clear price history,” “clear logs and consent history,” “delete server contributions,” and “reset Chook Check.”
- [ ] For full reset, delete server data first and clear the deletion credential only after confirmed success.
- [ ] If the request fails, create a local `pendingServerDeletion` record and retry without further submissions.
- [ ] Allow the user to retry or export the deletion recovery code.
- [ ] Make the UI clear that uninstalling/clearing browser storage first can remove the only server-deletion credential.
- [ ] Verify that “delete all local data” actually clears all selected Dexie tables.

**Phase 1 acceptance criteria:**

- [ ] Default mode passes an automated “no Chook network” invariant test.
- [ ] Every network mode has independent, versioned consent.
- [ ] Firefox grants are enforced in code, not just declared in the manifest.
- [ ] A failed server deletion cannot silently strand data while erasing its credential.

---

## 5. Phase 2 — Build a silent, low-observability collector

**Outcome:** Retailer page scripts have no deterministic Chook Check marker before the price is captured.

### Task 2.1: Remove page-visible signals from normal collection

**Extension files:**

- Modify: `entrypoints/overlay.content.ts`
- Modify: `entrypoints/woolworths.content.ts`
- Modify: `entrypoints/coles.content.ts`
- Modify: `lib/navigation.ts`
- Modify: `wxt.config.ts`

- [ ] Remove `#chook-check-overlay` from default operation.
- [ ] Remove the `chook-check:url-change` DOM event.
- [ ] Replace page-event navigation signaling with an isolated-world URL poll and DOM observation that communicates only through extension messaging.
- [ ] Do not execute collection code in the page `MAIN` world.
- [ ] Keep `web_accessible_resources` empty.
- [ ] Do not place `chrome-extension://` or `moz-extension://` URLs in retailer DOM.
- [ ] Avoid changing retailer DOM properties, page history methods, network APIs, globals, storage, cookies, or headers.
- [ ] Allowlist product, search, and approved category routes; return immediately on cart, checkout, account, order-history, payment, and loyalty-management routes.
- [ ] Add tests proving sensitive routes produce no observation or diagnostic payload.

### Task 2.2: Move primary UI to extension-owned surfaces

**Extension files:**

- Modify: popup components
- Modify: `entrypoints/popup/App.tsx`
- Modify: `entrypoints/background.ts`
- Optionally create a side-panel entrypoint after popup parity exists

- [ ] Maintain an ephemeral `tabId -> productId` map in the background from collector messages.
- [ ] Show the active product’s history and aggregate comparison in the toolbar popup.
- [ ] Keep the dashboard as the full historical view.
- [ ] Evaluate a Chrome side panel / Firefox sidebar only after popup functionality is complete and without widening permissions unnecessarily.
- [ ] Ensure closing the UI has no effect on collection.

### Task 2.3: Retain an optional instrumented overlay

**Extension files:**

- Refactor: `entrypoints/overlay.content.ts`
- Modify: settings UI
- Add observer-effect tests

- [ ] Inline UI must be a separate opt-in setting.
- [ ] Capture and persist a `pre_ui` observation before inserting any node.
- [ ] Insert the overlay only in response to extension UI/user activation.
- [ ] Treat closed shadow roots or random element names as defence in depth only; do not claim they make the overlay undetectable.
- [ ] Observe the displayed price after insertion and record `post_ui` only when it changes.
- [ ] Never overwrite `pre_ui`; link both observations with a local comparison ID.
- [ ] Show the user when a price changed after Chook UI appeared.

### Task 2.4: Add a hostile-page detectability test

**Extension files:**

- Create: `test/e2e/detectability.test.ts`
- Create: a local hostile-page fixture

- [ ] The fixture watches DOM mutations, known custom events, extension-origin URLs, page globals, and patched page APIs.
- [ ] Load the production extension in a real browser test.
- [ ] Assert that silent collection leaves none of those deterministic markers.
- [ ] Assert that optional inline UI is detectable and that `pre_ui` capture predates it.
- [ ] Add a manifest assertion that no web-accessible resources are emitted.

**Phase 2 acceptance criteria:**

- [ ] Silent collection adds no nodes and emits no page-observable named signal.
- [ ] Popup/dashboard functionality replaces the always-on overlay.
- [ ] Optional inline UI preserves before/after evidence.

---

## 6. Phase 3 — Observation schema v2 and scraper resilience

**Outcome:** Observations contain enough normalized context to separate price history from fairness-study evidence.

### Task 3.1: Define the shared v2 contract

**Extension files:** `lib/types.ts`, new contract tests
**API files:** `src/lib/types.ts`, `src/lib/schemas.ts`, contract tests

Define an observation with at least:

```text
schemaVersion, clientObservationId
productId, storeChain, gtin, productName, brand, category
currentPriceCents, regularPriceCents, unitPriceCents, unitMeasure
offerType, offerTextNormalized, offerId, requiredQuantity
sourceSurface, extractionSource, scraperVersion
instrumentMode, capturePhase
storeId, coarseRegion, fulfilmentMode
authState, loyaltyState
clientObservedAt
```

- [ ] Use enums for controlled fields; preserve unknown explicitly rather than guessing.
- [ ] `sourceSurface`: product page, search result, category tile, recommendation, personalised placement, or unknown.
- [ ] `extractionSource`: JSON-LD, retailer hydration state, DOM, or unknown.
- [ ] `authState`: guest, signed-in, or unknown; never include username/email.
- [ ] `loyaltyState`: member-eligible, non-member, or unknown; never include a loyalty identifier.
- [ ] Store/region context is mandatory for fairness-study eligibility but optional for history contribution.
- [ ] Do not submit `pageUrl`.
- [ ] Version the HTTP contract under `/api/v2`.
- [ ] Maintain a shared JSON fixture suite so both repositories validate identical accepted/rejected payloads.

### Task 3.2: Migrate local observations safely

**Extension files:**

- Modify: `lib/db.ts`
- Modify: `lib/store.ts`
- Modify: history/export code and tests

- [ ] Add a new Dexie schema version.
- [ ] Preserve legacy history for the user.
- [ ] Mark migrated legacy rows `schemaVersion: 1`, `sourceSurface: unknown`, and ineligible for fairness analysis.
- [ ] Do not invent missing context during migration.
- [ ] Include schema version and eligibility in JSON export.

### Task 3.3: Harden structured-data parsing

**Extension files:**

- Modify: `lib/scraper.ts`
- Modify: `lib/scrapers/woolworths.ts`
- Modify: `lib/scrapers/coles.ts`
- Modify/add fixtures and tests

- [ ] Parse JSON-LD objects, arrays, and `@graph` structures.
- [ ] Accept valid numeric price strings as well as numbers.
- [ ] Support single and array `offers` forms defensively.
- [ ] Normalize GTIN variants without treating them as retailer SKU.
- [ ] Use retailer hydration state only through small, tested extraction functions.
- [ ] Keep DOM selectors as a final fallback and record which fallback succeeded.
- [ ] Reject impossible values instead of storing partial false certainty.

### Task 3.4: Observe price and context changes, not merely URLs

**Extension files:**

- Modify both retailer content scripts
- Create: `lib/observation-fingerprint.ts`
- Add mutation and SPA tests

- [ ] Watch the smallest stable price/context subtree rather than all of `document.body` where possible.
- [ ] Debounce until price and product identity are stable.
- [ ] Replace SKU-only session suppression with a fingerprint containing product, price, offer, store/region, fulfilment, auth state, source, and capture phase.
- [ ] Record a new observation when store, fulfilment, login state, offer eligibility, or displayed price changes without navigation.
- [ ] Prevent duplicate storms using the fingerprint and a bounded time window.
- [ ] Preserve distinct before/after prices on the same day.

### Task 3.5: Add scraper health monitoring

**Extension/API files:** new health fixtures/reporting as appropriate

- [ ] Date and annotate every retailer fixture with URL class, capture mode, and expected fields.
- [ ] Add failure-rate counters stored locally; no automatic telemetry in local-only mode.
- [ ] Let users export a redacted scraper diagnostic that contains selector/extraction outcomes but no page HTML, URL query, account data, or cookies.
- [ ] Establish a manual weekly live-site compatibility checklist for guest product and search pages.
- [ ] Require fresh fixtures before a public release when retailer markup has changed.

**Phase 3 acceptance criteria:**

- [ ] Store/login/fulfilment price changes are captured without a URL change.
- [ ] Search and recommendation observations are labeled instead of being treated as direct product visits.
- [ ] Legacy observations cannot enter fairness analysis.
- [ ] Both repositories agree on the v2 contract.

---

## 7. Phase 4 — API v2 identity, deletion, privacy, and integrity

**Outcome:** Knowing a contributor UUID is no longer sufficient to submit or delete their data, raw IPs are not stored, and malformed product identity cannot pollute aggregates.

### Task 4.1: Add authenticated pseudonymous installations

**API files:**

- Add a D1 migration for `installations`
- Create: `src/routes/installations.ts`
- Create: `src/middleware/authenticate-installation.ts`
- Modify: API types and tests

**Extension files:**

- Create: `lib/contributor-identity.ts`
- Modify: settings/database/submission code

- [ ] `POST /api/v2/installations` returns a random contributor ID, submission token, and separate deletion token.
- [ ] Store only token hashes/HMACs server-side.
- [ ] Never put a deletion secret in a URL.
- [ ] Authenticate submissions with the submission token.
- [ ] Authenticate `DELETE /api/v2/me` with the deletion token.
- [ ] Do not log authorization headers or returned secrets.
- [ ] Store credentials locally and exclude them from normal price-data exports.
- [ ] Offer a deliberate recovery-code export for server deletion.
- [ ] Document that this prevents contributor spoofing but does not by itself prevent one attacker registering many installations.

### Task 4.2: Add schema and cross-field validation

**API files:**

- Modify: `src/lib/schemas.ts`
- Modify: `src/routes/observations.ts`
- Modify: DB queries/migrations and tests

- [ ] Enforce `productId` prefix matches `storeChain`.
- [ ] Enforce retailer SKU formats and normalize them in one function.
- [ ] Validate price relationships: regular price cannot be below current price unless semantics explicitly allow it.
- [ ] Bound strings, batch size, total request body size, timestamps, and clock skew.
- [ ] Add server `received_at` and retain client time separately.
- [ ] Add unique `(contributor_id, client_observation_id)` idempotency.
- [ ] Reject unknown schema versions rather than partially accepting them.
- [ ] Stop choosing public product name/brand from whichever client row happens to be latest; maintain canonical metadata with provenance and conservative update rules.
- [ ] Remove the test that accepts a Woolworths product ID with a Coles chain and replace it with a rejection test.

### Task 4.3: Replace raw-IP rate-limit persistence

**API files:**

- Modify: `src/middleware/rate-limit.ts`
- Modify: `src/cron.ts`
- Add migration and privacy tests

- [ ] Prefer Cloudflare edge rate-limiting rules where operationally available.
- [ ] If application storage is required, store only a rotating HMAC of IP plus endpoint/window using a Worker secret.
- [ ] Rotate the HMAC namespace at least daily and expire rows promptly.
- [ ] Ensure error logs redact URL credentials, tokens, payloads, and request headers.
- [ ] Update privacy copy to disclose Cloudflare processing even though the application stores no raw IP.

### Task 4.4: Reduce Sybil and repeated-observation influence

**API files:** aggregation eligibility and abuse tests

- [ ] Give each contributor at most one effective vote per matched cohort; use their latest eligible observation.
- [ ] Do not count newly created identities toward a high-confidence signal immediately.
- [ ] Track non-identifying quality signals such as installation age, valid-observation span, impossible context switching, and rejection rate.
- [ ] Quarantine rather than delete suspicious observations so thresholds can be audited.
- [ ] Cap influence without claiming Sybil attacks are solved.
- [ ] Keep privacy quorum, publication threshold, and evidence threshold as separate configuration values.

### Task 4.5: Define retention and deletion propagation

**API files:** scheduled jobs, migrations, documentation, tests

- [ ] Delete raw observations after the chosen raw retention period.
- [ ] Recompute recent aggregates after contributor deletion.
- [ ] Delete installation/token records on authenticated deletion.
- [ ] State how older irreversible quorum aggregates behave after raw source expiry.
- [ ] Test that deleted contributors no longer affect any recomputable cohort or snapshot.
- [ ] Publish current retention values in the API and extension privacy documents.

### Task 4.6: Review CORS and the public API surface

**API files:** `src/index.ts`, route tests, deployment configuration

- [ ] Treat CORS as a browser boundary, never as authentication or anti-abuse protection.
- [ ] Keep aggregate read endpoints public only when every response is quorum-qualified.
- [ ] Require installation authentication on all write and deletion endpoints regardless of origin.
- [ ] Restrict allowed extension/web origins where practical, while accounting for Firefox extension-origin behavior.
- [ ] Test preflight, unsupported methods, content types, and browser-extension origins.
- [ ] Publish only versioned routes intended for external use; do not expose diagnostic/admin routes publicly.

**Phase 4 acceptance criteria:**

- [ ] Contributor UUID alone cannot submit or delete data.
- [ ] No raw IP exists in D1 tables or application logs.
- [ ] Cross-chain identity mismatches are rejected.
- [ ] Duplicate/repeated visits cannot give one contributor extra cohort weight.
- [ ] Public CORS policy does not expose an unauthenticated mutation endpoint.

---

## 8. Phase 5 — Separate history aggregation from differential-pricing analysis

**Outcome:** The API no longer labels a 30-day mixed median as “current,” and normal sale cycles cannot produce a fairness signal.

### Task 5.1: Build canonical history aggregates

**API files:**

- Add migration for daily aggregate tables
- Create: `src/lib/history-aggregation.ts`
- Create/update history routes and tests

- [ ] Build daily price history from one effective observation per contributor/context/day.
- [ ] Publish median, min/max, mode, contributor count, sample count, offer breakdown, and context coverage.
- [ ] Name fields accurately: `periodMedianCents`, `latestBucketMedianCents`, etc.
- [ ] Never call a 30-day median “current.”
- [ ] Keep price history useful even when fairness-study context is absent.
- [ ] Suppress public buckets below privacy quorum.

### Task 5.2: Define a matched cohort key

Create a deterministic cohort from:

```text
productId
storeId or approved coarse region
fulfilmentMode
authState
loyaltyState / offer eligibility
offerId or normalized offer type
sourceSurface
instrumentMode
server time bucket
scraper/schema version compatibility
```

- [ ] Missing required dimensions make an observation fairness-ineligible, not silently equivalent.
- [ ] Start with a narrow configurable server-time window; never compare observations across different calendar days for an individualised-pricing signal.
- [ ] Simulate 30-minute, two-hour, six-hour, and daily windows using seeded data before choosing production defaults.
- [ ] Keep different instrument modes separate when testing whether retailers react to visible UI.

### Task 5.3: Implement evidence classifications

**API files:**

- Create: `src/lib/differential-analysis.ts`
- Create: `/api/v2/signals` or snapshot equivalent
- Add comprehensive simulation tests

Return one of:

- `insufficient_data`
- `no_difference_observed`
- `contextual_difference`
- `possible_differential_pricing`
- `possible_observer_effect`

- [ ] Use one vote per contributor per cohort.
- [ ] Proposed initial publication threshold: at least five eligible contributors.
- [ ] Proposed initial signal threshold: at least ten eligible contributors, at least three contributors in each price group, a meaningful effect size, and persistence in two independent time buckets.
- [ ] Treat thresholds as configuration backed by simulations, not magic constants.
- [ ] Report counts, observed window, effect size, excluded observations, and unresolved confounders.
- [ ] Downgrade to `contextual_difference` when prices align with store, region, fulfilment, membership, offer, surface, or instrument mode.
- [ ] Never infer retailer intent.

### Task 5.4: Perform the user comparison locally

**Extension files:**

- Create: `lib/local-comparison.ts`
- Modify popup/dashboard UI and tests

- [ ] Compare the current local observation to a matching downloaded cohort.
- [ ] Show “not comparable” when required context is missing.
- [ ] Explain which dimensions matched and which did not.
- [ ] Distinguish ordinary historical low/high from same-context community difference.
- [ ] Display exact sample window and contributor count.
- [ ] Avoid alarmist badges for low-confidence or single-window differences.

**Phase 5 acceptance criteria:**

- [ ] A seeded weekly-special price change produces history but no differential-pricing signal.
- [ ] Region, store, fulfilment, membership, and promotion confounders are separated.
- [ ] The same contributor cannot move a cohort median through repeated visits.
- [ ] UI language matches evidence classification.

---

## 9. Phase 6 — Privacy-preserving community reads

**Outcome:** Viewing a product does not send that product ID to Chook Check infrastructure in normal community mode.

### Task 6.1: Publish bulk aggregate snapshots

**API files:**

- Create scheduled snapshot builder
- Create snapshot manifest route/storage
- Add snapshot schema, integrity, size, and quorum tests

- [ ] Generate versioned, compressed snapshots containing only quorum-qualified aggregates and signals.
- [ ] Benchmark one national snapshot versus chain/region segments.
- [ ] Prefer a national download if size is practical; otherwise disclose that requesting a region segment reveals that coarse region.
- [ ] Include schema version, generated time, expiry, hash, and compatible extension versions.
- [ ] Never include contributor IDs or raw observations.
- [ ] Make snapshot generation deterministic and reproducible from eligible rows.

### Task 6.2: Cache and query snapshots locally

**Extension files:**

- Create: `lib/community-snapshot.ts`
- Add IndexedDB/cache schema
- Modify comparison UI and tests

- [ ] Download only after community-download consent.
- [ ] Cache with an expiry and retain the last valid snapshot for offline use.
- [ ] Verify hash/schema before use.
- [ ] Query by product and context locally.
- [ ] Display snapshot age.
- [ ] On failure, keep local history available and do not silently fall back to a per-product request.

### Task 6.3: Keep direct lookup as explicit fallback only

- [ ] If direct lookup remains, label the button “Check online now.”
- [ ] Explain that the API will receive the requested product identifier and normal network metadata.
- [ ] Do not treat contribution consent as consent for direct reads or vice versa.
- [ ] Rate-limit and return only quorum-qualified aggregates.

**Phase 6 acceptance criteria:**

- [ ] Normal community comparison causes no product-specific request.
- [ ] Snapshot content contains no stable contributor identifier.
- [ ] Direct lookup is separate, explicit, and disclosed.

---

## 10. Phase 7 — Measure extension-detection and observer effects

**Outcome:** Chook Check can distinguish a real user-price difference from a price response correlated with its visible UI.

### Task 7.1: Define instrument modes

- `silent_collector`: no page modification.
- `user_activated_inline`: overlay shown after pre-UI capture.
- `clean_control`: independent clean-browser observation where available.

- [ ] Store instrument mode in fairness-study observations.
- [ ] Assign study modes locally using documented randomisation and only for consenting participants.
- [ ] Never use a hidden visible-mode experiment that changes the retailer page without informing the user.
- [ ] Keep instrument modes in separate cohorts until observer-effect analysis explicitly compares them.

### Task 7.2: Detect within-session response

- [ ] Link pre-UI and post-UI observations with a random comparison ID that is not reused across sessions.
- [ ] Record server receipt order and elapsed local time.
- [ ] Flag a possible observer effect when price/offer changes shortly after UI insertion without a context change.
- [ ] Require recurrence across independent sessions/contributors before publishing a signal.

### Task 7.3: Establish independent controls

- [ ] Document a reproducible clean-profile protocol: same SKU, store/region, fulfilment, auth state, narrow time, alternating test order.
- [ ] Keep automated guest-browser baselines separate because retailers may price or block automation differently.
- [ ] Support manual, privacy-reviewed control submissions without requiring screenshots or account details.
- [ ] Treat a control mismatch as evidence requiring investigation, not automatic proof of extension targeting.

### Task 7.4: Publish the research methodology

**Files:**

- Create: `docs/research-methodology.md`
- Link from README, privacy policy, extension UI, and API README

- [ ] Describe cohorts, exclusions, thresholds, observer modes, retention, known confounders, and uncertainty.
- [ ] Version methodology changes and include methodology version in signals/snapshots.
- [ ] Publish synthetic examples for ordinary sale, regional pricing, member offer, possible individualised difference, and possible observer effect.

**Phase 7 acceptance criteria:**

- [ ] Silent and visible observations are never pooled accidentally.
- [ ] A post-overlay change is preserved and visible as evidence.
- [ ] Methodology is understandable and reproducible by an external reviewer.

---

## 11. Phase 8 — Store compliance and public documentation

### Task 8.1: Rewrite the privacy policy from actual behavior

**Extension/API docs:** `PRIVACY.md`, both READMEs, hosted privacy page

- [ ] List local website-content handling even when it is not transmitted.
- [ ] List every submitted field by contribution mode.
- [ ] Describe contributor identifiers as pseudonymous and linkable across submissions.
- [ ] Disclose Cloudflare processing, application logging policy, and retention.
- [ ] Explain snapshot versus direct lookup network behavior.
- [ ] Explain deletion limits after local credentials are lost and after irreversible aggregates are produced.
- [ ] State that no deterministic email/account hashing occurs.
- [ ] Keep documentation generated/checked against a privacy data inventory where practical.

### Task 8.2: Complete Chrome Web Store disclosures

- [ ] Declare website content and browsing activity handling accurately, including local storage.
- [ ] Provide prominent in-product disclosure before each transmission mode.
- [ ] Justify host, storage, alarm, and any active-tab/side-panel permissions.
- [ ] State Limited Use compliance on the hosted policy page.
- [ ] Ensure screenshots and description show functionality that exists in the submitted build.

### Task 8.3: Complete Firefox consent and AMO metadata

- [ ] Ensure manifest data categories match actual transmissions.
- [ ] Exercise install, permission grant, denial, revocation, and upgrade on supported Firefox versions.
- [ ] Confirm no contribution occurs before built-in permission grant.
- [ ] Submit readable source/build instructions that reproduce the packaged extension.

### Task 8.4: Add operational transparency

- [ ] Publish API status and schema/methodology versions.
- [ ] Publish a security contact and vulnerability-reporting process.
- [ ] Document data incidents and material methodology changes.
- [ ] Never call an open-source license a substitute for privacy or security controls.

---

## 12. Phase 9 — Test matrix and adversarial validation

### Required extension tests

- [ ] Default install: no Chook Check network request.
- [ ] Silent collector: no DOM mutation or named page signal.
- [ ] Store/login/fulfilment update without navigation creates a distinct observation.
- [ ] Inline mode captures pre-UI before insertion and preserves post-UI changes.
- [ ] Consent upgrade pauses legacy contributors.
- [ ] Firefox grant/deny/revoke behavior.
- [ ] Snapshot download, validation, cache, expiry, corruption, and offline fallback.
- [ ] Server deletion success, failure, retry, and full local reset.
- [ ] Chrome and Firefox production-package manifest assertions.

### Required API tests

- [ ] Authentication and token separation for submit versus delete.
- [ ] Cross-field product/store validation.
- [ ] Idempotent retry using client observation ID.
- [ ] Request size, timestamp skew, enum, and schema-version rejection.
- [ ] No raw IP persistence.
- [ ] One effective vote per contributor/cohort.
- [ ] Legacy observations excluded from fairness analysis.
- [ ] Retention and deletion recomputation.
- [ ] Deterministic snapshot generation and quorum filtering.

### Required methodology simulations

- [ ] Weekly sale changes across days.
- [ ] Same product, different state/store.
- [ ] Delivery versus pickup.
- [ ] Guest versus member offer.
- [ ] Search tile versus product page.
- [ ] One noisy contributor with many observations.
- [ ] Three fresh Sybil identities.
- [ ] Visible-overlay cohort differs from silent cohort.
- [ ] Genuine same-context price split persisting across windows.
- [ ] Missing-context data never classified as individualised.

### Manual release checks

- [ ] Fresh Chrome profile and fresh Firefox profile.
- [ ] Guest Coles and Woolworths product/search pages.
- [ ] Signed-in checks performed only by a tester using their own account, with no account data included in artifacts.
- [ ] Store and fulfilment switch without URL navigation.
- [ ] Network panel confirms default no Chook requests.
- [ ] Retailer page DOM confirms silent collector adds no nodes.
- [ ] Delete server data, then reset local data.

---

## 13. Deployment and migration sequence

1. **API v2 dark launch**
   - [ ] Deploy new tables/routes without changing v1 responses.
   - [ ] Keep v2 aggregation private until simulations pass.

2. **Extension privacy release**
   - [ ] Ship green CI, default no-network behavior, reconsent migration, silent collector, and corrected documentation.
   - [ ] Do not yet advertise differential pricing.

3. **V2 contribution beta**
   - [ ] Enable installation credentials and v2 submissions for a small explicit beta.
   - [ ] Label v1 observations history-only.

4. **Legacy cleanup**
   - [ ] Offer deletion of legacy contributor data during upgrade.
   - [ ] Stop accepting v1 POSTs after the upgrade window.
   - [ ] Retire unauthenticated legacy deletion only after legacy raw-data retention expires.

5. **Aggregate snapshot beta**
   - [ ] Publish snapshots, measure size/performance, and audit quorum output.

6. **Fairness-study beta**
   - [ ] Enable only with separate consent and published methodology.
   - [ ] Review every initial signal manually for confounders before public display.

7. **Public store submission**
   - [ ] Submit only after all release gates below pass.

Rollback must disable submissions and signals remotely without disabling local history. Remote configuration may disable behavior but must never contain executable code or expand data collection.

---

## 14. Public release gates

The extension is not ready for public submission until all are true:

### Privacy

- [ ] Default mode makes zero requests to Chook Check.
- [ ] Privacy policy matches measured behavior.
- [ ] No raw IP or account identifier is stored by the application.
- [ ] All contribution modes require explicit, versioned consent.
- [ ] Firefox data permissions are requested and enforced correctly.
- [ ] Server deletion is authenticated and resilient to local-reset ordering.

### Measurement validity

- [ ] History and matched differential analysis use separate code paths and names.
- [ ] Context/time confounders are represented and enforced.
- [ ] One contributor has one effective vote per cohort.
- [ ] Observer instrument modes remain separate.
- [ ] Synthetic confounder simulations produce no false individualised-pricing signal.
- [ ] Methodology and uncertainty are public.

### Security and integrity

- [ ] UUID knowledge alone cannot submit or delete data.
- [ ] Product/store mismatches and unknown schemas are rejected.
- [ ] Idempotency and request limits are enforced at the database boundary.
- [ ] Threat model and abuse limitations are documented.

### Quality and operations

- [ ] Lint, typecheck, tests, Chrome build, and Firefox build pass in CI.
- [ ] Current retailer fixtures and manual live checks pass.
- [ ] Store listing, screenshots, permissions, and hosted privacy URL are current.
- [ ] API rollback, retention jobs, snapshot jobs, and deletion have been exercised in staging.
- [ ] No core marketing claim depends on a planned or inert setting.

---

## 15. Explicitly deferred work

These items are valuable but must not block the first honest local-history release:

- Cross-chain home-brand equivalence and product matching beyond exact GTIN.
- Cross-device identity.
- Any collection of supermarket email/account identifiers.
- Strong proof of human uniqueness or complete Sybil resistance.
- Public raw-data access.
- Automated claims about retailer intent or unlawful discrimination.
- Always-on in-page overlay parity across every retailer layout.

Deferral means related claims must also remain absent from store copy and UI.
