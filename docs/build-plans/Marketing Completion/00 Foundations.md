# 00 Foundations: shared infrastructure

The Marketing pages reuse the same handful of connections. Build these once and most pages light up. Each page doc points back to the items here by name.

---

## F1. Per-tenant external account IDs

**Problem:** the client backend (`command-center/app/functions/`) reads a tenant from Supabase with `ghl_location_id` and `ghl_token`, but has nowhere to store the IDs the other integrations need.

**Work:** one Supabase migration adding nullable columns to `tenants`:

| Column | Feeds |
|---|---|
| `meta_ad_account_id` | Paid Ads, Social engagement |
| `meta_system_user_token` (or shared agency token) | Paid Ads, Social |
| `google_business_location_id` | Reviews |
| `ga4_property_id` | Website analytics |
| `ghl_pipeline_ids` (json: paid-ads, sales, reactivation) | Leads, attribution |

**Note:** the admin app already holds Meta account IDs in `clients.yaml`. Decide whether the client backend reads from Supabase (preferred, one source of truth) or shares the admin config. Recommended: migrate the values into `tenants` so the client app is self-contained.

---

## F2. Meta Ads API client (port from admin)

**Status:** a real `graph.facebook.com` integration already exists in the **admin** app (AdsManagerPage, System User token, per-client `meta_ad_account_id` in `clients.yaml`). It does **not** exist in the client `command-center` backend. There is no Meta client in `functions/lib/`.

**Work:** add `functions/lib/meta.ts`, a thin fetch wrapper mirroring `functions/lib/ghl.ts`:

- `metaFetch(path, params)` against `graph.facebook.com/v18.0`, auth via the System User token.
- Helpers for the calls the pages need:
  - `GET /{ad_account}/campaigns` (active campaigns)
  - `GET /{ad_account}/ads?fields=id,name,status,creative` (Your Ads)
  - `GET /{ad_id}/adcreatives` (thumbnails, headline, copy)
  - `GET /{ad_id}/insights?fields=spend,impressions,reach,actions` (spend, leads, reach, by platform, by day/hour)

**Reuse:** lift the field lists and token handling straight from the admin AdsManagerPage so behaviour matches.

**Unblocks:** all of Paid Ads; the reach/engagement numbers in Social.

---

## F3. GHL module clients (extend `functions/lib/ghl.ts`)

`functions/lib/ghl.ts` today covers opportunities, conversations, contacts, and custom fields. The Marketing pages need three more GHL surfaces added:

- **Campaigns / bulk messaging:** send SMS/email to a list via `/conversations/messages`, plus delivery/open/reply webhooks. (Campaigns area.)
- **Social Planner:** `GET/POST /social-planner/posts` for scheduled and published posts, account connection state. (Social area.)
- **Reputation:** GHL's review fetch + review-request endpoints, if used instead of Google direct. (Reviews area.)
- **Contact search by segment:** `/contacts/search` with tag/custom-field filters, for Audiences.

**Unblocks:** Campaigns, Social, Reviews, Audiences.

---

## F4. Attribution system (the big one)

**This is the most reused gap and the one with the most business value.** It answers: *how do we know a booked job came from a specific ad or campaign?*

Every "What's working" page and every "Jobs booked" KPI (Paid Ads, Campaigns, Reactivation, Social) depends on it. GHL does not track source-to-revenue natively, so this must be designed, not just called.

**Design:**

1. **Tag at send / capture at entry.** When a campaign goes out, every recipient gets a tag like `campaign:reactivation-2026-06`. When a paid lead enters, stamp the ad source on the contact (via webhook custom field). Reactivation already implies a GHL "Database Reactivation" pipeline.
2. **Watch the opportunity.** When a tagged contact's opportunity reaches Won (booked job), credit the source that tagged them, within an attribution window (e.g. 30 days).
3. **Persist the link.** Supabase `attributions` table: `contact_id`, `source_type` (ad | campaign | reactivation | review | social), `source_id`, `opportunity_id`, `revenue`, `attributed_at`. Populated by a GHL opportunity webhook.
4. **Read it back.** Each insights endpoint queries `attributions` grouped by source for "jobs booked" and "revenue from X."

**Signals to stack** (none is perfect alone): contact tags, a dedicated call-tracking number per channel (see F7), reply threads tied to the tagged contact, and a "how did you hear about us" field as the human catch-all.

**Open question for Jake:** what attribution window and what tie-break rule when a contact got multiple touches (last-touch vs first-touch). Recommend last-touch within 30 days to start.

**Unblocks:** Paid Ads Insights + Leads "from ad", all Campaigns results, Reactivation funnel, Social Insights.

---

## F5. Google Business Profile API (reviews)

For real Google review data and replies (the All Reviews and Overview pages):

- `GET /accounts/{acct}/locations/{loc}/reviews` (rating, text, author, date).
- `PUT .../reviews/{id}/reply` (post a reply).
- OAuth + a stored per-tenant `google_business_location_id` (F1).

**Alternative:** GHL's reputation module already aggregates Google reviews and may be simpler than going direct to Google. Decide F5-direct vs GHL-reputation in the Reviews doc.

**Unblocks:** Reviews Overview, All Reviews, Reviews Insights.

---

## F6. Website analytics (GA4)

For the Website Overview and Insights pages (visitors, sources, top pages, trend):

- GA4 Data API, per-tenant `ga4_property_id` (F1), service-account auth.
- One endpoint `/api/website/analytics` returning visitors, source breakdown, top pages, 12-month trend.

**Open question:** are client sites on GHL funnels (which expose their own analytics) or do they have GA4? If GHL-hosted, prefer GHL funnel analytics and skip GA4.

**Unblocks:** Website Overview, Website Insights, page view counts.

---

## F7. Call-tracking numbers (optional but high value)

The strongest signal for call-in attribution. A dedicated tracked number per channel (reactivation, paid ads) means every call to it is provably from that source. GHL supports call tracking. Feeds F4. Not required to ship the pages, but required for trustworthy call attribution.

---

## Supabase tables introduced across the plan

One place to see every new table. Details in the area docs.

| Table | Area | Purpose |
|---|---|---|
| `attributions` | shared (F4) | source to opportunity to revenue links |
| `campaigns` | Campaigns | created/scheduled/sent campaigns |
| `campaign_sends` | Campaigns | per-recipient send + status |
| `campaign_results` | Campaigns | opened/replied/clicked/converted events |
| `audiences` | Campaigns | saved segments + criteria |
| `templates` | Campaigns | reusable SMS/email templates |
| `posts` | Social | drafts/scheduled/published posts |
| `post_ideas` | Social | generated ideas |
| `post_engagement` | Social | per-post calls/reach/messages |
| `website_change_requests` | Website | pin-note change requests + status |
| `google_reviews` | Reviews | cached reviews |
| `review_replies` | Reviews | posted replies |

RLS scoped to `tenant_id` on every table, matching existing migrations.

---

## Suggested build order (whole section)

1. **F1** account IDs migration + **F4** attribution skeleton (`attributions` table + opportunity webhook). Highest leverage.
2. **F2** Meta client, then **Paid Ads** (closest to done, prior art exists).
3. **F3** GHL campaigns client, then **Campaigns** (Reactivation first, it is the active play).
4. **Reviews** (one page already live; add Google connection).
5. **Website** (small surface; change-requests table + admin inbox is self-contained and quick).
6. **Social** (largest backend lift; do last).
