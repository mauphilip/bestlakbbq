# Changelog

All notable changes to bestlakbbq.com are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [semver](https://semver.org/).

## [Unreleased]

### Added
- **Full LA County + OC discovery sweep** — Yelp Discover now covers 27 seed locations grouped by region (LA Core, Valley, South Bay, Gateway, SGV, OC) instead of 8. A new **"Scan all regions"** button runs the sweep in region-sized batches with live progress; on a Yelp rate limit it stops, keeps everything scanned so far (cache TTL bumped 7→30 days), and shows a **Resume scan** for the remaining regions. The whole sweep costs ~50–70 API calls; importing costs zero.
- **One-click bulk import** — "Import all N" imports every confirmed-KBBQ (high-confidence) discovery in a single request via the new `/api/restaurants/bulk-import` route; "likely KBBQ" (medium-confidence) candidates stay listed for manual selection. Imports default to Non-AYCE with the Yelp price-tier midpoint as an estimated cost and are flagged **needs review** for triage. Sub-3★ spots are no longer excluded from import — the quality threshold (below) handles them.
- **Quality thresholds + "Go at your own risk" list** — admin → **Settings** has editable minimum Yelp rating (default 3.0) and minimum review count, with a live preview of which restaurants would be demoted. Spots below the bar move to a collapsed amber **"Go at your own risk (N)"** section at the bottom of the directory (sharing the same filters) and drop off the homepage chart — nothing is deleted. Mark a spot as a ⭐ **Favorite** in its edit form to keep it on the main list regardless (for when a personal favorite sits at 3.5★).
- **Directory filters** — minimum rating (3.5+/4.0+/4.5+), minimum reviews (100/500/1000+), and $–$$$$ price-tier chips; the neighborhood dropdown is now derived from the data so newly imported areas appear automatically.
- **Admin triage tools** — "Needs review (N)" filter chip in Manage, needs-review and ⭐ favorite badges on rows, and Favorite/Needs-review toggles in the edit form.

### Changed
- **Restaurant storage moved to a single Redis hash** — reads are one `HGETALL` instead of `KEYS` + `MGET` (faster and far fewer billed commands at 300+ restaurants). Existing per-key records migrate automatically on first read. Bulk imports land in one round trip. The public restaurants API is CDN-cached for 5 minutes (admin reads bypass it).

### Security
- **Admin tokens are now HMAC-signed with a 7-day expiry** — the old token was reversible base64 that contained the PIN. The PIN check and token check are timing-safe, the "0000" fallback is gone, and the login accepts a long passphrase (recommended: set one in Vercel env). You'll need to log in again once after deploying.
- **Login rate limiting** — 5 wrong attempts per IP locks admin login for 15 minutes.
- **Visit log locked down** — adding/editing/deleting visits now requires being logged in as admin (the /visited page hides edit controls otherwise). Previously anyone on the internet could write to it.
- **Yelp proxy locked down** — `/api/yelp` (used by the admin form's Find-on-Yelp) now requires the admin token; it was previously an open endpoint anyone could use to burn the daily Yelp quota.
- **Input validation everywhere** — restaurant and visit mutation bodies are whitelisted and type-checked (`lib/validate.ts`); ids are constrained since they become Redis keys.

### Added
- **Yelp Connector subtab** (Manage → Yelp Connector) — shows live connection status and remaining daily Yelp API quota (a colored bar, reset time, low-quota warning), so you can see where you stand before a big Sync/Discover.
- **Editable neighborhood ↔ zip map** (Neighborhoods tab) — the whole zip→neighborhood map now lives in the database as one editable source of truth (replacing the hardcoded map + overrides). Two views (grouped by neighborhood, and a flat zip list), full CRUD, and multi-select bulk assign/delete (e.g. assign several zips to Koreatown at once). Yelp Discover classifies neighborhoods from this map.

### Changed
- **Per-row "Re-check" in Sync from Yelp** — re-check a single restaurant against Yelp (one call) right after you edit/relink it, instead of re-running the whole sync. The row updates in place.
- **Better rate-limit message** — when Yelp returns 429 it now reports *when it resumes* using Yelp's own reset/retry headers, and points to the Yelp Connector for your remaining quota (which reflects your actual daily limit, e.g. a higher trial limit).
- Neighborhoods flat list sort is now **Zip ascending / descending** (the by-neighborhood option was confusing — grouping already lives in the Grouped view).
- **Fewer Yelp API calls.** The Yelp Connector no longer auto-pings Yelp every time you open it — it shows the last cached quota and only spends an API call when you click "Check now / Refresh." (Sync, Discover-refresh, and the form's Find/Sync remain user-triggered; opening Discover only reads the cache.)
- **Neighborhoods tab polish:** removed the redundant "Zip → Neighborhood map" header; grouped view is now a compact, responsive card grid; flat list has a **sort by Zip / Neighborhood** toggle (Zip ascending by default).
- **Unified "Sync from Yelp"** — the separate "Check Closed" and "Sync Updates" tools are now one pass. It surfaces data updates to apply (bulk, multi-select), Yelp-confirmed closures to remove (per-row Delete, **never auto-selected**), and broken links to fix. Also fixes stale cached counts lingering between the two old tools.
- **Applied sync rows now drop off** (and stay off after reload) instead of lingering as "Applied" — so the counts reflect only what's still pending, with an "N applied" chip and a clean "everything up to date" default.
- **Sync rows are now actionable in place** — every row (updates / closed / broken-link) has an **Edit** button that opens the restaurant to relink via Find on Yelp, and broken-link rows have a per-row **Delete** (manual + confirm) so you can remove one that's truly gone without leaving the tool. Bulk/auto deletion is still limited to Yelp-confirmed closures.

### Added
- **Delete button on the restaurant edit form** — soft-deletes base-JSON restaurants, hard-deletes admin-added ones (you no longer have to delete only from the list row).

### Removed
- **The bulk "Re-link from Yelp" tool** (and its API route). It was one-time scaffolding to link the imported data; once restaurants are linked it started re-proposing bad changes against manual fixes (and cached stale results). Link/fix individual restaurants via the edit form's **Find on Yelp**; use **Sync Updates** + **Check Closed** as the steady state.

### Fixed
- **Yelp rate-limit (429) is handled honestly.** The sync no longer mislabels rate-limited responses as "Yelp returned no data" for every restaurant — it slows the request rate to stay under Yelp's QPS limit and, if the limit is hit, stops and shows a clear "rate limit — try again shortly" message instead of corrupting the results.
- Fixed the missing space in the "N couldn't be checked" sync label.
- **Yelp Connection in the edit form is now one section** — the separate "Yelp URL" field is merged in. Pasting a URL + **Sync** (or picking a Find-on-Yelp result) now pulls the latest rating/reviews/price, so unlinking and relinking refreshes the data.
- **Sync no longer fails on a stale `yelp_id`.** If a restaurant's stored Yelp id is dead (e.g. the URL was changed but the old id stuck), the sync now falls back to the URL slug, so it fetches real data instead of "Yelp returned no data" — and surfaces a one-click "fix stale ID" so applying updates rewrites the id to the correct business. The edit form also clears a stale id when you change the Yelp URL, preventing the mismatch.
- Closure check: clarified the "couldn't be checked" warning (was mislabeled as a closure and pointed the wrong way) — it now explains the Yelp link is stale/missing and to run **Re-link from Yelp** first, then re-check.
- **Re-link no-match / low-confidence rows now actually show up to process.** They were being wrongly hidden because a restaurant with a *stale* Yelp URL counted as "linked"; rows now only drop off once their link genuinely changes (you re-linked it) or they're deleted.
- **Re-link now covers admin-added (KV-only) restaurants**, not just the base JSON list — so restaurants you added that have no Yelp ID finally appear (matches what Sync Data reports).
- Re-link no longer flags an already-linked restaurant as "no match" just because the name search was inconclusive (it's left alone as "already correct"), and a genuine no-match row no longer gets wrongly hidden when the restaurant already had a Yelp id — so you can always see/act on what the no-match actually is.
- Re-link only matches **food/Korean/BBQ businesses** now — it can no longer link to a same-named non-restaurant (e.g. an insurance agency).

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
