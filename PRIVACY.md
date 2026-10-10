# Chook Check Privacy Policy

**Last updated:** 20 July 2026

This policy describes the Chook Check browser extension and its community API. Chook Check is designed to provide useful local price history without requiring an account or sending data to Chook Check by default.

## Summary

- Price observations are stored locally for up to 365 days by default.
- All Chook Check network features and all retailer-page UI are off by default and controlled separately.
- Contribution is pseudonymous, not anonymous. A random install-level contributor ID can link repeated submissions.
- Page URLs, supermarket account identifiers, cart contents, orders, passwords, emails, and loyalty numbers are never uploaded.
- Cloudflare necessarily receives network metadata, including an IP address, when the extension contacts the API. The application does not store a raw IP address against an observation.

## Data stored locally

On approved Woolworths and Coles product, search, browse, and category routes, the extension may store:

- product ID, name, brand, category, and GTIN when available;
- current, regular/“was”, and unit prices;
- normalized offer information and required quantity when available;
- retailer, source surface, extraction source, scraper version, and observation time;
- a random observation ID and whether the capture occurred silently or around a user-enabled inline overlay;
- explicit page-provided context such as sign-in state, loyalty eligibility, fulfilment mode, and selected store, or `unknown` when it cannot be established; and
- the retailer page URL.

When fairness study and the relevant sharing choices are enabled, each new observation also stores a local copy of your selected state, city/region, or store. Later edits do not change that historical context. Uploads still obey your current sharing choices. Local JSON exports include this captured context.

The retailer page URL is used for local history and route validation. It is not included in API schema v2 and is never uploaded. The extension does not copy account names, account IDs, email addresses, loyalty numbers, or credentials when detecting coarse page context.

An open approved page is checked once per minute and when its content changes. Repeated unchanged observations are compacted within each UTC hour; different offer/context values and inline comparison phases remain separate. These checks do not refresh the page or contact Chook Check.

Local price observations are removed after 365 days. Settings, consent events, sharing logs, deletion credentials, and the most recently downloaded community snapshot remain until replaced, cleared, or the extension is reset. Browser uninstall behaviour is controlled by the browser and normally removes extension storage.

## Optional modes

### Community snapshot downloads

When enabled, the extension periodically requests a bulk community snapshot. The request does not contain the current retailer URL or a product ID. The snapshot lists only products observed by at least five contributors in the last seven days, with aggregate fields: product ID, name, brand, retailer, current median, minimum, and maximum price, observation and contributor counts, and promotion frequency. The API and Cloudflare receive ordinary request metadata, including an IP address and user-agent information supplied by the browser.

### Price-history contribution

When enabled, the extension creates a pseudonymous contributor credential and uploads recent observations in batches. Submissions include product/catalogue fields, prices, offers, source surface, extraction source, scraper version, capture time, and a random observation ID. Inline observations remain local unless fairness contribution is enabled with the required context; they are never relabelled as silent history samples. History mode forces fairness-specific context to `unknown` or `null` and does not upload page URLs, store/region context, sign-in state, loyalty eligibility, browser family, or overlay comparison IDs.

### Fairness study

When enabled, submissions contain the history fields plus the context needed to compare like-for-like observations. Depending on the user’s choices and what the retailer page explicitly exposes, this can include:

- a selected store name/ID or coarse state/city/region;
- delivery, pickup, in-store, or unknown fulfilment mode;
- guest, signed-in, or unknown state;
- loyalty-member eligibility, non-member, or unknown state;
- browser family, if its separate toggle is enabled; and
- silent versus user-activated instrument mode and pre/post overlay comparison IDs.

Fairness submissions pause until at least one coarse store or region field is selected. Do not enter a street address, account number, or other personal information into the free-text store or region controls.

### Inline retailer-page UI

When enabled, the chicken badge appears automatically on current and subsequent product pages. Turning the setting off removes existing badges. The extension saves the retailer-provided price before inserting the overlay and samples the price one second afterwards, including unchanged prices, using a random comparison ID. Enabling the overlay does not itself enable community downloads or uploads.

Retailer scripts can observe DOM changes made by the overlay. The silent collector does not modify the page, emit document events or `window.postMessage` messages, or expose web-accessible resources, but Chook Check cannot guarantee that its presence is impossible to infer.

## Pseudonymous credentials

The API issues:

- a random contributor ID;
- a secret submit token; and
- a separate secret deletion token.

The tokens are stored in extension storage. The server stores SHA-256 token hashes rather than the raw tokens. Raw observations contain the contributor ID so duplicate submissions can be rejected, contributions can be deleted during the raw-retention period, and contributor thresholds can be calculated. This makes contributions linkable to the pseudonymous ID even though Chook Check does not know the person’s name.

Chook Check does not hash or link a supermarket login, email, or loyalty account and has no cross-device account-linking feature.

## Server and network processing

The community API runs on Cloudflare Workers with Cloudflare D1. Cloudflare acts as the infrastructure provider and processes network traffic under its own policies. Like any internet service, Cloudflare and the Worker receive the source IP address and request metadata needed to route and protect a request.

The application uses a secret-keyed HMAC of the IP address for public-read and contributor-registration rate limits. It does not write the raw IP address to D1 or attach it to observations. Registration rate-limit rows are retained for up to approximately 26 hours; other rate-limit rows, including contributor-keyed limits, are retained for up to approximately two hours. Infrastructure or security logs controlled by Cloudflare may have different retention.

The API uses no third-party analytics, advertising SDKs, or tracking pixels. Public, thresholded aggregate data is made available to extension users and may be visible to anyone using the public API.

## Server retention and aggregation

- Raw v2 observations, including the pseudonymous contributor ID, are retained for approximately 180 complete days.
- Before eligible raw records expire, a daily aggregate is created only when at least five distinct contributors observed that product that day. It retains product metadata, date, median/minimum/maximum price, and counts—not contributor IDs or individual rows.
- Privacy-thresholded daily aggregates are retained for up to three years. They are kept for future analysis and are not currently published.
- Days below the five-contributor threshold are deleted without creating an aggregate.
- Quarantined outliers are not included in aggregates or the published snapshot.

Because a daily aggregate no longer contains contributor identifiers or individual rows, an individual contribution cannot be located or subtracted from that aggregate after raw records expire.

## Your controls and deletion

The Settings page lets users:

- enable or disable each optional mode independently;
- review the exact disclosure recorded with each mode choice;
- choose fairness-study context;
- view and export local observations;
- clear local price history separately from local consent/sharing logs;
- delete raw server contributions still linked to the install;
- export the deletion recovery credential; and
- reset the extension.

Disabling a mode stops future activity for that mode. It does not automatically delete previously contributed raw observations. A deletion request authenticated with the deletion token removes raw observations still associated with that contributor and disables its credentials. It cannot reverse thresholded daily aggregates that no longer contain contributor-level data.

If a server deletion fails, uploads are paused and the deletion credential is retained for retry. Users should delete server data or export the recovery credential before uninstalling or clearing extension storage. Without the deletion token, the server cannot safely accept a request to delete a pseudonymous contributor’s data.

## Data not collected or uploaded

Chook Check does not collect or upload:

- real name, supermarket username, email address, password, or authentication credential;
- loyalty card/account numbers;
- cart contents, checkout data, payment data, order history, or account pages;
- precise GPS location, street address, or contacts;
- browsing activity outside the declared Woolworths and Coles hosts; or
- the local retailer page URL.

Sensitive retailer routes containing account, login, cart, checkout, order, payment, or loyalty-account paths are explicitly denied before scraping.

## Browser permissions

The extension requests `storage`, `alarms`, and `scripting`, host access for Woolworths and Coles, and host access for the Chook Check API. `scripting` is used for the user-activated overlay. API access is centrally denied unless the corresponding opt-in, a user-requested deletion, or a pending deletion retry permits it.

Firefox 140 and later builds declare Firefox’s built-in data-collection consent categories as optional. The extension requests the categories relevant to a mode when the user enables it and disables the mode if consent is revoked.

## Security and limitations

Transport uses HTTPS in production. Strict request schemas reject unknown fields, including page URLs. Separate submit and deletion tokens reduce the impact of exposing one capability. Public data has contributor thresholds and one-observation-per-contributor/day balancing, but no public system can completely prevent fabricated clients, coordinated submissions, retailer markup changes, or all forms of re-identification from rare context combinations.

See the project’s [Threat Model](docs/THREAT_MODEL.md) and [Measurement Methodology](docs/METHODOLOGY.md) for residual risks and interpretation limits.

## Changes to this policy

Privacy-affecting changes require a new consent version. Existing contribution modes are paused when re-consent is required. The current disclosure text and consent version are stored locally in the consent log.

## Contact and open source

- Extension source: <https://github.com/Nevenit/Chook-Check>
- API source: <https://github.com/Nevenit/chook-check-api>
- Issues: <https://github.com/Nevenit/Chook-Check/issues>
- Email: <Nevenit@outlook.com>

The extension is MIT licensed. The API is AGPL-3.0 licensed.
