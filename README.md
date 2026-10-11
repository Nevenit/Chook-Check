# Chook Check

Chook Check is a privacy-first browser extension for recording prices while you browse Woolworths and Coles, viewing local price history, and—only with separate opt-ins—contributing to a community dataset designed to look for unexplained price differences between matched users. That analysis is not published yet.

> “Just doing a quick chook check before heading to Woolies.”

## Project status

The project is in active pre-release development. An early version is listed on [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/chook-check/); it is not yet on the Chrome Web Store. The local history workflow, versioned contribution API, privacy controls, public aggregation thresholds, and Chrome/Firefox MV3 builds are implemented. Retailer DOM changes and production deployment still require ongoing QA before a store release.

Chook Check can surface evidence worth investigating; it cannot, by itself, prove that a retailer intentionally personalised a price. See [Measurement methodology](docs/METHODOLOGY.md).

## Privacy model

Local collection is always available and makes **zero requests to the Chook Check service**. The Woolworths or Coles page continues to make its own normal retailer requests. Chook Check stores observations in the browser and enables every networked or page-visible feature separately.

| Mode                         | Default | Behaviour                                                                                                                                                                |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local price history          | On      | Reads approved product/search/category pages and stores observations locally for up to 365 days.                                                                         |
| Community snapshot downloads | Off     | Downloads one bulk, privacy-thresholded community snapshot. It does not send the active page or product ID.                                                              |
| Price-history contribution   | Off     | Uploads pseudonymous product, price, offer, extraction, surface, and time fields. It excludes page URLs and fairness context.                                            |
| Fairness study               | Off     | Uploads the history fields plus selected coarse store/region context, fulfilment mode, sign-in state, loyalty eligibility, optional browser family, and instrument mode. |
| Inline retailer-page UI      | Off     | Automatically shows the chicken badge on product pages while enabled. It does not itself enable network access.                                                          |

Contribution uses a random install-level identifier and separate secret submit and deletion tokens. It is **pseudonymous, not anonymous**: repeated submissions can be linked to that random identifier. Chook Check does not collect a supermarket username, email, password, loyalty number, cart, or order history.

Read the full [Privacy Policy](PRIVACY.md) and [Threat Model](docs/THREAT_MODEL.md).

## Can retailers detect the extension?

Ordinary website code does not have a general browser API that lists every installed extension. Extensions can nevertheless make themselves identifiable by changing the page, emitting DOM events or `postMessage` messages, exposing predictable web-accessible resources, or placing stable identifiers in page-visible markup.

The always-on Chook Check collectors therefore:

- run in the browser’s isolated extension world;
- do not insert or alter page DOM;
- do not emit document events or `window.postMessage` startup signals;
- do not expose web-accessible resources; and
- avoid account, cart, checkout, login, order, payment, and loyalty-account routes.

The build audit fails CI if those collector guarantees regress. The optional inline overlay is inherently page-visible and can be detected by retailer scripts, so it is off by default. Once enabled in settings, it appears automatically on product pages after the original price is captured; disabling it removes existing badges. Chook Check cannot promise perfect invisibility against browser vulnerabilities, sophisticated timing/fingerprinting techniques, future browser changes, or a retailer that changes content for unrelated reasons.

## What is measured

Each local observation records a product identifier, name and available catalogue metadata, current/regular/unit price, offer information, source surface, extraction method, scraper version, time, and the page URL. The page URL remains local and is never part of an API submission.

The collector conservatively records `guest`/`signed_in`, loyalty eligibility, fulfilment mode, and selected store only when the page exposes an explicit matching state. Missing or ambiguous values stay `unknown`; account identifiers are not copied. These context fields are uploaded only in fairness-study mode and subject to its sharing controls.

Community output is gated at five contributors in the last seven days. The published snapshot contains, for each qualifying product, the current median, minimum, and maximum price, observation and contributor counts, and promotion frequency. The API also contains tested analysis for possible differential pricing (at least ten contributors, at least three in each price group, strict matching on known context, and repetition in at least two time buckets), but it does not publish results yet. Any such signal would be evidence for review, not proof.

## Permissions

- `storage`: local observations, settings, consent history, deletion credentials, and downloaded snapshots.
- `alarms`: local retention, opted-in batch uploads, and opted-in snapshot refreshes.
- `scripting`: injects the optional overlay on product pages only while its setting is enabled.
- Woolworths and Coles host access: reads approved product, search, browse, and category pages.
- Chook Check API host access: used only by an enabled network mode or a user-requested server deletion.

Firefox builds require Firefox 140 or newer and declare Firefox’s built-in optional data-collection permissions. A relevant Firefox permission is requested when a user enables a mode and the mode is disabled if that permission is later revoked.

## Manual installation

Requires Node.js 24 (see `.nvmrc`).

### Chrome, Edge, or Brave

1. Run `npm install && npm run build`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select `.output/chrome-mv3`.

### Firefox 140+

1. Run `npm install && npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `.output/firefox-mv3/manifest.json`.

## Development and verification

```bash
npm ci --include=dev
npm run dev
npm run dev:firefox
npm run typecheck
npm run lint
npm run format:check
npm run test:run
npm run build
npm run build:firefox
npm run audit:build
```

`npm run audit:build` checks both production manifests and silent collector bundles for accidental content-script wrappers, page events/messages, extension-resource URLs, and web-accessible resources. CI runs all commands above except the watch-mode development commands.

## Architecture

- WXT and Manifest V3 for Chrome and Firefox.
- React 19 for the popup, dashboard, settings, and optional closed-shadow-root overlay.
- Dexie/IndexedDB for local observations, settings, logs, and bulk community snapshots.
- Two minimal manifest collectors for approved retailer routes; the overlay is a separate runtime-injected script.
- A single background service worker is the policy boundary for all Chook Check API access.
- Versioned observation schema with independent history, fairness, and observer-effect fields.

The community service lives in [Nevenit/chook-check-api](https://github.com/Nevenit/chook-check-api) and is licensed AGPL-3.0. This extension is MIT licensed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Scraper changes should include sanitized fixture coverage, and privacy-affecting changes must update the disclosure text, privacy policy, threat model, and tests in the same pull request.

## License

[MIT](LICENSE)
