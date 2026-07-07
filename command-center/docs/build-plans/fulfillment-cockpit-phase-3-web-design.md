# Fulfillment Cockpit Phase 3: Web Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the four Web Design sub-tabs (Site, Pages, Change Requests, Analytics) inside the admin Fulfillment cockpit (`/admin/delivery/:tenantId?tab=web-design`) with a specific tenant's real website data, keyed by an admin-supplied tenantId.

**Architecture:** The client-facing Website endpoints (`functions/api/website/*`) resolve the tenant from the logged-in session (`ctx.data.tenant`). We add admin-tenant endpoints under `functions/api/admin/clients/[tenantId]/website/*` that load the tenant explicitly and reuse the exported cores (`shapeAnalytics`, `ghlJson`, GA4 helpers). Site needs only `tenant.website_url` (already returned by the client-detail endpoint but not surfaced on the frontend type). The cockpit renders new admin tab components fed by new tenantId-keyed hooks, reusing the presentational pieces already extracted in `website/shared.tsx` / `changeRequests.tsx`.

**Tech Stack:** React + TypeScript, react-router-dom, React Query, Tailwind + `pk-` design-kit classes, Vitest. Backend: Cloudflare Pages Functions reading GA4 Data API + GHL funnels + Supabase. Secrets via Doppler.

## Global Constraints

- **Never use em dashes** in any output: code, comments, UI copy, docs.
- **Vendor names allowed here** (admin-only surface). GA4 / GHL may be named in the UI.
- **Honest empty / error states only. No connected-placeholder chatter.** Show real data or a short empty state, never "connected, data will appear here" filler.
- **Read-only.** Every surface in this plan is a viewer. Change Requests is read-only for admin: Jake makes the edit himself in GHL. No writes at all in this phase.
- **TDD:** pure logic gets Vitest coverage before the endpoint/component consumes it.
- **Test command:** `npm run test` (from `command-center/app`). Typecheck: `npm run typecheck`.
- **Secrets:** reuse `GA4_SA_JSON` (agency-wide GA4 service account). No new secret. Anything new goes into Doppler.

## The Admin-Tenant Endpoint Pattern (linchpin, shared by every task)

Client endpoints read `ctx.data.tenant` (session, `_middleware.ts:146-158`). Admin routes (`_middleware.ts:87-100`) get `ctx.data.admin` but **no `ctx.data.tenant`**; the handler loads the tenant from `ctx.params.tenantId`.

For Web Design, the standard admin loader `getTenantById` (`functions/lib/adminAuth.ts:60`) is sufficient for Analytics (it selects `ga4_property_id`, `website_url`, `slug`) but **omits `ghl_token`**, which Pages needs. Use `loadTenantById` (`functions/lib/tenantResolve.ts:114`) for the Pages endpoint (it includes `ghl_token` + `ghl_location_id`); `getTenantById` is fine for Analytics and Change Requests. To keep it simple, use `loadTenantById` everywhere in this phase.

Endpoint skeleton (auth is enforced upstream; do not re-check admin identity):

```ts
// functions/api/admin/clients/[tenantId]/website/<name>.ts  (count depth for imports)
import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { loadTenantById } from "../../../../../../lib/tenantResolve";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
  // tenant.ga4_property_id, tenant.ghl_token, tenant.ghl_location_id, tenant.website_url, tenant.slug available.
};
```

## React Hook Pattern (shared)

Mirror `useAdminClientDetailQuery` (`src/hooks/useApi.ts:259`). Example:

```ts
export function useAdminWebsiteAnalyticsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "website", "analytics"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () => api<WebsiteAnalytics>(`/api/admin/clients/${tenantId}/website/analytics`),
  });
}
```

Reuse the client return types (`WebsiteAnalytics`, `WebsitePageItem`, the `WebsiteRequest` DTO) so admin endpoints return identical shapes and the cockpit shares the client components' data types.

---

## File Structure

**Backend (new):**
- Create `functions/api/admin/clients/[tenantId]/website/analytics.ts` (GA4).
- Create `functions/api/admin/clients/[tenantId]/website/pages.ts` (GHL funnels).
- Create `functions/api/admin/clients/[tenantId]/website/requests.ts` (read-only change requests).

**Backend (refactor for reuse):**
- Modify `functions/api/website/analytics.ts`: extract the inline 4-report request array and the `NOT_CONNECTED` constant into exported helpers (`ANALYTICS_REPORTS`, `NOT_CONNECTED_ANALYTICS`) so the admin endpoint reuses them instead of duplicating. `shapeAnalytics` is already exported (`analytics.ts:104`).

**Frontend (new):**
- Create `src/components/admin/cockpit/webdesign/WebDesignTab.tsx` (routes the 4 sub-tabs by `activeSub`).
- Create `src/components/admin/cockpit/webdesign/SitePanel.tsx`, `PagesPanel.tsx`, `ChangeRequestsPanel.tsx`, `AnalyticsPanel.tsx`.
- Add hooks to `src/hooks/useApi.ts`.

**Frontend (modified):**
- Modify `src/lib/api.ts`: extend the `AdminClientDetail` interface (`~lines 303-320`) to surface `websiteUrl`, `ga4PropertyId`, `metaAdAccountId`, `googlePlaceId`, which `GET /api/admin/clients/:tenantId` already returns (`[tenantId].ts:121-125`) but the type omits. Site/URL needs `websiteUrl`.
- Modify `src/lib/deliveryCockpit.ts`: flip `web-design` + sub-tabs to `ready: true` as each lands.
- Modify `src/routes/admin/DeliveryCockpit.tsx`: render `<WebDesignTab/>` for `activeService === "web-design"`.

---

## Task 1: Surface the tenant fields the detail endpoint already returns

**Files:**
- Modify: `src/lib/api.ts` (the `AdminClientDetail` interface).
- Test: `src/lib/api.test.ts` if one exists, else a small type-level assertion in the SitePanel task.

- [ ] **Step 1:** Read `functions/api/admin/clients/[tenantId].ts:121-125` to confirm the exact JSON keys returned (`websiteUrl`, `ga4PropertyId`, `metaAdAccountId`, `googlePlaceId`).
- [ ] **Step 2:** Add those four fields (as optional `string | null`) to the `AdminClientDetail` interface in `src/lib/api.ts`. Change nothing else.
- [ ] **Step 3: Run** `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(fulfillment): surface websiteUrl + property ids on AdminClientDetail`.

## Task 2: Site panel (live preview + URL)

**Files:**
- Create: `src/components/admin/cockpit/webdesign/WebDesignTab.tsx`, `SitePanel.tsx`.
- Modify: `src/routes/admin/DeliveryCockpit.tsx`, `src/lib/deliveryCockpit.ts`.

- [ ] **Step 1:** Build `WebDesignTab.tsx` taking `{ tenantId, activeSub }`, switching on `activeSub` to render the four panels. For now, non-Site panels render an honest "Building this view" empty.
- [ ] **Step 2:** Build `SitePanel.tsx` reading `useAdminClientDetailQuery(tenantId)` for `client.websiteUrl`. Render the URL (as a link, opens in a new tab) and a live preview. Reuse `LiveSiteFrame` / `DevicePreview` from `src/routes/website/shared.tsx` if they accept a URL prop; otherwise render a plain `<iframe src={websiteUrl}>` inside the device frame markup. If `websiteUrl` is empty, render an honest empty ("No website URL is set for this client. Add it in Config.").
- [ ] **Step 3:** In `DeliveryCockpit.tsx`, replace the `web-design` placeholder branch with `<WebDesignTab tenantId={tenantId} activeSub={activeSub ?? "site"} />`.
- [ ] **Step 4:** In `deliveryCockpit.ts`, flip `web-design` + the `site` sub-tab to `ready: true`.
- [ ] **Step 5: Typecheck, eyeball** in `npm run dev` against a tenant with a real `websiteUrl`. Screenshot.
- [ ] **Step 6: Commit** `feat(fulfillment): Web Design Site panel`.

## Task 3: Analytics endpoint + panel (GA4)

**Files:**
- Modify: `functions/api/website/analytics.ts` (export the report array + not-connected const).
- Create: `functions/api/admin/clients/[tenantId]/website/analytics.ts`.
- Create: `src/components/admin/cockpit/webdesign/AnalyticsPanel.tsx`.
- Modify: `src/hooks/useApi.ts`, `src/lib/deliveryCockpit.ts`.

**Interfaces:**
- Consumes: `parseServiceAccount`, `batchRunReports` from `functions/lib/ga4.ts`; `shapeAnalytics` from `analytics.ts:104`.
- Produces: `GET /api/admin/clients/:tenantId/website/analytics` returning `WebsiteAnalytics`; `useAdminWebsiteAnalyticsQuery(tenantId)`.

- [ ] **Step 1: Refactor for reuse.** In `analytics.ts`, lift the inline 4-report request array (`analytics.ts:185-215`) into an exported `ANALYTICS_REPORTS(now: Date): ReportRequest[]` and export the `NOT_CONNECTED` const (`analytics.ts:41`) as `NOT_CONNECTED_ANALYTICS`. Repoint the client `onRequestGet` to use them. Run existing tests; behavior unchanged.
- [ ] **Step 2: Admin endpoint.** `website/analytics.ts` loads the tenant, resolves `propertyId = (tenant.ga4_property_id || env.GA4_PROPERTY_ID)?.trim()`. If none, return `NOT_CONNECTED_ANALYTICS`. Else `parseServiceAccount(env.GA4_SA_JSON)` → `batchRunReports(sa, propertyId, ANALYTICS_REPORTS(now))` → `shapeAnalytics(reports, now)`. Reuse the same KV cache key `ga4:${propertyId}:${monthStart}` (keyed by property, so admin and client share cache safely).
- [ ] **Step 3:** Add `useAdminWebsiteAnalyticsQuery(tenantId)` to `useApi.ts`.
- [ ] **Step 4: AnalyticsPanel** renders the same real GA4 fields the client Insights uses (`visitorsThisMonth`, `deltaPct`, `trend` bars, `sources`, `topPage`). Reuse the bar components from `website/shared.tsx`/`WebsiteInsights.tsx` where they are presentational. When not connected, render an honest "Google Analytics is not connected for this client." Do NOT port the demo-only plain-English narration (client `WebsiteInsights.tsx:214`).
- [ ] **Step 5:** Flip `analytics` sub-tab to `ready: true`. Hit `/api/admin/clients/<tenantId>/website/analytics` live to confirm real GA4 JSON. Typecheck, test, screenshot.
- [ ] **Step 6: Commit** `feat(fulfillment): Web Design Analytics (GA4) panel`.

## Task 4: Pages endpoint + panel (GHL funnels)

**Files:**
- Create: `functions/api/admin/clients/[tenantId]/website/pages.ts`.
- Create: `src/components/admin/cockpit/webdesign/PagesPanel.tsx`.
- Modify: `src/hooks/useApi.ts`, `src/lib/deliveryCockpit.ts`.

**Interfaces:**
- Consumes: `ghlJson`, `GhlContext` from `functions/lib/ghl.ts`.
- Produces: `GET /api/admin/clients/:tenantId/website/pages` returning `{ site: {name, updatedAt} | null, pages: WebsitePageItem[], unavailable?: boolean }`.

- [ ] **Step 1:** Build `pages.ts` mirroring `functions/api/website/pages.ts`: build `GhlContext` from the loaded tenant's `ghl_token`/`ghl_location_id`, call `ghlJson(gctx, "/funnels/funnel/list?locationId=<id>&limit=100")`, filter to `type === "website" && !deleted`, flatten `steps` into `{ id, name, path, sequence }`, sort by sequence. On any GHL error return `{ site: null, pages: [], unavailable: true }`.
- [ ] **Step 2:** Add `useAdminWebsitePagesQuery(tenantId)` to `useApi.ts`.
- [ ] **Step 3: PagesPanel** lists the pages with their `path`, each opening a preview built from `client.websiteUrl` + `path` (`new URL(path, websiteUrl)`), reusing the `PageRow` + `LiveSiteFrame` presentational pieces. On `unavailable`, render an honest "Could not load this client's pages from GHL."
- [ ] **Step 4:** Flip `pages` sub-tab to `ready: true`. Typecheck, test, eyeball, screenshot.
- [ ] **Step 5: Commit** `feat(fulfillment): Web Design Pages panel`.

## Task 5: Change Requests endpoint + panel (read-only)

**Files:**
- Create: `functions/api/admin/clients/[tenantId]/website/requests.ts`.
- Create: `src/components/admin/cockpit/webdesign/ChangeRequestsPanel.tsx`.
- Modify: `src/hooks/useApi.ts`, `src/lib/deliveryCockpit.ts`.

**Interfaces:**
- Consumes: the `website_change_requests` table (columns `id, tenant_id, page, device, x_pct, y_pct, note, status, created_by, created_at`).
- Produces: `GET /api/admin/clients/:tenantId/website/requests` returning `{ requests: WebsiteRequest[] }`. **GET only, no POST.**

- [ ] **Step 1:** Build `requests.ts` GET: load the tenant (to 404 unknown ids), then query `website_change_requests` `.eq("tenant_id", tenantId)` ordered `created_at desc` limit 200, mapping rows to the `WebsiteRequest` wire shape (`{ id, page, device, xPct, yPct, note, status, createdAt }`). The client path resolves tenant by slug; the admin path has the tenant UUID directly, so query by `tenant_id = tenantId`. Do NOT add a POST; admin is read-only here.
- [ ] **Step 2:** Add `useAdminWebsiteRequestsQuery(tenantId)` to `useApi.ts`.
- [ ] **Step 3: ChangeRequestsPanel** renders the requests read-only. Reuse `RequestsRail` from `changeRequests.tsx` if it accepts an externally supplied request list; otherwise render a simple list (page, device, note, status chip, timestamp). Include a one-line note: "Read-only. Make the edit in GHL." Honest empty when none.
- [ ] **Step 4:** Flip `change-requests` sub-tab to `ready: true`. Typecheck, test, eyeball, screenshot.
- [ ] **Step 5: Commit** `feat(fulfillment): Web Design Change Requests panel (read-only)`.

## Task 6: Ship + verify

- [ ] **Step 1:** Full ship per build-loop autopilot: push, watch deploy, smoke-test live at a real tenant, grep the live JS bundle for the new build.
- [ ] **Step 2:** Screenshot all four Web Design sub-tabs live for Jake and get sign-off.

---

## Self-Review

- **Spec coverage:** Site (Task 2), Pages (Task 4), Change Requests read-only (Task 5), Analytics (Task 3). All four sub-tabs covered.
- **Reuse over rebuild:** `shapeAnalytics`, `ga4.ts` helpers, `ghlJson`, and the presentational pieces in `website/shared.tsx` are reused. The one refactor (Task 3 Step 1) exports two inline constants so the GA4 request array is not duplicated.
- **Type gap fixed:** Task 1 surfaces `websiteUrl` on `AdminClientDetail`, which the endpoint already returns; without it the Site preview has no URL.
- **No writes:** Change Requests is GET-only; Jake edits in GHL.
