---
type: plan
title: "Source-Specific Pipeline Tabs (Client Mobile App)"
status: draft
tags: [plan, feature]
plan_kind: feature
created: "2026-05-24T14:32:21.000Z"
source: "docs/build-plans/Client Mobile App/source-pipeline-tabs.md"
---

# Source-Specific Pipeline Tabs (Client Mobile App)

## Goal

Add four top-level tabs to the client PWA so each lead-source funnel has its own dedicated view, stats, and stages, rather than every lead landing in one unified Opportunities pipeline. Each tab maps 1:1 to a GHL pipeline.

The four new tabs:

1. **Google Reviews** (Google Review Campaign)
2. **DBR** (Database Reactivation)
3. **Live Chat**
4. **Meta Ads**

## Decision: pipelines, not source strings

Each tab is backed by its own GHL pipeline. Filtering uses `pipeline_id` (stable IDs), not the `source` string field.

| Why | |
|---|---|
| Stable IDs | Pipeline IDs do not change; source strings get typos and depend on which form/widget created the lead. |
| Per-funnel stages | Google Reviews needs `Asked / Responded / Reviewed`; DBR needs `Outreach / Replied / Booked / Reactivated`; Meta needs the normal sales funnel. One global stage set does not fit all four. |
| No double-counting | Opportunities live in exactly one pipeline. Source-based filters can match multiple values by accident. |
| Already supported | GHL's `/opportunities/search?pipeline_id=X` is the canonical query. Backend already shapes `pipelineStageId` per lead. |

## What already exists

- `client-dashboard/functions/api/leads/index.ts` — calls GHL `/opportunities/search?location_id=...&limit=100`. Pulls everything in the default pipeline.
- `client-dashboard/functions/lib/ghl.ts` — `shapeOpportunity()` flattens GHL responses to `ApiLead`. Already includes `pipelineStageId`. Drops `source` (currently unused).
- `client-dashboard/functions/api/pipeline.ts` — fetches a single pipeline's stage list. Will need to be extended or duplicated per-pipeline.
- `client-dashboard/src/components/ViewTabs.tsx` — sticky top nav with 3 tabs. New tabs go here.
- `client-dashboard/src/routes/Dashboard.tsx` — the current "Opportunities" view. Pattern to copy for the 4 new routes.
- `client-dashboard/src/context/LeadsContext.tsx` — single leads list shared across views. Will need per-pipeline awareness.

What is **not** built yet:

- Multi-pipeline awareness in the backend or context layer.
- Per-pipeline route components.
- Per-pipeline stats (response rate, reactivation rate, lead-to-booking, etc.).
- Meta Ads Graph API endpoint inside the PWA's Cloudflare functions.
- Per-client config storing the 4 pipeline IDs.

## Architecture

### Config

Each client needs four pipeline IDs stored somewhere the PWA backend can read. Two options:

- **Option A (recommended):** add columns to the `tenants` Supabase table: `pipeline_google_reviews_id`, `pipeline_dbr_id`, `pipeline_live_chat_id`, `pipeline_meta_ads_id`. Admin form in `/admin` lets Jake set them per client.
- **Option B:** mirror the Tauri app's `clients.yaml` pattern. Worse — Cloudflare functions cannot read repo files at runtime, so we would need to bake them into env vars or duplicate to Supabase anyway.

Go with A.

### Backend

New endpoint: `GET /api/pipelines/:slug/leads`

- `:slug` is one of `google-reviews`, `dbr`, `live-chat`, `meta-ads`.
- Middleware resolves slug → pipeline ID via the tenant row.
- Calls `/opportunities/search?pipeline_id=X&location_id=Y&limit=100`.
- Returns `{ leads, stages, total }`. Stages come from `/pipelines/:id` so the UI knows what stages exist in *this* pipeline.

Refactor `functions/api/leads/index.ts` to use the same helper, with the default pipeline as fallback. The current Opportunities tab keeps working unchanged.

### Frontend

New context: `PipelineLeadsContext` (or extend `LeadsContext` to be pipeline-aware).

- Holds `Record<PipelineSlug, { leads, stages, loading, error }>`.
- Fetches lazily — only loads a pipeline's data when its tab is visited.
- Each tab subscribes to its own slice.

New routes:

- `client-dashboard/src/routes/GoogleReviews.tsx`
- `client-dashboard/src/routes/Dbr.tsx`
- `client-dashboard/src/routes/LiveChat.tsx`
- `client-dashboard/src/routes/MetaAds.tsx`

Each route is a thin shell over a shared `<PipelineView slug="..." />` component that handles the stats strip, stage filter, search, and lead list. Per-funnel stats are configured per slug:

| Tab | Headline stats |
|---|---|
| Google Reviews | Reached out · Responded · Reviewed · Response rate % |
| DBR | Reached out · Replied · Booked · Reactivated · Reply rate % |
| Live Chat | New messages · Qualified · Booked · Won · Conversion % |
| Meta Ads | Spend · Leads · CPL · Booked · ROAS (spend + CPL + ROAS come from Meta Graph API; rest from GHL) |

### Tab placement

Top-level tabs in `ViewTabs.tsx`. Order:

```
Conversations · Contact Status · Opportunities · Google Reviews · DBR · Live Chat · Meta Ads
```

Make the tab row horizontally scrollable (`overflow-x-auto`, `scroll-snap-type: x mandatory`) so 7 tabs fit on a phone. Active tab scrolls into view on mount.

### Meta Ads KPIs

New endpoint: `GET /api/meta/insights?account_id=X&since=...&until=...`

- Cloudflare function calls `graph.facebook.com/v19.0/act_<id>/insights` with the System User token (stored as a Cloudflare secret: `META_SYSTEM_USER_TOKEN`).
- Returns `{ spend, impressions, clicks, leads, cpl, roas? }`.
- Per-client `meta_ad_account_id` lives on the same tenant row as the pipeline IDs.
- Cache 5-min in Cloudflare's edge cache to avoid rate-limit churn.

ROAS needs revenue data. For v1, compute ROAS as `(won pipeline value from Meta Ads pipeline) / spend`. Won value is already in GHL.

## Open question (decide before building)

**Does the existing "Opportunities" tab stay?**

- **Keep:** unified "All leads across all pipelines" view. Simpler mental model for new users, but means we are fetching from 5 pipelines on dashboard load.
- **Retire:** the 4 source tabs *are* the dashboard. Cleaner, but loses the "everything in one place" view.

Recommendation: keep it, but lazy-load each pipeline so the unified view only fetches on demand.

## Implementation plan

Order matters. Each step ships independently.

### Phase 1 — Backend foundation
1. Add 4 nullable columns to `tenants` table (Supabase migration): `pipeline_google_reviews_id`, `pipeline_dbr_id`, `pipeline_live_chat_id`, `pipeline_meta_ads_id`, plus `meta_ad_account_id`.
2. Extend tenant middleware (`functions/lib/tenant.ts`) to expose the new fields.
3. Build `GET /api/pipelines/:slug/leads` in `functions/api/pipelines/[slug]/leads.ts`. Resolves slug → pipeline ID, calls GHL twice (opportunities + stages), returns shaped response.
4. Add admin form in `/admin` route to set the 5 IDs per client.

### Phase 2 — Tab scaffolding
5. Extend `LeadsContext` (or split into `PipelineLeadsContext`) for per-pipeline data slices.
6. Add 4 routes + register in `App.tsx`.
7. Update `ViewTabs.tsx`: 7 tabs, horizontal scroll, active-tab-into-view on mount.
8. Build shared `<PipelineView>` component. Each route is a 3-line wrapper.

### Phase 3 — Per-funnel stats
9. Per-slug stats config (`lib/pipelineStats.ts`): function `(leads, stages) => StatCard[]` for each slug.
10. Replace the generic `StatsStrip` content per route.

### Phase 4 — Meta Ads KPIs
11. Add `META_SYSTEM_USER_TOKEN` Cloudflare secret.
12. Build `GET /api/meta/insights` endpoint.
13. Wire spend / CPL / ROAS into the Meta Ads route's stats strip.

### Phase 5 — Polish
14. Empty states per tab ("No Google Review outreach yet — let's start a batch").
15. Conversations tab: add an optional pipeline filter so a client can see "Live Chat conversations only" if useful.
16. PWA manifest: no changes needed.

## What Jake needs to do (in GHL, before Phase 1 ships)

1. Open GHL → Settings → Pipelines.
2. Create (or rename) 4 pipelines:
   - **Google Review Campaign** with stages: Asked → Responded → Reviewed → Ignored
   - **Database Reactivation** with stages: Outreach → Replied → Booked → Reactivated → Dead
   - **Live Chat** with stages: New Message → Qualified → Booked → Won → Lost
   - **Meta Ads** with stages: matches current sales funnel (probably already exists)
3. For each pipeline, copy the ID from the URL (`/pipelines/PIPELINE_ID/edit`).
4. Confirm each client's Meta ad account ID is available (already in `clients.yaml`, just need to mirror to Supabase).
5. Send the 4 pipeline IDs + Meta ad account ID per client over to Claude when ready to implement.
6. Decide: keep the unified "Opportunities" tab, or retire it? (Recommendation: keep, lazy-load.)
