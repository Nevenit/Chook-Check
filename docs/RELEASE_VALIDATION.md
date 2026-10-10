# Release validation

Last updated: 2026-10-10 (Australia/Brisbane).

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

## Local API end-to-end check

Run on 2026-10-10 from `main` plus the configurable API origin change.

- **Setup:** API `main` under `wrangler dev` on `http://127.0.0.1:8787`, with fresh local D1 migrations and a development `RATE_LIMIT_SECRET`. Extension built with `CHOOK_API_ORIGIN=http://127.0.0.1:8787` and loaded into Playwright Chromium (build 1234) in a fresh profile.
- **Retailer pages:** simulated. Coles and Woolworths product URLs were answered locally with a minimal product page (JSON-LD, price element, and page context for a signed-out pickup shopper at a selected store). No live retailer traffic.
- **Evidence:** every API request was logged through Playwright routing. Server rows were counted with `wrangler d1 execute --local`. Requests to the production API were blocked and counted; there were none.

| Check                     | Result                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default capture           | Rows stored for both retailers; no API requests.                                                                                                                                                                                                                                                                                                              |
| Inline badge only         | One unchanged `pre_ui`/`post_ui` pair under one comparison ID; no API requests.                                                                                                                                                                                                                                                                               |
| Community downloads       | One `GET /api/v2/snapshots/products` with no credentials, product ID, or query string. A repeat sync sent `If-None-Match` and received `304`.                                                                                                                                                                                                                 |
| History contribution      | One registration (`201`). Uploads used the submit token and `mode: "history"`. Observations had no page URL; store, region, and browser family were null; sign-in, loyalty, and fulfilment were `unknown`. The inline pair was not sent.                                                                                                                      |
| Fairness study            | No upload until a shared context field was set. Rows captured before that stayed unshared. A QLD-only upload carried only the region and the page's sign-in/fulfilment context; the page's store ID was withheld because store sharing was off. Browser family appeared only after its toggle. A row captured in QLD kept QLD after the state changed to NSW. |
| Opt-out mid-upload        | 60 eligible rows, first batch delayed in flight, mode turned off: that batch of 50 completed and no second batch was sent.                                                                                                                                                                                                                                    |
| Online server deletion    | `DELETE /api/v2/contributor` (`200`) removed all 56 of that contributor's server rows; local credentials cleared and contribution modes turned off.                                                                                                                                                                                                           |
| Failed deletion and retry | An aborted deletion left a pending deletion and paused uploads. The next submit alarm retried it successfully and cleared the pending state; the second contributor's server rows reached 0.                                                                                                                                                                  |
| Sharing log               | One success entry for each accepted upload.                                                                                                                                                                                                                                                                                                                   |

All 23 automated checks passed. Not covered: Firefox (including data-collection permission prompts), simultaneous mode combinations, city/store sharing, recovery-code export, and live retailer pages.

**Live retailers cannot be automated from this environment.** Both retailers' bot protection blocked the automated Chromium session: Woolworths returned `403 Access Denied` after its home page, and Coles served a blank challenge page. The live-page rows in the [QA checklist](QA_CHECKLIST.md) therefore need a person in a normal browser.

## Community API load test

Run on 2026-10-10 against local `wrangler dev` with synthetic data and per-invocation D1 instrumentation (queries and the rows read and written that D1 reports). The API will run on the Workers Free plan: 50 D1 queries per invocation, 10 ms CPU per request or cron run, 5M rows read and 100k rows written per day, and a 500 MB database.

**Before** (API `main` at `00bdf76`, 4,000 synthetic products):

| Measurement                                | Alpha: 30 contributors, 190k rows | Beta: 300 contributors, 1.9M rows |
| ------------------------------------------ | --------------------------------- | --------------------------------- |
| Snapshot request: queries                  | 5,167                             | 8,005                             |
| Snapshot request: rows read, also on a 304 | 546k                              | 5.5M                              |
| Snapshot size                              | 7.5 MB                            | 31.6 MB                           |
| Hourly cleanup: queries / rows read        | ~210 / ~300k                      | 297 / 3.25M                       |
| Upload of 50 observations: queries         | ~153 (from code)                  | ~153                              |

Every snapshot request would have failed on either plan's query limit, and cleanup fell behind at beta scale, which would keep raw rows past the promised 180 days.

**After** (API branch `free-plan-pipeline` including the final-review fixes, alpha dataset rebuilt with migration 0002). Steady state was simulated by ageing every product's last refresh by 25 hours and marking the 729 products observed in the last day as changed:

| Invocation                                       | Queries | Rows read | Rows written |
| ------------------------------------------------ | ------- | --------- | ------------ |
| Snapshot download (200, 28 KB)                   | 4       | 2         | 2            |
| Snapshot revalidation (304)                      | 3       | 3         | 1            |
| Per-product stats                                | 3       | 1         | 2            |
| Upload of 50 observations                        | 8       | 1,238     | 403          |
| Every-minute run, idle                           | 5       | 5         | 0            |
| Every-minute run, refreshing 100 products        | 9–10    | 9k–586k   | 93–300       |
| 30-minute snapshot run (with rate-limit cleanup) | 3–7     | about 225 | 0–3          |

The backfill (45 runs) refreshed all 4,000 products and expired all 20 days of out-of-window data. The simulated day's refreshes read 1.35M rows in eight runs. With idle minutes, snapshot runs, and uploads, that is about 1.45M rows read and 22k rows written per day, 29% and 22% of the Free allowances, so the Free plan supports roughly 100 contributors at this usage. CPU time was not measurable locally.

The first steady-state estimate exceeded the Free read limit (about 5.0M rows a day), so each changed product now refreshes at most daily and only public products get the daily recheck. The final review then found that the every-minute product selection still scanned settled and throttled products (about 8M rows a day at this scale) and that rate-limit cleanup scanned every minute; indexed due times and moving cleanup to the 30-minute job reduced an idle minute to 5 rows. Contributor deletions now leave the published stats on the next refresh instead of up to a day later.

The first redesign required five contributors on the same day within 90 days. That published about 115 of 4,000 synthetic products at 30 contributors (410 at 100), and about half of those "current" days were more than a week old. The current price now uses each contributor's latest price from the last seven days, still requiring five contributors: 254 products at 30 contributors and 864 at 100, never more than a week old. The previous rule, five contributors anywhere in 90 days, published about 2,550 at 30 contributors.

## Remaining work

1. Finish Firefox runtime checks, including optional data-collection permission requests and revocation. The cached browser had a Playwright protocol mismatch; a matching Firefox 155 build launched successfully, but its privileged add-on debugging page stalled and profile sideloading did not register the extension. No automated Firefox extension runtime result is claimed; the user subsequently reported that the earlier local workflows appeared to work. A passing Firefox build does not establish those behaviors.
2. Exercise live product/search/category pages, lazy loading, sale/quantity offers, unavailable products, and excluded routes in both browsers. Add sanitized fixtures for failures.
3. Complete the privacy matrix in real browsers: mode combinations, scheduled alarms, Firefox permissions, and upgrade consent. Revocation while uploading, deletion retry, and the cache reset fix have automated Chromium coverage.
4. Repeat the local API end-to-end run against the redesigned pipeline, and check Worker CPU metrics after deployment. Load testing set the Free-plan volume at about 100 contributors.
5. Run the private local-history alpha and record actual browser/retailer coverage. Reconcile public claims and prepare release artifacts only after the remaining gates pass.

The detailed checklist is in [the readiness plan](superpowers/plans/2026-09-06-release-readiness.md). No production deployment, store submission, or external tester outreach has occurred.
