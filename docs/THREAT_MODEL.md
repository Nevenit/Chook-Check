# Chook Check Threat Model

**Reviewed:** 20 July 2026

## Scope and security goals

This model covers the browser extension, its Cloudflare Worker/D1 API, and the data flow between them. The primary goals are:

1. local price history must work without contacting Chook Check;
2. uploads and community downloads require explicit, separate consent;
3. retailer pages must not receive a deliberate Chook Check identifier from the silent collector;
4. sensitive retailer account/cart/order routes must not be scraped;
5. the public API must not expose contributor-level observations;
6. submit and deletion authority must not rely on a guessable contributor ID; and
7. statistical output must be presented as evidence, not causal proof.

## Assets

- Local observations and retailer page URLs.
- Optional coarse context such as state, city/region, store, sign-in, loyalty eligibility, and fulfilment.
- Pseudonymous contributor ID, submit token, and deletion token.
- Raw contributed observations in D1.
- Thresholded daily aggregates, which are retained but not published.
- The integrity of the published community snapshot (current prices and counts), and of differential-pricing analysis if it is published later.

## Trust boundaries

```text
Retailer page
    │ isolated-world DOM reads
    ▼
Silent collector ── extension messages ──► Background policy boundary
                                               │ explicit opt-in + HTTPS
Extension IndexedDB ◄──────────────────────────┤
                                               ▼
                                      Cloudflare Worker / D1
                                               │ thresholded output
                                               ▼
                                      Extension users / API clients
```

Retailer page content is untrusted input. Extension UI and collectors cannot directly call the Chook Check API; the background worker applies the network policy. API clients are untrusted even when they possess a valid submit token.

## Threats and controls

### Retailer detects Chook Check and changes a price

Possible signals include injected DOM, document events, `window.postMessage`, predictable extension resource probes, stable page-visible attributes, or timing/fingerprinting side channels.

Controls:

- Silent collectors run as minimal manifest scripts in an isolated world.
- They do not modify the page, dispatch page events, call `window.postMessage`, or expose web-accessible resources.
- CI audits production manifests and collector bundles for those regressions.
- The inline overlay is a separate runtime script, off by default. Enabling its setting authorizes automatic insertion on current and subsequent product pages; disabling it removes existing badges. Silent collection is paused through an internal extension message before insertion and stays paused until navigation/reload, including if injection fails.
- Pre-UI persistence must succeed before insertion. A fixed one-second post-UI sample includes unchanged prices; incomplete, ambiguous, stale, or context-mismatched pairs do not support observer-effect output.
- User-entered region/store choices are snapshotted only for captures with the corresponding fairness sharing enabled, then filtered again by current sharing choices before upload. Current settings never supply missing historical context.
- Context-aware UTC-hour deduplication preserves independent samples without mutating previously submitted observations. Older collection versions are excluded from fairness analysis rather than assigning them reconstructed context.
- The baseline price is persisted before the overlay makes a page-visible change; changed post-overlay prices use a random comparison ID.

Residual risk: the overlay is deliberately visible. Perfect non-detection cannot be guaranteed against browser vulnerabilities, future platform changes, sophisticated side channels, or retailer experiments unrelated to the extension. A retailer may also serve different data before any extension code runs.

### Over-collection from retailer pages

Controls:

- Host permissions are limited to Woolworths and Coles.
- An allowlist restricts collection to product, search, browse, and category routes.
- Account, login, cart, checkout, order, payment, and loyalty-account route fragments are denied first.
- Context detection recognizes only explicit boolean/mode/store keys and does not copy surrounding JSON or account identifiers.
- Page URLs remain local and are absent from the strict API schema.

Residual risk: retailer markup can change, and product pages may contain unrelated embedded data. Scraper changes require fixture review and tests.

### Network activity occurs without consent

Controls:

- Community downloads, history uploads, fairness uploads, and inline UI have separate settings and versioned disclosures. Submission rechecks consent before each batch and serializes overlapping submission runs; an already-sent request cannot be recalled by opt-out.
- Default settings deny every Chook Check network action.
- All API access is centralized in the background worker and guarded by a network-policy function with unit tests.
- Legacy contribution settings migrate to a paused, re-consent-required state.
- Firefox mode-specific data permissions are checked when enabling a mode and after revocation.
- Deletion is permitted only after direct user action or as a retry of an already pending deletion.

Residual risk: the retailer site itself continues its normal network activity, which Chook Check does not control.

### Contributor impersonation or unauthorized deletion

Controls:

- Registration returns independent random submit and deletion tokens.
- The API stores token hashes, not raw tokens.
- Submissions and deletions use bearer-token authentication.
- Legacy UUID-only endpoints return HTTP 410.
- The deletion recovery token can be exported before clearing extension storage.

Residual risk: malware or another actor with access to the browser profile may steal local tokens. A lost deletion token cannot be recovered from its server-side hash.

### Public-data poisoning and Sybil contributors

Controls:

- Registrations are limited per secret-HMAC IP key.
- Authenticated submissions are rate limited per contributor.
- Input is strict, bounded, versioned, and chain/product-prefix checked.
- Duplicate observation IDs are rejected per contributor.
- Extreme same-product/day/offer outliers are quarantined.
- Public output requires five contributors and balances to one observation per contributor per day.
- Differential signals use higher thresholds and repeated time buckets.

Residual risk: registration limits increase the cost of Sybil attacks but do not eliminate them. Coordinated clients, residential proxies, plausible fabricated prices, or compromised tokens can still bias results. Aggregates should not be treated as an authoritative retailer feed.

### Re-identification from contributed context

Controls:

- The project describes identifiers as pseudonymous, not anonymous.
- History mode strips all fairness context.
- Fairness location is user-selected and coarse; browser sharing is separate.
- Precise location, account IDs, loyalty numbers, URLs, and full user-agent strings are excluded.
- Raw observations expire after approximately 180 days.
- Long-term daily aggregates require five contributors and contain no contributor IDs.

Residual risk: rare combinations of store, region, time, product, and price may still be identifying to an actor with outside information. Users should avoid entering precise or personal text.

### API or infrastructure compromise

Controls:

- HTTPS transport, environment secrets, least-data schemas, token hashing, and short-lived rate-limit rows reduce exposure.
- Raw IP addresses are not stored in D1 by application code.
- CI runs lint, type checking, formatting checks, migrations, and integration tests before tagged deployment.
- The API is open source under AGPL-3.0.

Residual risk: Cloudflare processes IP addresses and may retain infrastructure/security logs under its policies. An API operator or database compromise can access raw observations and pseudonymous contributor links during the 180-day raw-retention period.

### Accidental loss of deletion capability

Controls:

- Reset attempts server deletion before clearing local credentials.
- Failed deletion pauses uploads and retains a pending-deletion credential.
- The settings screen supports exporting a deletion recovery file and warns before uninstall/clear.

Residual risk: uninstalling or clearing extension storage first can destroy the only raw deletion token. Thresholded, non-attributable daily aggregates cannot be reversed after raw records expire.

## Release checks

- Run unit/integration tests in both repositories.
- Build Chrome MV3 and Firefox MV3.
- Run `npm run audit:build` and inspect both manifests.
- Verify no web-accessible resources and only the two silent manifest collectors.
- Re-test current sanitized retailer fixtures and live approved routes.
- Review permission and consent text whenever fields, modes, or retention change.
- Apply D1 migrations and configure `RATE_LIMIT_SECRET` before deploying API code.
