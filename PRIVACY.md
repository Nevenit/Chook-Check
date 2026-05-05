# Chook Check Privacy Policy

**Last updated:** 2026-05-05

Chook Check is designed to be private by default. This document describes exactly what the extension does with your data, what is sent to our servers (only when you opt in), and what is never sent at all.

## Default mode: local only

When you first install Chook Check, **nothing is sent anywhere**. The extension:

- Stores price observations from Woolworths and Coles product pages in your browser's local IndexedDB
- Lets you view your own price history, recent observations, and per-product charts
- Generates a random anonymous contributor ID (UUID v4) which is **not used** unless you later opt into contribution

No account, signup, or login is required. No tracking pixels, analytics, or telemetry are loaded.

## Optional: contributing to the community dataset

The extension's value to other users grows with shared data. You can opt in via Settings. When you do, the extension submits your locally-recorded observations to the community API in batches every 5 minutes (and only while contribution is enabled).

### Always shared per observation (when contributing is on)

| Field | Example |
|---|---|
| Product ID | `woolworths:123456` |
| Product name | `Vegemite 380g` |
| Brand | `Vegemite` |
| Category | `Spreads` |
| Store chain | `woolworths` or `coles` |
| Price (cents) | `750` |
| "Was" price (cents) | `900` (when on sale) |
| Unit price (cents) | `1974` per 100g |
| Promo type | `member_price`, `half_price`, etc. |
| Whether it appeared in a personalised "for you" section | `true`/`false` |
| Timestamp of observation | ISO 8601 |
| Contributor ID | random UUID generated on install |

### Optional context (each toggle independent)

| Toggle | Default | What gets added to your submissions |
|---|---|---|
| Share my browser | **On** | `Chrome`, `Firefox`, etc. |
| Share my state | Off | e.g. `VIC`, `NSW` |
| Share my city/region | Off | e.g. `Melbourne` |
| Share my specific store | Off | Free-text store name e.g. `Coles Fitzroy` |
| Link my account | Off | **Currently inert.** The toggle exists but no account-hashing is implemented yet — see *Planned features* below. |

You can change these toggles at any time. Changes apply only to future observations.

## What is never collected

- Real name, email address, password, or any other login credential
- Loyalty card numbers (Everyday Rewards, Flybuys)
- IP address — the API never persists this against observations. IPs are seen transiently by Cloudflare for rate limiting on read endpoints, then discarded.
- Browsing history outside Woolworths/Coles product and search pages
- Cart contents, order history, or anything from your supermarket account
- Any data from non-Woolworths/non-Coles websites

The extension manifest declares only two host permissions: `https://www.woolworths.com.au/*` and `https://www.coles.com.au/*`. The browser will prevent it from accessing any other site.

## Permissions explained

- `storage` — to store observations and settings in the browser's local IndexedDB
- `alarms` — to schedule the periodic batch submission (every 5 minutes when contribution is on)
- Host permissions on Woolworths and Coles only — required to read product pages

## Where your contributed data lives

The community API runs on Cloudflare Workers backed by Cloudflare D1 (SQLite at the edge). Cloudflare's Australian PoPs handle traffic from AU users. The API is open source under AGPL-3.0 at <https://github.com/Nevenit/chook-check-api> — anyone running a modified instance is required to publish their source.

## Your controls

In the extension's Settings page you can:

- **View** all data stored locally
- **Export** your local data as JSON
- **Stop contributing** with one click — submissions stop immediately
- **Delete all local data** — clears IndexedDB
- **Request server-side deletion** — sends a DELETE to the API keyed by your contributor ID; all observations from that ID are permanently removed
- **Read your consent audit log** — every time you toggled contribution or a sub-setting, with timestamp

## Sharing log

Every batch submitted to the API is also recorded in your local sharing log, visible in Settings. You can see exactly what went out and when.

## Anti-gaming measures

- The community API only shows aggregated stats once 3+ distinct contributors have observed a product (crowd quorum)
- The API uses median (not mean) for all aggregates — outlier-resistant by construction
- Rate limits per contributor on submissions

## Planned features (not yet active)

- **Account linking** — hashing your supermarket login email with Argon2id and using the hash as your contributor ID across devices, to detect cross-session personalisation. The UI toggle for this exists but the hashing logic isn't implemented yet, so toggling it currently has no effect on what is sent.
- **Trust scoring and outlier detection** on the API side.

This document will be updated when these features ship.

## Open source

Both the extension and the API are open source. You can read every line of code that handles your data:

- Extension: <https://github.com/Nevenit/Chook-Check> (MIT)
- API: <https://github.com/Nevenit/chook-check-api> (AGPL-3.0)

## Contact

Questions or concerns: file an issue at <https://github.com/Nevenit/Chook-Check/issues> or email <Nevenit@outlook.com>.
