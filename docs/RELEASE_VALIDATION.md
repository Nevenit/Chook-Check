# Release validation

Last updated: 2026-09-11 (Australia/Brisbane).

This is an implementation checkpoint, not approval for public release. The code changes were uncommitted at this checkpoint and were committed unchanged on 2026-10-10 (branch `release-readiness`). Live retailer reliability, Firefox runtime behavior, the private alpha, and production deployment remain release gates.

## Source and environment

- Extension base commit: `a7647972877961895cd19b6749c114378691bc72` plus the current readiness changes.
- API base commit: `1b41976602ae538efcd4fa9761a89a8734d731ea` plus the current readiness changes.
- Node: `24.20.0`; npm: `11.19.1`.
- WXT: `0.20.27`; Vitest: `4.1.10`; happy-dom: `20.11.0`.
- Both repositories now specify Node 24 in `.nvmrc`, package engines, and CI. The API's locked Wrangler requires at least Node 22; the former Node 20 CI configuration was incompatible.
- Test launchers explicitly set `NODE_ENV=test`. Validation deliberately used an invoking environment with `NODE_ENV=production`.

Source-only copies of both worktrees were created under `/tmp/chook-check-clean-validation`, including the new implementation files and excluding ignored dependencies and generated outputs. Each copy received a fresh `npm ci --include=dev --offline` using the already-downloaded lockfile packages. In particular, the extension copy started without `.wxt` or `.output`.

## Automated results

| Check                           | Extension                                       | API                       |
| ------------------------------- | ----------------------------------------------- | ------------------------- |
| Clean locked dependency install | Passed                                          | Passed                    |
| `npm run lint`                  | Passed                                          | Passed                    |
| `npm run typecheck`             | Passed; generates WXT types first               | Passed                    |
| `npm run format:check`          | Passed                                          | Passed                    |
| Test suite                      | 293 tests, 30 files passed                      | 71 tests, 11 files passed |
| `npm run build`                 | Passed, Chrome MV3                              | Not applicable            |
| `npm run build:firefox`         | Passed, Firefox MV3                             | Not applicable            |
| `npm run audit:build`           | Passed for both manifests and collector bundles | Not applicable            |

The API suite uses the local Cloudflare Worker runtime and isolated D1 databases, including migration tests. No production data or deployment was used. Local sandbox restrictions initially blocked npm network access, esbuild binary validation, and the Worker runtime's localhost listener. These checks passed after running with the required execution access; those failures were environmental.

The extension's original two type errors disappeared after installing its locked dependency versions. No privacy manifest setting or type-checking rule was removed to make the build pass.

The automatic-inline follow-up was validated in the working tree with the same locked dependencies: 293 extension tests, typecheck, lint, formatting, both browser builds, and the build audit passed. The earlier source-only installation checkpoint used 281 extension tests. The API was unchanged by this follow-up.

## Measurement changes verified

- Storage preserves distinct UTC hourly samples, offers/context, capture phases, and comparison IDs. Repeat notifications and concurrent ID retries are idempotent. Submitted IDs and timestamps remain immutable.
- Inline insertion requires successful pre-UI persistence. A fixed one-second post-UI sample includes unchanged prices; missing or navigated-away captures do not fabricate a pair.
- Silent collectors pause before inline insertion, retain that pause independently of the background worker, and resume on navigation. Failed injection leaves collection paused until navigation/reload.
- User-entered region/store context is saved with new captures only when selected for fairness sharing. Later settings changes do not relabel older observations, and current sharing controls still restrict uploads. Older records without a context snapshot do not acquire one retrospectively.
- History-only contribution excludes inline captures. Fairness contribution retains their original phases and IDs. Known older collection versions remain usable for history and are excluded from fairness signals.
- Uploads serialize overlapping runs, recheck consent/credentials before each batch, and retain IDs for retry after incomplete acknowledgements. An already-sent request cannot be recalled by opt-out.
- API regressions cover unknown/legacy context, repeated price patterns, one contributor appearing in multiple price groups, per-window contributor thresholds, unchanged observer pairs, and invalid/ambiguous pair matching.

## Chromium runtime checks

An isolated Chromium profile loaded the actual `.output/chrome-mv3` build. Requests for approved Coles/Woolworths URLs were fulfilled with a small synthetic product page. It contained JSON-LD, a visible $3.50 price, and explicit guest/pickup/store context. API traffic was monitored and blocked as a safeguard. These checks validate the extension's runtime wiring, not the current retailer websites. They preceded the final capture-time user-context addition, which was subsequently covered by regression tests and a fresh source-only validation run.

| Scenario                             | Result                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Default Coles collection             | Stored `coles:123`, 350 cents, guest context; page body unchanged                           |
| Woolworths collection                | Stored `woolworths:123`, 350 cents                                                          |
| Checkout navigation                  | No new observations                                                                         |
| Fresh settings                       | Network modes and inline UI off; sharing log empty                                          |
| Explicit inline activation           | Preserved baseline plus unchanged pre/post pair under one comparison ID                     |
| Price mutation after inline sampling | No new silent observation while collector was paused                                        |
| SPA navigation                       | Overlay removed and collection resumed; another activation produced a separate pair         |
| Forced background-worker shutdown    | Initially reproduced lost active-product lookup; after the fix, lookup returned `coles:123` |
| Activation after worker restart      | Did not insert a duplicate overlay or create another pair                                   |
| Settings and dashboard               | Loaded without JavaScript errors; product list showed the captured product and price        |
| Chook Check API requests             | None observed during these local-only scenarios                                             |

Chromium emitted module-preload warnings on extension pages; those pages still rendered. Browser alarms were scheduled with network modes disabled, but alarm delivery was not separately instrumented, so this is not a complete scheduled-task privacy test. The actual toolbar popup, export/download contents, and a full browser restart remain to be checked.

## Automatic inline UI follow-up

The inline setting now shows the chicken badge automatically on open and subsequent product pages. The per-product toolbar injection button was removed. Opt-out removes existing badges; it does not resume silent collection on an already instrumented page until navigation/reload. Network settings remain independent and off by default.

A fresh isolated Chromium profile verified the rebuilt extension against controlled retailer fixtures:

- Default collection left the page body unchanged.
- Enabling the setting through the settings page inserted one badge on the already-open product and saved an unchanged pre/post pair.
- Revisiting the same product inserted one badge and a new pair even when its baseline was deduplicated.
- A Coles product change using `history.pushState` replaced the badge and saved the new product's 420-cent pre/post pair. This exposed and fixed stale `sender.url` metadata: the background now uses the tab's current URL for same-document navigation.
- A Woolworths product page automatically received one badge and its own pre/post pair.
- Disabling the setting through the settings page removed the current badge. A subsequent price mutation did not resume silent capture on that instrumented page, and navigating to another product did not recreate the disabled badge.
- No Chook Check API requests occurred in these scenarios.

Unit regressions cover default-off behavior, concurrent insertion reservations, ineligible/stale pages, opt-out during activation, settings synchronization and re-enabling, failed injection retries, and collector pause/removal behavior. Runtime artifacts are in the ignored `output/playwright` directory.

The user reported that the preceding build's Firefox local workflows appeared to work. The new automatic behavior has been built for Firefox but still needs a live Firefox check after reloading the extension.

## Remaining work

1. Finish Firefox runtime checks, including optional data-collection permission requests and revocation. The cached browser had a Playwright protocol mismatch; a matching Firefox 155 build launched successfully, but its privileged add-on debugging page stalled and profile sideloading did not register the extension. No automated Firefox extension runtime result is claimed; the user subsequently reported that the earlier local workflows appeared to work. A passing Firefox build does not establish those behaviors.
2. Exercise live product/search/category pages, lazy loading, sale/quantity offers, unavailable products, and excluded routes in both browsers. Add sanitized fixtures for failures.
3. Complete the privacy matrix: every opt-in and combination, scheduled alarms, revocation while uploading, offline deletion/recovery, upgrade consent, and cache reset.
4. Validate the extension/API pair against local or staging endpoints, then exercise public threshold edges, retention throughput, snapshot costs, deletion, and cache invalidation at representative volume.
5. Run the private local-history alpha and record actual browser/retailer coverage. Reconcile public claims and prepare release artifacts only after the remaining gates pass.

The detailed checklist is in [the readiness plan](superpowers/plans/2026-09-06-release-readiness.md). No production deployment, store submission, or external tester outreach has occurred.
