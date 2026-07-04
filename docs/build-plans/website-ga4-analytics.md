# Website analytics (GA4) — spec + plan

The last unbuilt piece of the client Website page: real visitor numbers. The
site preview, Pages tab, and Request-a-Change are already shipped and live. This
plan wires the Overview KPIs, Top pages, Traffic sources, and the "What's
working" (Insights) tab to real Google Analytics 4 data.

## Definition of done

- A client with a GA4 property connected sees real numbers on Overview
  (visitors, avg time on site, top page), the Top pages list, the Traffic
  sources bars, and the Insights hero + trend + sources.
- A client with no GA4 property connected keeps today's honest empty states.
- Numbers are per client (one client can never see another's), cached ~15 min.
- Verified live by Jake in his own browser.

## Blocked on (Jake's one-time setup)

Analytics stays empty until these exist. Jake is doing this now (2026-07-03).

### Get the service-account JSON key (Google Cloud)
1. console.cloud.google.com, pick or create a project ("hauck-analytics").
2. Search "Google Analytics Data API", Enable it.
3. APIs & Services > Credentials > Create Credentials > Service account. Name it
   (hml-analytics), Create and Continue, skip roles, Done.
4. Open the service account > Keys > Add Key > Create new key > JSON > Create.
   The downloaded JSON is the key.
5. Copy the service account email (…iam.gserviceaccount.com) for the next step.

### Get the Property ID + grant access (Google Analytics)
1. analytics.google.com, select the client's property.
2. Admin (gear) > Property > Property details: copy PROPERTY ID (a number).
3. Admin > Property > Property Access Management > + > Add users: paste the
   service-account email, role Viewer, uncheck notify, Add.

### Hand off to me
- The JSON key -> stored in Doppler as `GA4_SA_JSON`, pushed to CF via
  `cf-rebind --from-doppler`.
- The Property ID -> stored per client on `tenants.ga4_property_id`.
- Security: the JSON is a live secret. Once it is in Doppler, rotate it in
  Google Cloud (delete the key, generate a fresh one) if it was pasted anywhere
  exposed. I flag it when it is safely stored.

## Build (once the key + property id exist)

### 1. Schema + config
- Migration `00xx_tenant_ga4_property.sql`: `alter table tenants add column if
  not exists ga4_property_id text;` (nullable => not connected).
- `GA4_SA_JSON` into Doppler (project `hauck-command-center`/`prd`), then
  `cf-rebind --from-doppler` to CF. Do not commit the key.
- Admin: add a "Analytics (Google)" card (or a field on the existing Website
  card) in `AdminClientDetail.tsx` + `ga4PropertyId` in the admin
  GET/PATCH (`functions/api/admin/clients/[tenantId].ts`, `adminAuth.ts`
  TENANT_COLUMNS/TenantRow), mirroring the Meta / Google-place pattern.

### 2. Auth helper (service account -> access token)
- `functions/lib/ga4.ts`: sign a JWT (RS256, Web Crypto `importKey` +
  `sign`) from the SA JSON, exchange at `https://oauth2.googleapis.com/token`
  for an `analytics.readonly` access token. Cache the token in-memory ~55 min
  (tokens last 1h). Pure fetch, no googleapis SDK (Workers runtime).

### 3. Analytics endpoint
- `functions/api/website/analytics.ts` (GET). Resolves the tenant's
  `ga4_property_id`; if unset, returns `{ connected: false }` (frontend keeps
  empty states). Otherwise runs GA4 Data API
  `POST v1beta/properties/{id}:runReport` calls and shapes:
  - KPIs: visitors this month (`activeUsers`, dateRange this month) + avg time on
    site (`averageSessionDuration`).
  - Top pages: dims `pagePath` (or `pageTitle`), metric `screenPageViews`, top 5.
  - Traffic sources: dim `sessionDefaultChannelGroup`, metric `sessions`, as % of
    total (map to friendly labels: Organic Search -> "Google search", Direct ->
    "Typed it in directly", Social, Referral -> "Other sites").
  - Trend: dim `yearMonth` (or `week`), metric `activeUsers`, last 12 buckets,
    plus this-month vs last-month delta.
  - "Top performing page" (Insights): the top page by a conversion proxy, or the
    top page by views for v1.
  - KV cache ~15 min keyed by property id.
- Gap: "Leads from your site" KPI cannot come from GA (GA does not know CRM
  leads). Leave that tile out of the real path, or source it from GHL contacts
  with a website source later. Note it in the connection doc.

### 4. Frontend wiring
- `src/hooks/useWebsiteAnalytics.ts`: react-query GET `/api/website/analytics`,
  demo returns the existing SAMPLE_* fixtures, disabled in demo.
- `WebsiteOverview.tsx`: feed real KPIs (visitors, avg time, top page), Top pages
  list, and Traffic sources from the hook. Keep the "site connected, analytics
  pending" note only when the site URL is set but `connected === false`.
- `WebsiteInsights.tsx`: feed the hero number + trend + sources + takeaways from
  the hook. Keep the empty state when not connected.
- Every surface keeps its honest empty state when `connected === false`.

### 5. Verify + ship
- Local: typecheck + build green; dry-run the endpoint shape against Willis's
  property using the SA locally.
- Ship: migration applied, `GA4_SA_JSON` in CF, commit, push, watch deploy,
  grep the live bundle.
- Jake sets Willis's `ga4_property_id` in admin, opens the Website page, and
  confirms real visitor numbers on Overview + Insights (agent cannot, `/api/*`
  is 401 unauthenticated).

### 6. Docs
- Update `command-center/app/docs/connections/website.md` (mark analytics REAL,
  record the "leads from site" gap). Delete this plan when shipped.

## Notes
- Willis site pages already resolve from GHL (`/api/website/pages`); GA4 pages
  will match those paths, so the two lists reconcile naturally.
- Same auth pattern (SA JWT -> token -> Data API) will suit any future Google
  API we add, so `ga4.ts` is worth building cleanly.
