# Marketing Section: Completion Plans

What it takes to move every page in the client app's **Marketing** section from "designed, running on demo data" to "showing real live client data."

## The one-line truth

Every Marketing page is **fully designed and styled**. In demo mode (`?demo=1`) they render hardcoded sample data. In a real client session they show a "not connected yet" notice and zeroed stats. The design work is done. What is missing is the **plumbing**: backend endpoints, Supabase tables, and the external API connections (Meta, GHL modules, Google) that feed real numbers in.

**One page is already live:** Ask for Reviews (`/marketing/reviews/requests`) runs on a real GHL endpoint today. Everything else is demo-only.

## How these docs are organised

Most pages depend on the same small set of shared connections. Rather than repeat that in 23 page sections, the shared work lives in one place and each page references it.

| Doc | Covers |
|---|---|
| [00 Foundations.md](00%20Foundations.md) | Shared infrastructure every area needs: Meta Ads client, GHL module clients, the attribution system, Supabase tables, Google Business Profile, analytics, call tracking. **Read this first.** |
| [01 Paid Ads.md](01%20Paid%20Ads.md) | Overview, Your Ads, Leads, What's working |
| [02 Campaigns.md](02%20Campaigns.md) | Overview, Campaigns, Reactivation, Audiences, Templates, What's working |
| [03 Google Reviews.md](03%20Google%20Reviews.md) | Overview, Ask for Reviews (LIVE), All Reviews, What's working |
| [04 Website.md](04%20Website.md) | Overview, Pages, Request a Change, What's working |
| [05 Social Media.md](05%20Social%20Media.md) | Overview, Ideas, Calendar, My Posts, What's working |

Each page section answers the four things you asked for:
**What information** the page needs, **what connections**, **what APIs/endpoints**, and **what backend** (functions + Supabase) is required to completely finish it.

## Status at a glance

| Area | Pages | Live now | Demo-only | Primary connection needed |
|---|---|---|---|---|
| Paid Ads | 4 | 0 | 4 | Meta Ads API (port from admin) + GHL leads |
| Campaigns | 6 | 0 | 6 | GHL campaigns/conversations + attribution |
| Google Reviews | 4 | 1 | 3 | Google Business Profile API (or GHL reputation) |
| Website | 4 | 0 | 4 | Analytics (GA4) + Supabase change-requests table |
| Social Media | 5 | 0 | 5 | GHL Social Planner + Claude + Meta insights |

## What unblocks the most pages

Ranked by leverage. Detail in [00 Foundations.md](00%20Foundations.md).

1. **Attribution system** (contact tags to opportunities to revenue). Unblocks every "What's working" page and the "Jobs booked" KPI across Paid Ads, Campaigns, and Reactivation. This is the single most reused gap, and it is the answer to "how do we know that lead came from a reactivation campaign."
2. **Meta Ads client in the command-center backend.** A working Meta integration already exists in the admin app (`clients.yaml` + System User token). It needs porting into `command-center/app/functions/`. Unblocks all of Paid Ads and the engagement half of Social.
3. **GHL module clients.** Extend `functions/lib/ghl.ts` with Campaigns, Social Planner, and Reputation endpoints. Unblocks most of Campaigns, Social, and Reviews.
4. **Per-tenant external account IDs.** `meta_ad_account_id`, Google Business `location_id`, GA4 `property_id` need a home on the tenant record. One migration.

## A note on honesty

A few pages promise things that no upstream system currently tracks. The biggest: **which ad or campaign brought in a given lead.** GHL does not record that natively. Closing it needs a deliberate tagging/webhook design, not just an API call. Those gaps are called out per page as **Open questions** so they are decided on purpose, not discovered late.
