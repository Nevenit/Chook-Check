# Chook Check

> Browser extension for tracking Australian supermarket prices, detecting personalised pricing, and empowering consumers through community data.
>
> *"Just doing a quick chook check before heading to Woolies."*

Chook Check passively records prices as you browse Woolworths and Coles, stores them locally in your browser, and — if you choose to opt in — contributes them to a community dataset that helps everyone spot pricing inconsistencies, sale patterns, and personalised pricing.

## Status

In active development. Not yet listed on the Chrome Web Store or Firefox Add-ons. See **Manual installation** below to try it.

## Privacy at a glance

- **Default:** all data stays on your device. Nothing is sent anywhere.
- **Opt-in contribution:** if you turn it on, you choose exactly which optional context to share alongside the price data. Each toggle is independent.
- **No accounts, no IPs:** the API never logs IPs against observations, and there's no signup.
- **Open source on both ends:** this extension (MIT) and the [community API](https://github.com/Nevenit/chook-check-api) (AGPL-3.0).

Full details in [PRIVACY.md](PRIVACY.md).

## Manual installation

### Chrome / Edge / Brave

1. `npm install && npm run build`
2. Open `chrome://extensions`, enable Developer mode
3. Click **Load unpacked** and select `.output/chrome-mv3`

### Firefox

1. `npm install && npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and select `.output/firefox-mv2/manifest.json`

## Development

Requires Node 20+ and npm.

```bash
npm install
npm run dev              # Chrome dev with HMR
npm run dev:firefox      # Firefox dev
npm test                 # Vitest in watch mode
npm run test:run         # one-shot
npm run lint
npm run format
```

Build commands:

```bash
npm run build            # Chrome production build
npm run build:firefox
npm run zip              # zipped artifact for store submission
npm run zip:firefox
```

## Architecture

- [WXT](https://wxt.dev) extension framework, Manifest V3 (Chrome) / V2 (Firefox)
- React 19, Chart.js for the dashboard, hand-rolled SVG sparkline for the overlay
- [Dexie.js](https://dexie.org) wrapping IndexedDB for local storage
- All network I/O goes through the background service worker — content scripts and UI never `fetch` directly

Scrapers use a layered fallback: JSON-LD → JS hydration state (`__NEXT_DATA__` etc.) → DOM selectors.

## Testing

Vitest with `happy-dom` and `fake-indexeddb`. UI tests use `@testing-library/react`. Run `npm run test:run`.

## Backend

The community API lives at <https://github.com/Nevenit/chook-check-api>. AGPL-3.0 — anyone running a modified service must publish their source.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs welcome.

## License

[MIT](LICENSE).
