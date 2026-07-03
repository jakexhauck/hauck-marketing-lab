# Finish the Website page (spec + plan)

Status: PLANNED, partially blocked. Gate 1 answered by Jake 2026-07-03. Gate 2
(keys) hit: GA4 analytics has no credential yet, GHL funnels scope is missing.
Frontend wiring waits on Jake's proceed decision (ship real slice now vs hold)
and his site-preview choice (store URL on tenant vs link-only vs defer).

## What the page is

Client-facing "Website" section, one responsive surface (desktop sidebar + phone
PWA share routes), four tabs:

- `/marketing/website` Overview (`WebsiteOverview.tsx`)
- `/marketing/website/pages` Pages (`WebsitePages.tsx`)
- `/marketing/website/request` Request a Change (`WebsiteRequestChange.tsx`)
- `/marketing/website/insights` What's working (`WebsiteInsights.tsx`)

Shared kit + all demo data in `routes/website/shared.tsx`. Today the whole page
is demo-only: a real session shows zeros, empty states, a grey placeholder
preview, and a disabled "Connect website (coming soon)" button. Nothing is wired.

## Gate 1 answers (Jake, 2026-07-03)

1. Site source: the single website under the GHL Sites tab. Show the real site.
2. Analytics: Google Analytics (GA4). Tracking code already sits in the GHL
   header, so GA4 collects the data.
3. Request a Change: persist requests so Jake's future admin view reads the exact
   same records (transparent sync). Admin mirror is a later build. Make the data
   real and syncable now.

## Reality check (every element)

| Element | Real session | Demo | Verdict |
| --- | --- | --- | --- |
| Site preview | grey placeholder | fake CSS `SiteMock` | placeholder |
| KPI tiles | 0 / 0s / - | 1,240 / 18 / 1m12s / Services | demo |
| Top pages | empty state | 5 hardcoded rows | demo |
| Traffic sources | empty state | Google 61% etc | demo |
| Insights hero + takeaways | 0 + empty | full trend + prose | demo |
| Pages master-detail | empty state | 6 hardcoded pages | demo |
| Request-a-Change pins | empty state | seeded, React-only (lost on reload) | placeholder |

## Blockers (Gate 2)

### 1. GHL funnels scope (soft blocker)
Probed live 2026-07-03: `GET /funnels/funnel/list` returns
`401 "The token is not authorized for this scope."` on the Willis PIT
(`pit-7794...`), same class as the Social planner block. So the app cannot
auto-list the site's pages via the API.

- Not needed for v1 if we store the published URL on the tenant manually.
- To unblock later, add these read scopes to the Willis Private Integration:
  `funnels/funnel.readonly`, `funnels/page.readonly`, `funnels/redirect.readonly`.

### 2. GA4 Data API (hard blocker for analytics)
No GA4 access exists. Doppler has `GOOGLE_OAUTH_CLIENT_ID/SECRET` but that is the
Calendar OAuth client, not an Analytics Data API service account. No per-client
GA4 property id is stored. Until this exists, KPI tiles, top pages, sources, and
the Insights tab stay honest empty states.

To unblock (Jake's checklist):
1. In Google Cloud (any project), enable the "Google Analytics Data API".
2. Create a service account, download its JSON key.
3. In GA4 Admin > Property Access Management, add the service account email as a
   Viewer on the client's GA4 property.
4. Give me: the service-account JSON (goes to Doppler as `GA4_SA_JSON`) and the
   client's GA4 property id (goes on the tenant row, new column).

## Plan (execute once Jake picks a proceed path)

### Phase A: Request-a-Change sync (buildable now, self-contained)
Depends on a real preview to pin onto (see Phase B).

1. Migration `0024_website_change_requests.sql`: table
   `website_change_requests` (id uuid pk, tenant_id uuid fk tenants, page text,
   device text, x_pct real, y_pct real, note text, status text default 'open',
   created_by text null, created_at timestamptz default now(),
   updated_at timestamptz default now()). RLS on, no policies (service-role only,
   matches admin_tasks). Index on (tenant_id, created_at).
2. `functions/api/website/requests/index.ts`: `onRequestGet` (list for tenant,
   newest first) + `onRequestPost` (create). Resolve tenant uuid via
   `resolveTenantId(client, ctx.data.tenant.slug)`. Owner full access; staff
   capability check TBD (default-allow if no capability maps).
3. `functions/api/website/requests/[id].ts`: `onRequestPatch` for status
   (used by the admin mirror later; harmless to add now).
4. Frontend: new hook `useWebsiteRequests.ts` (react-query list + create mutation,
   demo path returns `SEED_REQUESTS`). Wire `WebsiteRequestChange.tsx`: real
   session loads from the API and POSTs on send, instead of local state only.

### Phase B: Real site preview (needs Jake's choice)
- Option "store URL on tenant": migration adds `tenants.website_url text`; Jake
  sets it per client in admin. Overview/Pages/Request render the real domain,
  "View live site" opens it, and the preview attempts an embedded live view with
  a graceful fallback (GHL pages may block iframing).
- Option "link-only": show a clean "Your live website" card with the real domain
  and an open button, no iframe. Simplest, never breaks. Request-a-Change then
  pins onto a screenshot/card rather than a live embed (needs design pass).
- Option "defer": leave the placeholder until the funnels scope is added.
- Kill `SiteMock` and the fake Rivertown content from the real path either way.

### Phase C: GA4 analytics (blocked on Gate 2)
1. Migration adds `tenants.ga4_property_id text`.
2. `GA4_SA_JSON` into Doppler, pushed to CF via `cf-rebind --from-doppler`.
3. `functions/api/website/analytics.ts`: sign a JWT from the service account,
   exchange for an access token, call the GA4 Data API `runReport` for visitors,
   top pages, sources, avg engagement time, 12-week trend. KV cache ~15 min.
4. Wire Overview KPIs, Top pages, Sources, and the Insights tab to it. Keep the
   honest empty states when `ga4_property_id` is unset.

## Steps still owed (skill flow)

- Step 7 UI touch-ups: Jake sign-off gate before applying.
- Step 8 verify live: open the page in Jake's own browser, he confirms the data.
- Step 9 ship: autopilot after Gate 4.
- Step 10 docs: create `command-center/app/docs/connections/website.md`, delete
  this plan when fully shipped.
