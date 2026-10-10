# Chook Check release-readiness plan

**Status:** In progress. Phase 1 is validated; the core Phase 2 changes and a subset of Phase 3 Chromium checks are implemented. See [release validation](../../RELEASE_VALIDATION.md) for evidence and remaining gaps.
**Checkpoint:** 2026-09-11
**Date:** 2026-09-06
**Target:** A reliable private alpha for local price history, followed by a validated community beta and public release.
**Scope:** The sibling `Chook-Check` extension and `chook-check-api` repositories.

This plan follows a source exploration and extension test run. It builds on the implemented privacy/API v2 work described in the July hardening plan; unchecked tasks in that older document are not evidence that their implementation is missing. Verify existing behavior before adding or replacing it.

## 1. Establish a reproducible baseline

**Outcome:** Both repositories build and pass their quality checks from their lockfiles.

Original exploration baseline (superseded by the validation checkpoint):

- The extension passed all 241 tests across 26 files with `NODE_ENV=test`.
- The inherited environment has `NODE_ENV=production`; running tests in that environment failed.
- Installed extension dependencies lag behind the lockfile: WXT 0.20.19 versus 0.20.27, Vitest 3.2.4 versus 4.1.10, and happy-dom 20.8.4 versus 20.11.0.
- Extension type checking reported unsupported `noScriptStartedPostMessage` and Firefox `data_collection_permissions` properties with those installed dependencies.
- API dependencies are absent. Its tests and deployment have not been verified.

Tasks:

- [x] Select and document a supported Node version shared by local development and CI; verify toolchain engine requirements against the locked packages.
- [x] Run `npm ci --include=dev` in both repositories with a controlled environment.
- [x] Run extension lint, type checking, formatting checks, tests, Chrome build, Firefox build, and build audit.
- [x] Run API lint, type checking, formatting checks, and integration tests, including clean D1 migrations.
- [x] Reassess the two type errors after dependency synchronization. Fix remaining source/type compatibility issues without removing privacy behavior or weakening checks.
- [x] Make the supported test invocation explicit in development documentation; determine whether scripts should normalize the test environment.
- [x] Record commands, runtime versions, commit IDs, and outcomes in a release validation document. Distinguish environment failures from product defects.

Commands after installation:

```bash
# Chook-Check
npm run lint
npm run typecheck
npm run format:check
npm run test:run
npm run build
npm run build:firefox
npm run audit:build

# chook-check-api
npm run lint
npm run typecheck
npm run format:check
npm test
```

**Gate:** All applicable checks pass from a clean checkout. No generated or untracked local file is required to make them pass.

## 2. Preserve the observations needed for measurement

**Outcome:** Storage, submission, and aggregation preserve enough information to support their stated comparisons.

Start with `lib/store.ts`, `entrypoints/overlay.content.ts`, `entrypoints/background.ts`, and API `src/lib/aggregation-v2.ts`. These are investigation targets, not a complete bug inventory.

- [x] Add a regression demonstrating that same-product/day/price deduplication currently merges distinct observation contexts and capture phases. Confirm how this affects the existing overlay flow.
- [x] Define observation identity and deduplication rules that preserve changed offer/context, silent versus inline capture, comparison IDs, and independent measurement windows. Keep repeat DOM notifications from producing unlimited duplicates.
- [x] Separate display compaction from evidence retention where necessary: a concise local price chart must not erase records needed for fairness analysis.
- [x] Verify that repeated same-price observations can support the API's two-hourly-bucket requirement. Preserve sampling windows without changing the public contributor-balancing rules accidentally.
- [x] Review submitted-row handling: updating a local timestamp must not silently lose a new eligible measurement or conflict with API idempotency.
- [x] Define post-overlay sampling timing. Capture an unchanged post-overlay price as well as a changed one, so complete pairs are not selected only from price changes. Mark missing/failed captures explicitly or exclude them with a documented reason.
- [x] Review history-only serialization of inline measurements. Do not relabel inline measurements as silent evidence if downstream analysis relies on that distinction; exclude them or adjust the contract deliberately.
- [x] Add focused tests spanning capture/storage/submission and API analysis, covering unchanged and changed pairs, context changes, repeated windows, duplicates, and missing captures.
- [x] Add database/schema migrations only if required. Do not invent lost context for legacy observations; document how they remain usable for history and excluded from unsupported analysis.
- [x] Update `docs/METHODOLOGY.md`, `docs/THREAT_MODEL.md`, and privacy disclosures where behavior changes.

- [x] Preserve user-entered region/store choices at capture time and apply current sharing controls at submission. Older observations without a snapshot must not acquire current context retrospectively.

**Gate:** Regression cases retain the intended evidence, retries remain idempotent, and incomplete or legacy evidence cannot produce a stronger signal than warranted. Core automated regressions pass, including capture-time user context and subsequent sharing revocation.

## 3. Validate live local tracking and privacy boundaries

**Outcome:** The extension works in real browsers on the supported retailer flows.

**Progress:** Synthetic-page Chromium smoke checks have passed, including a reproduced and fixed background-worker restart defect. Live retailer and Firefox checks remain open; see the validation record.

Build a manual QA matrix across Chrome and Firefox, both retailers, and these scenarios:

| Area             | Scenarios                                                                | Evidence to record                                               |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Price extraction | Regular, sale, unit-price, quantity offer, unavailable product           | Displayed price versus stored cents and offer metadata           |
| Navigation       | Product/search/category pages, SPA navigation, lazy-loaded tiles, reload | Correct product association; no stale captures                   |
| Excluded pages   | Account, login, cart, checkout, orders                                   | No observations collected                                        |
| Local UI         | Popup, dashboard, product history, export, empty/error states            | Correct values and usable navigation                             |
| Lifecycle        | Browser restart, service-worker suspension, repeated visits              | Durable history and correct active-product behavior              |
| Inline UI        | Explicit activation, pre/post capture, navigation, repeat activation     | Capture order, pair preservation, no duplicate overlays          |
| Data management  | Retention, local deletion, settings upgrades                             | Expected records removed; consent preserved or renewed correctly |

- [ ] Verify a fresh default install makes zero Chook Check service requests while browsing, opening extension UI, and running scheduled tasks.
- [ ] Exercise each opt-in independently and in combinations, including revocation and Firefox permission removal.
- [ ] Inspect outgoing payloads to verify page URLs and excluded context are absent.
- [ ] Verify opt-out behavior during an in-flight batch and prevent subsequent requests that no longer have consent.
- [ ] Check collector bundles and runtime behavior for page-visible mutations/events; distinguish optional overlay behavior in the evidence.
- [ ] Turn extraction defects into sanitized fixtures and focused regression tests. Do not commit account data or tokens.

**Gate:** Supported local flows work in both browsers; privacy checks pass; known gaps are documented with an explicit supported scope.

## 4. Run a small private alpha for local history

**Outcome:** Real usage establishes whether collection is reliable and the UI is useful.

- [ ] Prepare versioned Chrome and Firefox artifacts and clear installation/removal instructions.
- [ ] Keep community modes off by default. Scope this milestone to local history; defer optional measurement features with unresolved blockers.
- [ ] Define a bounded trial, suggested at one to two weeks, with coverage of both retailers and browsers.
- [ ] Provide a manual feedback template for incorrect prices, missing captures, confusing controls, and reproducible navigation issues.
- [ ] Ask testers to inspect/redact any exported data they choose to share. Do not introduce telemetry merely to run the trial.
- [ ] Triage findings, fix release blockers, and repeat only the affected QA scenarios and required checks.

**Gate:** No unresolved data-loss, incorrect-price, or privacy blocker in the supported local workflow. Record which browser/retailer combinations actually received testing; elapsed trial time alone is not a pass.

## 5. Validate the community service and extension together

**Dependencies:** Phases 1–3. This can proceed alongside the local-history alpha after those gates pass.
**Outcome:** Contributions, public outputs, and deletion work end to end in a controlled environment.

- [ ] Configure a local or staging Worker/D1 environment with synthetic data and development credentials. Make the extension API target configurable for testing if needed, while retaining explicit production host permissions.
- [ ] Exercise registration, both contribution modes, retries, duplicate submissions, malformed payloads, expired observations, and rate limits through the extension/API pair.
- [ ] Verify raw-token hashing, separate submission/deletion authority, and failure behavior when required secrets are missing.
- [ ] Verify opt-out, offline deletion, retry after restart, and successful credential invalidation.
- [ ] Test public quorum boundaries, known contextual differences, repeated matched price groups, and observer pairs. Include cases that must produce insufficient evidence.
- [ ] Exercise raw expiry and aggregate materialization using controlled dates, including below-quorum days, three-year expiry, and deletion before raw expiry.
- [ ] Check snapshot contents, ETag refresh/304 behavior, and removal of stale client data after a changed snapshot.
- [x] Measure Worker/D1 work and payload sizes with a representative synthetic dataset. Review the snapshot route's per-product queries and aggregation before the ETag check, and the cleanup job's 100-product-day batch limit. Set a supported volume and confirm retention can keep up. _Done 2026-10-10: the API was redesigned for Workers Free; supported volume is about 100 contributors (roughly 4,000 accepted observations a day), measured including a simulated steady-state day. See the [release validation](../../RELEASE_VALIDATION.md#community-api-load-test)._
- [ ] Document deployment secrets, migration steps, operational checks, and rollback/recovery procedures without assuming migrations can be reversed safely.

**Gate:** The complete opt-in/submission/read/deletion cycle passes, public outputs meet their thresholds, and retention and request costs remain within the declared operating envelope.

## 6. Prepare public release

**Outcome:** A specific tested extension/API version pair is ready for publication.

- [ ] Resolve remaining blockers from the alpha and community validation, or remove affected optional features from the release scope with matching UI/docs.
- [ ] Align manifest text, UI, README, privacy policy, methodology, and store copy with demonstrated behavior. Review the current "detect personalised pricing" and cross-retailer comparison language in particular.
- [ ] State that community signals are experimental evidence for review, with no claim of retailer intent or causal proof.
- [ ] Verify production configuration, secrets, D1 migrations, supported Firefox permissions, and packaged manifests.
- [ ] Run required CI checks and final smoke tests against the exact release artifacts; record their commit IDs and checksums.
- [ ] Prepare release notes, support instructions, known limitations, and an extension/API compatibility record.
- [ ] Present the concrete release artifacts and deployment/store submission steps for publication approval.

**Gate:** Release evidence is complete for the shipped scope and publication is approved. Writing or implementing this plan does not itself authorize production deployment or store submission.

## Execution order and priorities

1. **First:** Reproduce a green baseline, then resolve observation preservation and consent-boundary defects.
2. **Next:** Complete real-browser QA and start the local-history alpha.
3. **Alongside alpha:** Validate community behavior in staging, including measurement quality and operational limits.
4. **Last:** Reconcile public claims and publish only the tested scope.

Avoid new retailers, canonical cross-retailer product matching, account linking, and major UI redesign during this readiness pass. Estimate implementation effort after Phase 1 and the Phase 2 regression cases establish the actual remaining work.
