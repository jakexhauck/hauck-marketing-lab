# Website page — connections

The client-facing Website section (`/marketing/website/*`), one responsive
surface, four tabs. Storefront direction: the client's live site is the hero.

## What is real (2026-07-05)

| Surface | Source | State |
| --- | --- | --- |
| Overview: site preview + "View live site" | `tenants.website_url` (per client) | REAL once URL set |
| Overview: KPIs / top pages / sources | GA4 Data API | REAL once GA4 property set |
| Pages tab | GHL funnels API (`type=website`) | REAL |
| Request a Change | Supabase `website_change_requests` | REAL |
| What's working (Insights) | GA4 Data API | REAL once GA4 property set |

Demo (`?demo=1`) still renders the full fabricated storefront (`SiteMock` + sample
numbers). Nothing fabricated ever shows to a real client.

## Data flow

- Site URL: set per client in Admin > client detail > "Website". Stored on
  `tenants.website_url` (migration 0024), returned by `GET /api/tenant` as
  `websiteUrl`, read through `useClient().client.websiteUrl`. Rendered as a real
  preview via `LiveSiteFrame` (an iframe, pointer-events off so it reads as a
  preview and lets the Request canvas capture pin clicks over it). Admin PATCH
  normalizes bare domains to https:// and rejects non-http(s) schemes.
- Change requests: `GET/POST /api/website/requests` (functions/api/website/
  requests/index.ts), scoped to the session tenant, service-role only (RLS on,
  no policies). Client reads/writes through `useWebsiteRequests`. Rows are the
  shared source of truth the future admin mirror will read (transparent sync).

## Analytics (GA4) — DONE 2026-07-05

Overview KPIs (visitors + delta, page views, avg time on site, top page), Top
pages, Traffic sources, and the whole Insights tab now read real GA4 numbers.

- Auth: `functions/lib/ga4.ts` signs a JWT with the agency service account
  (`GA4_SA_JSON`, one shared secret in Doppler + CF), exchanges it for an
  `analytics.readonly` access token (cached ~55 min in the isolate), and calls
  the Data API with `fetch` (no googleapis SDK, which does not run on Workers).
- Endpoint: `GET /api/website/analytics` (`functions/api/website/analytics.ts`)
  resolves `tenants.ga4_property_id` (per client, `GA4_PROPERTY_ID` env as the
  single-tenant fallback), runs one `batchRunReports` (trend by `yearMonth`,
  this-month KPIs, top `pagePath`, `sessionDefaultChannelGroup`), shapes them,
  and caches the result ~15 min per property in KV. Missing key/property or any
  GA4 error returns `{ connected: false }` and the tabs keep their empty state.
- Property id: set per client in Admin > client detail > "Website analytics
  (Google Analytics)". Digits only; empty clears it. Willis = `544141225`.
- Frontend: `useWebsiteAnalytics` feeds `WebsiteOverview` + `WebsiteInsights`.
- Gap (unchanged): the demo "Leads from your site" KPI has no GA source (GA does
  not know CRM leads); the real Overview swaps that tile for "Page views" and
  drops the fabricated Insights narrative cards. A real "leads from site" tile
  could later come from GHL contacts tagged with a website source.

- ~~Pages list~~ DONE 2026-07-03. `GET /api/website/pages` reads the client's
  GHL Sites (`GET /funnels/funnel/list`), keeps only funnels with
  `type === "website"`, and flattens their steps into pages (name + path,
  ordered by sequence). The frontend joins each path onto `website_url` to
  preview and open it. Note: `funnels/page/list` is unsupported by GHL's IAM
  ("route not yet supported"), so pages come from the funnel object's `steps`,
  not that route. The funnels read scope on the Willis token is now live.

## iframe caveat

`LiveSiteFrame` embeds the client's site. If the site sends
`X-Frame-Options`/`frame-ancestors` that block embedding, the preview body
renders blank; the "View live site" button always works as the fallback. GHL
funnel/site pages generally allow embedding.

## Admin mirror (future)

The change-request board Jake sees in admin is not built yet. It reads the same
`website_change_requests` rows and will add a `PATCH` for status
(open/in_progress/done).
