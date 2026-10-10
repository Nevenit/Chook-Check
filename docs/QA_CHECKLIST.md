# Phase 3 QA checklist

Drafted: 2026-10-10. This is the manual test matrix for Phase 3 of the [release-readiness plan](superpowers/plans/2026-09-06-release-readiness.md): supported local flows work in Chrome and Firefox on live Woolworths and Coles pages, and the privacy boundaries hold.

Earlier Chromium checks in [release validation](RELEASE_VALIDATION.md) used controlled retailer fixtures. They show what should already work, but they do not satisfy the live checks below.

**Gate:** every applicable row passes in both browsers, or the gap is documented with an explicit supported scope. Copy the results summary into the validation record when you finish.

**Recording results:** fill each result cell with `✅`, `❌ <short note or issue link>`, or `n/a`. For retailer-specific rows, record each retailer, for example `W✅ C❌ #7`. Note the date, browser version, and extension commit at the top of each session.

## Before you start

- [ ] Build from `main` with Node 24: `npm ci --include=dev && npm run build && npm run build:firefox`.
- [ ] Copy each build into a stable folder, such as `~/chook-qa/chrome` and `~/chook-qa/firefox`, and load the extension from there. Reloading from the same folder keeps the extension ID and its stored data, which the upgrade test needs.
  - **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → the folder.
  - **Firefox (140 or newer):** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → the folder's `manifest.json`. Temporary add-ons are removed when Firefox restarts. For the restart test (L1), use Firefox Developer Edition with `xpinstall.signatures.required` set to `false` and install the output of `npm run zip:firefox`.
- [ ] Use a new, dedicated browser profile for each browser.
- [ ] Some rows need a signed-in retailer session. Never paste raw settings or exports into issues: they contain your contributor tokens and the retailer page URLs.
- [ ] Section 9 is blocked until an API v2 server is reachable. See its prerequisite before starting it.

**Where to look:**

- **Extension console:**
  - Chrome: `chrome://extensions` → Chook Check → "Inspect views: service worker".
  - Firefox: `about:debugging` → Chook Check → Inspect.
  - The snippets in the appendix run there or in the console of the dashboard page.
- **Extension network requests:** the Network tab of that same inspector. Filter for `chook-check-api`.
  - In Chrome, an open inspector keeps the service worker alive. Close it for suspension tests and long idle checks.
- **Whole-browser network capture** (for idle and scheduled-task checks):
  - Chrome: `chrome://net-export`.
  - Firefox: `about:logging` with the Networking preset.
  - Search the resulting log for `chook-check-api`.

## 1. Fresh install and default privacy

| ID  | Check                                                                                                                                                                                       | Expected                                                               | Chrome | Firefox |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ | ------- |
| P1  | Install into a fresh profile and open Settings.                                                                                                                                             | All four modes are off. The sharing log and consent history are empty. |        |         |
| P2  | With the defaults, browse product, search, and category pages on both retailers for five minutes. Open the popup, dashboard, and settings.                                                  | No requests to `chook-check-api.nevenit.workers.dev`.                  |        |         |
| P3  | Leave the browser idle for 15 minutes with the inspector closed and a whole-browser capture running. Then fire each alarm by hand (appendix A4).                                            | No requests to the API, either while idle or when each alarm fires.    |        |         |
| P4  | On a product page with the defaults, run the overlay-host check (appendix A5) in the page's console. In the page's own Network tab, filter for `chrome-extension://` or `moz-extension://`. | Zero overlay hosts. The page loads no extension resources.             |        |         |

## 2. Price extraction on product pages

Compare what the page displays with the stored row (appendix A1). Prices are stored in cents.

| ID  | Check                                                                                             | Expected                                                                                                                                                                             | Chrome | Firefox |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------- |
| E1  | A product at its regular price, such as milk or bread.                                            | `priceCents` matches the shelf price. `wasPriceCents` and `promoType` are null. The unit price matches the "per 100 g" or "per litre" text.                                          |        |         |
| E2  | A product on special with a "was" price.                                                          | `priceCents` is the special price and `wasPriceCents` the was price. `promoType` is set.                                                                                             |        |         |
| E3  | Retailer-specific promotions: Coles half price; Woolworths "Prices Dropped" or lower shelf price. | `promoType` is `half_price` or `lower_price` as appropriate.                                                                                                                         |        |         |
| E4  | A multi-buy or quantity offer, such as "2 for $6".                                                | `offerTextNormalized` and `requiredQuantity` are set. `priceCents` is the single-item shelf price, not the multi-buy price.                                                          |        |         |
| E5  | A variable-weight or per-kg product, such as loose fruit or deli items.                           | The stored price and unit price are plausible and match the page. If they don't, record exactly what was stored.                                                                     |        |         |
| E6  | A product that is unavailable or out of stock at the selected store.                              | No errors. Record whether a row was stored and with what price. Expected behaviour isn't defined yet: decide whether these should be collected.                                      |        |         |
| E7  | Woolworths personalised placement ("Recommended for you" or similar), if it appears.              | `sourceSurface` is `personalised_placement`.                                                                                                                                         |        |         |
| E8  | Which extraction method was used on the rows from E1–E5.                                          | `extractionSource` is `json_ld` on product pages. Note any falling back to `dom`.                                                                                                    |        |         |
| E9  | Page context: signed out, then signed in; delivery, then pickup; with a store selected.           | `authState` is `guest` or `signed_in`; `fulfilmentMode` and `storeId` follow the page. Changing the store or fulfilment adds a new row within the same hour instead of being merged. |        |         |

## 3. Search, browse, and category tiles

| ID  | Check                                                                                                                                                                                                                                                                                             | Expected                                                                                                                    | Chrome | Firefox |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| T1  | Run a search.                                                                                                                                                                                                                                                                                     | One row per visible tile, with `sourceSurface` set to `search_result`. Spot-check three prices against their tiles.         |        |         |
| T2  | Open a browse or category page.                                                                                                                                                                                                                                                                   | Rows have `sourceSurface` set to `category_tile`, and the prices match the tiles.                                           |        |         |
| T3  | Scroll so more tiles load.                                                                                                                                                                                                                                                                        | Newly loaded tiles are captured within a few seconds. Tiles already captured are not duplicated.                            |        |         |
| T4  | Change page, filter, or sort without a full reload.                                                                                                                                                                                                                                               | New tiles are captured. No rows are attributed to products from the previous view.                                          |        |         |
| T5  | Capture a product from a tile, then open its product page.                                                                                                                                                                                                                                        | Both rows share the same `productId`.                                                                                       |        |         |
| T6  | Pages outside the allowlist, such as the home page, the Coles specials page, and catalogues. Woolworths allows `/shop/productdetails/`, `/shop/search/`, and `/shop/browse/` (Woolworths specials live under `/shop/browse/`). Coles allows `/product/`, `/search`, `/browse/`, and `/category/`. | Nothing is collected outside the allowlist; Woolworths specials are collected as tiles. Confirm this is the intended scope. |        |         |

## 4. Navigation and sampling

| ID  | Check                                                                                                                                                                     | Expected                                                                                           | Chrome | Firefox |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ------- |
| N1  | Move from one product to another without a full page load, for example via a "similar products" link.                                                                     | The new row has the new `productId` and `pageUrl`. Nothing new is stored for the previous product. |        |         |
| N2  | Use back, forward, and reload.                                                                                                                                            | No captures for the wrong product. Reloading within the same hour adds no duplicate row.           |        |         |
| N3  | Leave one product page open for several minutes with the price unchanged, then keep it open past the start of the next UTC hour (the same as the local hour in Brisbane). | One row within the hour, then a new row after the hour changes.                                    |        |         |
| N4  | Open the same product in two tabs.                                                                                                                                        | No duplicate rows within the hour.                                                                 |        |         |

## 5. Excluded routes

Count the stored rows (appendix A1) before and after each visit.

| ID  | Check                                                                                                                                      | Expected                     | Chrome | Firefox |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------ | ------- |
| X1  | Login, account, and "my account" pages.                                                                                                    | No new rows.                 |        |         |
| X2  | Pages that show priced products but must not be collected: cart, checkout, past orders, lists, "buy again", Everyday Rewards, and Flybuys. | No new rows.                 |        |         |
| X3  | Going back from an excluded page to a product page.                                                                                        | Collection resumes normally. |        |         |

## 6. Local UI

| ID  | Check                                                                              | Expected                                                                                                                                    | Chrome | Firefox |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| U1  | The toolbar popup, both on and off a product page. Not yet checked in any browser. | The stats, recent observations, and links are correct. The popup shows the active product's history.                                        |        |         |
| U2  | The dashboard's overview, product list, product detail, and chart.                 | Values match the stored rows. Sale prices are highlighted in amber.                                                                         |        |         |
| U3  | Export as JSON and as CSV. Not yet checked in any browser.                         | Both files download and their contents match the stored rows. JSON includes `userContextAtCapture` where it was set. Both files stay local. |        |         |
| U4  | Empty states in a fresh profile.                                                   | The popup, dashboard, and settings render sensibly with no data. No JavaScript errors in the extension consoles.                            |        |         |
| U5  | The onboarding banner.                                                             | It appears, and once dismissed it stays dismissed after closing and reopening.                                                              |        |         |

## 7. Inline UI (automatic badge)

The badge is the overlay that appears on the retailer's page. Use the overlay-host check (appendix A5) to count badges, and appendix A1 to see the stored pre- and post-badge price pairs.

| ID  | Check                                                                | Expected                                                                                                                                                               | Chrome | Firefox |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| I1  | With the setting off.                                                | No badge appears.                                                                                                                                                      |        |         |
| I2  | Turn the setting on while a product tab is open.                     | Exactly one badge appears on that tab. Two new rows, `pre_ui` and `post_ui`, share a `comparisonId` and are about one second apart, even when the price didn't change. |        |         |
| I3  | Move to another product without a full page load.                    | The old badge is replaced by a single new one, and a new pair is stored.                                                                                               |        |         |
| I4  | Revisit a product you've already seen.                               | One badge and a new pair.                                                                                                                                              |        |         |
| I5  | Search and category pages.                                           | No badge.                                                                                                                                                              |        |         |
| I6  | Turn the setting off.                                                | Badges disappear from all open tabs. That page stores no new background captures until it reloads. Navigating elsewhere doesn't bring the badge back.                  |        |         |
| I7  | Restart the background (appendix A6), then move to a new product.    | No duplicate badge or pair.                                                                                                                                            |        |         |
| I8  | Use the badge and its panel.                                         | The sparkline and history render, sale prices show in amber, and the panel stays within the viewport. Add-to-cart and the rest of the page still work.                 |        |         |
| I9  | Firefox only: the automatic badge after reloading the current build. | The badge is injected; this has not yet been checked live in Firefox.                                                                                                  | n/a    |         |

## 8. Lifecycle and data management

| ID  | Check                                                                                                                                                                                                                                                                                                                    | Expected                                                                                                                                                                                                                                       | Chrome | Firefox |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| L1  | Restart the whole browser. In Firefox this needs the permanent install described in "Before you start".                                                                                                                                                                                                                  | History and settings survive, and collection resumes.                                                                                                                                                                                          |        |         |
| L2  | Let the background suspend (appendix A6), then browse and open the popup.                                                                                                                                                                                                                                                | Collection works, and the popup shows the active product.                                                                                                                                                                                      |        |         |
| L3  | Add a 400-day-old row (appendix A3), then fire the retention alarm (appendix A4).                                                                                                                                                                                                                                        | Only that row is removed.                                                                                                                                                                                                                      |        |         |
| L4  | Use "Delete local data", then "Reset". After the reset, run `chrome.storage.local.get()` in Chrome or `browser.storage.local.get()` in Firefox.                                                                                                                                                                          | Observations, the sharing log, and community snapshots are cleared, and settings return to their defaults. The reset also removes `communitySnapshotEtag`, so re-enabling downloads fetches a full snapshot instead of a "not modified" reply. |        |         |
| L5  | "Clear logs".                                                                                                                                                                                                                                                                                                            | The sharing and consent logs are empty, and observations are kept.                                                                                                                                                                             |        |         |
| L6  | Upgrade from the build existing testers likely run. Build commit `15f0313` in a separate worktree and load it from the stable folder. Collect a few rows. Turn contribution on **with the background offline** so nothing reaches the live v1 API. Then replace the folder's contents with the current build and reload. | Old rows are kept, with `scraperVersion` set to `legacy`. All modes are off, and you're prompted to consent again. No API request is made before you consent.                                                                                  |        |         |

## 9. Opt-in modes and outgoing data

**Prerequisite (currently blocked):** the production API is still v1 (`v0.1.1`), so `/api/v2/...` returns 404. Turning on contribution fails at registration and the mode switches itself back off. Choose one of these before starting this section:

1. **Deploy v2 to production.** Set `RATE_LIMIT_SECRET` with `wrangler secret put`, then push a `v*` tag. The deploy workflow applies D1 migration `0001` before deploying. Existing v1 test builds will start getting `410 Gone`.
2. **Point a development build at `wrangler dev`.** This needs a configurable API address and a development-only host permission, which is planned for Phase 5.

For every row, inspect the request bodies in the extension's Network tab.

| ID  | Check                                                                                                                                                                                                | Expected                                                                                                                                                                                                                                                                                                                                                                   | Chrome | Firefox |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| O1  | Community downloads only. Then sync a second time.                                                                                                                                                   | One `GET /api/v2/snapshots/products`, with no product ID, page URL, or contributor credentials. The second sync gets `304 Not Modified`. After that, one request per day.                                                                                                                                                                                                  |        |         |
| O2  | History contribution only.                                                                                                                                                                           | One `POST /api/v2/contributors` when you turn it on. Afterwards, `POST /api/v2/observations` with `mode: "history"` at most every five minutes. Bodies contain no `pageUrl`. `storeId`, `coarseRegion`, and `browserFamily` are null; `authState`, `loyaltyState`, and `fulfilmentMode` are `unknown`. Rows from the inline badge (`pre_ui` and `post_ui`) are never sent. |        |         |
| O3  | Fairness study only, first with no region or store set, then with each of state, city, and store set and shared on its own.                                                                          | Nothing is uploaded until at least one shared field is set. Bodies contain only the fields you chose to share. `browserFamily` is included only when its toggle is on. Inline pairs keep their phase and `comparisonId`.                                                                                                                                                   |        |         |
| O4  | Change your state after some rows were captured.                                                                                                                                                     | Older rows are uploaded with the state from when they were captured. Turning a field's sharing off removes it from later uploads.                                                                                                                                                                                                                                          |        |         |
| O5  | Inline UI on, with every network mode off.                                                                                                                                                           | No API requests.                                                                                                                                                                                                                                                                                                                                                           |        |         |
| O6  | Combinations: history and fairness; downloads and inline; all modes on.                                                                                                                              | Each request matches what the enabled modes allow, and nothing more.                                                                                                                                                                                                                                                                                                       |        |         |
| O7  | Turn contribution off mid-upload. Have at least 51 rows waiting so the upload needs two batches. Slow the network with throttling, and turn the mode off while the first request is still in flight. | The in-flight request may complete, but no second batch is sent.                                                                                                                                                                                                                                                                                                           |        |         |
| O8  | Firefox data-collection permissions. Decline the prompt, then accept it, then remove the optional permission in `about:addons` → Chook Check → Permissions.                                          | Declining leaves the mode off and shows a message. Accepting turns the mode on. Removing the permission turns the mode off and stops its requests.                                                                                                                                                                                                                         | n/a    |         |
| O9  | Delete server data while online.                                                                                                                                                                     | The server reports how many rows were deleted. Local credentials are cleared, and contribution modes turn off.                                                                                                                                                                                                                                                             |        |         |
| O10 | Delete server data while the background is offline, then go back online.                                                                                                                             | The deletion is recorded as pending and uploads pause. The deletion is retried within five minutes of going back online. The recovery-code export works.                                                                                                                                                                                                                   |        |         |
| O11 | Compare the sharing log in Settings with the requests you saw.                                                                                                                                       | Each upload and each failure has a matching entry.                                                                                                                                                                                                                                                                                                                         |        |         |

## 10. Turning failures into fixtures

When a capture is wrong or missing:

1. Save the page's HTML: right-click → Save Page As → "Web Page, HTML only", or copy `document.documentElement.outerHTML`.
2. Remove anything personal: names, email addresses, delivery addresses, loyalty numbers, cart and order contents, and tokens or session values. Search the file for `@`, `token`, `session`, and your name.
3. Keep the parts the scraper reads: the product's JSON-LD block, the page's embedded app data (hydration state), and the relevant price markup.
4. Save it as `test/fixtures/<retailer> <case>.html`, following the existing names.
5. Add a focused test in `test/lib/scrapers/<retailer>.test.ts` that fails before the fix.

## Results summary

| Area                  | Chrome · Woolworths | Chrome · Coles | Firefox · Woolworths | Firefox · Coles | Notes |
| --------------------- | ------------------- | -------------- | -------------------- | --------------- | ----- |
| 1. Default privacy    |                     |                |                      |                 |       |
| 2. Product extraction |                     |                |                      |                 |       |
| 3. Tiles              |                     |                |                      |                 |       |
| 4. Navigation         |                     |                |                      |                 |       |
| 5. Excluded routes    |                     |                |                      |                 |       |
| 6. Local UI           |                     |                |                      |                 |       |
| 7. Inline UI          |                     |                |                      |                 |       |
| 8. Lifecycle and data |                     |                |                      |                 |       |
| 9. Opt-in modes       |                     |                |                      |                 |       |

## Appendix: inspection snippets

Run these in an extension console: the background inspector or the dashboard page's console. They read the same database the extension uses (`ChookCheckDB`). Run them only after the extension has started at least once.

**A1. Show the latest 20 observations**

```js
{
  const open = indexedDB.open("ChookCheckDB");
  open.onsuccess = () => {
    const read = open.result
      .transaction("priceObservations")
      .objectStore("priceObservations")
      .getAll();
    read.onsuccess = () => {
      console.log("total rows:", read.result.length);
      console.table(
        read.result.slice(-20).map((o) => ({
          product: o.productId,
          cents: o.priceCents,
          was: o.wasPriceCents,
          unit: o.unitPriceCents,
          promo: o.promoType,
          offer: o.offerTextNormalized,
          qty: o.requiredQuantity,
          surface: o.sourceSurface,
          source: o.extractionSource,
          phase: o.capturePhase,
          comparison: o.comparisonId,
          auth: o.authState,
          loyalty: o.loyaltyState,
          fulfilment: o.fulfilmentMode,
          store: o.storeId,
          at: o.observedAt,
        })),
      );
    };
  };
}
```

**A2. Show settings.** The output includes contributor tokens, so don't share it.

```js
{
  const open = indexedDB.open("ChookCheckDB");
  open.onsuccess = () => {
    const read = open.result
      .transaction("userSettings")
      .objectStore("userSettings")
      .get("default");
    read.onsuccess = () => console.log(read.result);
  };
}
```

**A3. Add a 400-day-old copy of the newest row.** This needs at least one existing row. The copy is marked `contributed: true`, so it is never uploaded.

```js
{
  const open = indexedDB.open("ChookCheckDB");
  open.onsuccess = () => {
    const store = open.result
      .transaction("priceObservations", "readwrite")
      .objectStore("priceObservations");
    store.openCursor(null, "prev").onsuccess = (event) => {
      const { id, ...row } = event.target.result.value;
      store.add({
        ...row,
        clientObservationId: crypto.randomUUID(),
        observedAt: new Date(Date.now() - 400 * 864e5).toISOString(),
        contributed: true,
      });
    };
  };
}
```

**A4. Fire an alarm now.** Use `chrome.alarms` in Chrome and `browser.alarms` in Firefox. This replaces the repeating alarm with a one-off; reload the extension afterwards to restore the schedule.

```js
for (const name of [
  "chook-check-retention",
  "chook-check-submit",
  "chook-check-snapshot",
]) {
  chrome.alarms.create(name, { when: Date.now() + 1000 });
}
```

**A5. Count overlay hosts.** Run this in the retailer page's console. The badge is mounted in a `div` with a random `data-<uuid>` attribute, so expect 0 with the setting off and 1 on a product page with it on.

```js
[...document.querySelectorAll("div")].filter((el) =>
  [...el.attributes].some((a) => /^data-[0-9a-f]{8}-[0-9a-f]{4}-/.test(a.name)),
).length;
```

**A6. Restart or suspend the background.**

- **Chrome:** close the inspector and wait at least 30 seconds while idle, or stop the extension's service worker at `chrome://serviceworker-internals`.
- **Firefox:** `about:debugging` → Chook Check → Terminate background script.
