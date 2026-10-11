# Store listing

Source text for the Firefox Add-ons (AMO) listing and version submissions. Keep it in step with [PRIVACY.md](../PRIVACY.md) and the extension's behaviour; store reviewers check listing claims against the code.

## Summary

AMO limit: 250 characters.

> Record the Woolworths and Coles prices you see and keep a private price history in your browser. Optional modes, each off until you turn it on, download community prices or contribute your observations. No account needed.

## Description

```text
Chook Check records the prices you see on woolworths.com.au and coles.com.au and keeps a price history in your browser, so you can check whether a "special" is really cheaper than usual.

What it does

• Records prices from product, search, browse, and category pages as you browse. Account, cart, checkout, and order pages are skipped.
• The dashboard shows each product's price history as a chart, a searchable list of everything you've seen, and a JSON export.
• Sale prices are highlighted in amber, so you can tell promotions from the everyday price.
• An optional chicken badge on product pages shows your price history and, if you've turned them on, community prices.

Local by default

Out of the box, Chook Check makes no requests to its own service and changes nothing on the retailer's page. Observations stay in your browser for up to a year. There's no account or sign-up.

Optional modes

Each is off by default and turned on separately in Settings.

• Community prices: downloads one bulk snapshot of community prices. The request doesn't say which product you're looking at. A product appears only when at least five contributors have seen it in the last seven days, with its median, lowest, and highest price and how often it's on promotion.
• Price-history contribution: uploads your observations (product, price, offer, and time) under a random contributor ID. Page URLs are never uploaded.
• Fairness study: also uploads context you choose to share: state, city/region, or store; delivery or pickup, signed-in and loyalty status when the page shows them; and optionally your browser family. It's for research into whether matched shoppers see different prices. Results aren't published yet.
• Inline badge: shows the badge on product pages. The retailer's page can see it, so it's off by default.

Contributions are pseudonymous, not anonymous: a random ID links your uploads. You can delete your server data from Settings at any time.

What Chook Check never collects

• Your name, email, password, or login details
• Loyalty card numbers
• Cart contents, orders, or payment details
• Browsing outside Woolworths and Coles
• Page URLs (they stay on your device)

When an optional mode contacts the Chook Check API, which runs on Cloudflare, the request carries your IP address like any web request. It is never stored with observations.

Permissions

• Woolworths and Coles: to read prices on those sites.
• Chook Check API: used only by a mode you've turned on, or when you delete your data.
• Storage, alarms, and scripting: local history, scheduled tasks, and the optional badge.

Firefox asks for its data-collection permissions when you turn on a mode that needs them.

Open source

Extension (MIT): https://github.com/Nevenit/Chook-Check
API (AGPL-3.0): https://github.com/Nevenit/chook-check-api
Privacy policy: https://github.com/Nevenit/Chook-Check/blob/main/PRIVACY.md

Why "Chook Check"?

"Just doing a quick chook check before heading to Woolies."
```

## Release notes: 0.2.0

```text
• Every network feature is now off by default and turned on separately, with the disclosure you agreed to recorded in Settings.
• New community API with pseudonymous contributor credentials and server-side deletion. If you contributed with 0.1.0, contribution is paused until you opt in again.
• Community prices now need at least five contributors in the last seven days (previously three).
• The inline badge is off by default and appears automatically on product pages once enabled.
• Prices are also recorded from search, browse, and category pages.
• New optional fairness study.
• Requires Firefox 140 or later.
```

## Notes to reviewer

```text
Built with WXT and Vite; the uploaded package contains no remote code. The source is attached and at https://github.com/Nevenit/Chook-Check (tag v0.2.0).

To reproduce the package: Node.js 24 and npm 11, then
  npm ci
  npm run zip:firefox
The built extension is in .output/firefox-mv3 and the package is .output/chook-check-0.2.0-firefox.zip.

All network features are off by default. To exercise them, open Settings from the toolbar popup and enable a mode; Firefox will prompt for the matching data-collection permission.
```
