# Website page — connections

The client-facing Website section (`/marketing/website/*`), one responsive
surface, four tabs. Storefront direction: the client's live site is the hero.

## What is real (2026-07-03)

| Surface | Source | State |
| --- | --- | --- |
| Overview: site preview + "View live site" | `tenants.website_url` (per client) | REAL once URL set |
| Overview: KPIs / top pages / sources | none yet | honest empty (GA4 pending) |
| Pages tab | GHL funnels API | not wired (scope 401), honest empty |
| Request a Change | Supabase `website_change_requests` | REAL |
| What's working (Insights) | GA4 | honest empty (GA4 pending) |

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

## Not connected until unblocked

- **Analytics (GA4).** KPIs, top pages, sources, and the Insights tab stay empty
  until a GA4 service account exists. To wire: enable the Analytics Data API,
  create a service account, add its email as a Viewer on the client's GA4
  property, then store the SA JSON in Doppler (`GA4_SA_JSON`) and the property id
  on the tenant (new `tenants.ga4_property_id`). Then build
  `functions/api/website/analytics.ts` (JWT -> access token -> `runReport`) with
  a ~15 min KV cache and wire the four surfaces.
- **Pages list.** Needs the GHL funnels read scopes on the Willis integration
  (`funnels/funnel.readonly`, `funnels/page.readonly`, `funnels/redirect.readonly`).
  Probed 2026-07-03: `GET /funnels/funnel/list` returns 401 "not authorized for
  this scope". Until then the Pages tab shows its empty state.

## iframe caveat

`LiveSiteFrame` embeds the client's site. If the site sends
`X-Frame-Options`/`frame-ancestors` that block embedding, the preview body
renders blank; the "View live site" button always works as the fallback. GHL
funnel/site pages generally allow embedding.

## Admin mirror (future)

The change-request board Jake sees in admin is not built yet. It reads the same
`website_change_requests` rows and will add a `PATCH` for status
(open/in_progress/done). See `docs/build-plans/website-page-finish.md`.
