# Contributing to Chook Check

Thanks for considering a contribution.

## Prerequisites

- Node 24 (see `.nvmrc`)
- npm
- Chrome and/or Firefox for testing

## Setup

```bash
git clone https://github.com/Nevenit/Chook-Check.git
cd Chook-Check
npm ci --include=dev
```

## Running locally

```bash
npm run dev              # Chrome with HMR
npm run dev:firefox      # Firefox
```

Edits to source trigger HMR.

## Testing

Use Node 24 (`nvm use` reads `.nvmrc`) and install locked dependencies with `npm ci --include=dev`. The test scripts set `NODE_ENV=test` even when the invoking shell uses production mode.

```bash
npm test                 # watch mode
npm run test:run         # one-shot
npm run lint
npm run format:check
```

Vitest with `happy-dom` and `fake-indexeddb`. UI tests use `@testing-library/react`. Tests live under `test/`, mirroring the source layout.

## Project structure

```
components/         React components (popup, dashboard, overlay, settings)
config/             Per-chain scraper selector config
docs/               Design specs and implementation plans (working memory; not for end users)
entrypoints/        WXT entry points (background, content scripts, popup, dashboard, options)
lib/                Shared modules: db, store, settings, api, types, navigation, scrapers
test/               Vitest test suites
```

## Architecture notes

- **All network I/O goes through the background service worker.** Content scripts and UI never call `fetch` directly. Use `browser.runtime.sendMessage` and add a handler in `entrypoints/background.ts`.
- **Scrapers use a layered fallback**: JSON-LD → JS hydration state (`__NEXT_DATA__` etc.) → DOM selectors. Add new selectors as fallback chains in `config/`, never as hardcoded strings in scraper logic.
- **All prices stored as integer cents** to avoid floating-point precision issues.
- **Settings changes write to the consent audit log** — preserve this when adding new toggles.

## Adding a new store

1. Add a content script under `entrypoints/<chain>.content.ts` with a URL match pattern
2. Add scraper config in `config/<chain>.ts`
3. Implement `lib/scrapers/<chain>.ts` with the layered extraction
4. Add fixture HTML and tests under `test/lib/scrapers/`
5. Update the popup/settings UI if user-facing strings need adjusting

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Run `npm run lint` and `npm run test:run` before pushing
- For UI changes, include a short note about visual verification (which scenarios you tried in the browser)
- The `docs/superpowers/` directory contains planning artifacts; don't reference it in commit messages or PR descriptions

## Code style

- Match the existing TypeScript style — see `eslint.config.mjs` and the existing modules
- React function components with hooks
- Avoid premature abstraction — three repeated lines is fine

## License

By contributing you agree your contributions will be licensed under the MIT License.
