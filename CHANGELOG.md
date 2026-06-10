# Changelog

All notable changes to bestlakbbq.com are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [semver](https://semver.org/).

## [Unreleased]

### Fixed
- Closure check: clarified the "couldn't be checked" warning (was mislabeled as a closure and pointed the wrong way) — it now explains the Yelp link is stale/missing and to run **Re-link from Yelp** first, then re-check.
- **Re-link no-match / low-confidence rows now actually show up to process.** They were being wrongly hidden because a restaurant with a *stale* Yelp URL counted as "linked"; rows now only drop off once their link genuinely changes (you re-linked it) or they're deleted.
- **Re-link now covers admin-added (KV-only) restaurants**, not just the base JSON list — so restaurants you added that have no Yelp ID finally appear (matches what Sync Data reports).

## [0.3.0] — 2026-06-09

### Added
- Optional **Website** field on restaurants — set it in the admin form; shown as a 🌐 link in the directory list, the chart's "Premium / not on chart" panel, and the edit form. (Yelp's API doesn't expose a business's own site, so it's entered manually.)

### Changed
- **Multi-tier AYCE restaurants now plot at the _average_ of their tiers** (was the cheapest tier); the tooltip shows the full range and the plotted average. Updated the homepage/FAQ copy to match.
- Re-link "needs a manual check" rows now **drop off automatically once linked or deleted** — no rescan required.
- Removed the up/down spinner arrows from the AYCE tier / non-AYCE price inputs.
- **FAQ** now spells out the per-person cost calculation (AYCE tier average, non-AYCE estimate, tier-midpoint fallback) and the `$ / $$ / $$$ / $$$$` → dollar-range mapping.
- **Dev workflow documented** (`CONTRIBUTING.md` / `AGENTS.md`): branch-per-feature, merge-to-`main`-deploys-to-production, tag releases only on explicit request.

## [0.2.0] — 2026-06-09

### Added
- **Shared Yelp library** (`lib/yelp-shared.ts` pure / `lib/yelp-server.ts` server-only) — one slug parser, one KBBQ-confidence function, one Yelp→Restaurant mapping, consumed by every Yelp route and component.
- **Re-link from Yelp** admin tool — searches Yelp by name for every restaurant and fixes stale/guessed links; preview → apply, results cached, with **Link manually** and **Delete** for the ones that need a human.
- **Yelp Connection** section in the restaurant form — "Find on Yelp" to link, or "Open on Yelp" when connected; `yelp_id` is now persisted.
- **Bottom FAQ accordion** on the homepage (how-to-read + about-the-data), with reconciled cost-tier legend.
- **"Needs price check" filter** in the Manage list.
- Safe Yelp-search fallback so chart restaurant clicks never 404.

### Changed
- **Admin consolidated to 3 tabs** (Manage · Search & Add · Neighborhoods); the standalone "Yelp Import" tab was split into reusable pieces and retired.
- **Manage** split into **Restaurants** and **Yelp Sync** subtabs.
- **Discover** confidence filter is now independent **High / Likely** toggle chips (was a 3-way radio).
- **Closure check** separates genuinely-closed from unreachable (stale-link) restaurants; all closed rows are now deletable (base-JSON via soft-delete).

### Fixed
- Restaurants added from Search now capture `yelp_id` (previously saved **unlinked**).
- Chart restaurant clicks no longer 404 (canonical Yelp URL, else a name search).
- Removed the stray focus outline / text selection when clicking the chart.
- Soft-deleted restaurants are no longer re-reported by the closure check.

### Removed
- "Link Unlinked" tool (superseded by Re-link).
- The `KV` row badge, the old "Sync from Yelp" header button, and the "View as list" link.

## [0.1.0] — 2026-06-08

### Added
- Interactive Cost vs. Popularity scatter chart with AYCE/Non-AYCE toggle and neighborhood filter
- Restaurant directory with sortable columns (cost, rating, value score, review count)
- "Value Pick" badge for high-rating, low-cost restaurants
- "Beat the Restaurant" calculator — compare meat eaten vs. Costco/H-Mart retail prices
- Seeded LA KBBQ restaurants with Yelp links, AYCE tier breakdowns, and last-price-check dates
- Hidden blog at `/x/blog` (not linked in nav)
- PIN-protected admin at `/x/admin` (search Yelp, add/edit restaurants, Vercel KV storage)
- Multi-domain routing: `bestlakbbq.com` → chart, `socal.food` → Yelp Collections
- Dark-first design with orange fire accent color
