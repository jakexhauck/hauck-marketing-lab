# 01 Paid Ads

Routes: `command-center/app/src/routes/paid-ads/` — `AdsOverview`, `AdsCreatives`, `AdsLeads`, `AdsInsights`, `shared.tsx`.
Demo data: `routes/paid-ads/shared.tsx` (`DEMO_ADS`, `DEMO_LEADS`, `DEMO_WEEKLY`).

**Area status:** 4 pages, all fully designed, all demo-only. Closest area to "done" because a working Meta integration already exists in the admin app and only needs porting (Foundations **F2**).

**Area-wide dependencies:** F1 (account IDs), F2 (Meta client), F4 (attribution, for "from ad" and "jobs booked"), GHL leads via existing `/api/leads`.

**The one hard problem:** GHL does not record which Meta ad produced a lead. Until that is wired (F4 + a Meta-to-GHL webhook that stamps `ad_id`), the "From ad" column and per-ad lead counts cannot be real. Decide this before building AdsLeads/AdsInsights.

---

## Page: Overview (`/marketing/paid-ads`)

**Current:** designed; demo shows 6 KPI tiles, weekly-leads bar chart, "running now" list, boost nudge. Real session zeroes everything (`ZERO`) + `NotConnectedNotice`.

**Information needed:** ad spend, new leads, cost per lead, new customers, revenue from ads, return (ROAS), weekly lead counts, list of currently-running ads with per-ad lead counts.

**Connections:** Meta Ads API (spend, active campaigns), GHL Paid-Ads pipeline (lead counts), F4 attribution (customers + revenue from ads).

**APIs / endpoints to build:**
- `GET /api/ads/overview` aggregating: Meta `insights` (spend, reach) + GHL opportunities in the paid-ads pipeline counted by week + `attributions` (customers, revenue).

**Backend:** new `functions/api/ads/overview.ts`; uses `functions/lib/meta.ts` (F2) and existing `functions/lib/ghl.ts`. Cache per tenant (Meta calls are slow/rate-limited).

**Open questions:** revenue from ads requires F4; without it, show spend + leads + CPL only and hide the revenue/return tiles until attribution lands.

---

## Page: Your Ads (`/marketing/paid-ads/creatives`)

**Current:** designed; demo gallery of 4 ads (headline, copy, platforms, active flag, leads, reach, gradient thumbnail). Real session = empty state.

**Information needed:** per ad: creative thumbnail (real image/video), headline, primary text, status (active/paused), platforms, leads, reach.

**Connections:** Meta Ads API only.

**APIs / endpoints:**
- `GET /api/ads/creatives` → Meta `GET /{account}/ads?fields=id,name,status,creative`, then `/{ad_id}/adcreatives` for image/video URLs, then `/{ad_id}/insights` for leads + reach.

**Backend:** `functions/api/ads/creatives.ts`. Map Meta status (`ACTIVE`/`PAUSED`/...) to the UI's `active` boolean. Replace the CSS-gradient placeholders with real creative URLs.

**Open questions:** none blocking. Pure Meta read. This is the best first page to ship once F2 exists.

---

## Page: Leads (`/marketing/paid-ads/leads`)

**Current:** designed; demo shows a summary strip + table (Name, When, How [call/form], From ad, Status bucket). `shared.tsx` already defines `LEAD_BUCKET` and a `STAGE_TO_BUCKET` map, but the map is unused.

**Information needed:** per lead: name, created time, contact method (call vs form), which ad, pipeline-stage-as-friendly-bucket.

**Connections:** GHL opportunities (the lead list + stage); F4 / a Meta-to-GHL webhook (the "from ad" link); contact method.

**APIs / endpoints:**
- `GET /api/ads/leads` → reuse the existing GHL opportunity fetch (`/api/leads` logic), scoped to the paid-ads + sales pipelines and a date range; resolve each `pipelineStageId` through `STAGE_TO_BUCKET`.

**Backend:** `functions/api/ads/leads.ts` (or extend `/api/leads` with a `source=ads` filter). Wire up the existing-but-unused `STAGE_TO_BUCKET`.

**Open questions (decide before building):**
- **"From ad" column:** needs `ad_id` on the contact. Options: Meta Lead Ads webhook into GHL that sets a custom field; or manual tagging. No native source.
- **"How" (call vs form):** not a GHL field. Infer (phone-only entry to call, form submission to form) or set via webhook custom value.

---

## Page: What's working (`/marketing/paid-ads/insights`)

**Current:** designed; 100% hardcoded. Best ad bar chart, leads-vs-last-month delta + sparkline, platform split (IG vs FB), best-time-to-reach weekday chart.

**Information needed:** ads ranked by leads; this-month vs last-month leads delta; lead split by platform; performance by day/hour.

**Connections:** Meta insights (ranking, platform split, day/hour) + F4 (lead attribution per ad/platform).

**APIs / endpoints:**
- `GET /api/ads/insights` → Meta `insights` for all active ads ranked by leads; `insights` broken down by `publisher_platform` (IG vs FB) and by `hourly_stats_aggregated_by_advertiser_time_zone` for best-time. Month-over-month delta via two `time_range` calls (an `adsData.ts` `delta()` helper already exists).

**Backend:** `functions/api/ads/insights.ts`.

**Open questions:** "where most leads came from" by platform needs platform attribution on the lead, which Meta insights gives at the ad level but not per individual GHL lead. Use Meta's platform breakdown for the chart and label it as ad-delivery, not per-booked-lead, to stay honest.

---

## Area build order

1. F2 Meta client. 2. **Your Ads** (pure Meta read, no attribution needed). 3. **Overview** (Meta + GHL counts). 4. F4 attribution + Meta-to-GHL `ad_id` webhook. 5. **Leads** and **Insights** (both need the ad-source link).
