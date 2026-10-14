# Fulfillment Cockpit Phase 2: Paid Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the four Paid Ads sub-tabs (Campaigns, Ad Library, Funnel, Data & Leads) inside the admin Fulfillment cockpit (`/admin/delivery/:tenantId?tab=paid-ads`) with a specific tenant's real Meta ad data, keyed by an admin-supplied tenantId.

**Architecture:** The client-facing Paid Ads endpoints (`functions/api/ads/*`) resolve the tenant from the logged-in session (`ctx.data.tenant`) and cannot serve an admin-chosen tenant. We add admin-tenant endpoints under `functions/api/admin/clients/[tenantId]/ads/*` that load the tenant explicitly and call the SAME pure core logic the client endpoints use. We refactor the Meta/GHL core out of the client handlers into shared helpers so both routes stay DRY. The cockpit renders new admin tab components fed by new tenantId-keyed React Query hooks. `/admin/ads` (mock) is retired.

**Tech Stack:** React + TypeScript, react-router-dom, React Query, Tailwind + `pk-` design-kit classes, Vitest. Backend: Cloudflare Pages Functions reading Meta Graph API v21.0 + GHL. Supabase (migration for the creatives store). Secrets via Doppler.

## Global Constraints

- **Never use em dashes** in any output: code, comments, UI copy, docs. Use commas, periods, parentheses, or colons.
- **Vendor names allowed here.** This cockpit is admin-only, so GoHighLevel / GHL / Meta may be named in the UI. (The client app must never name them; that rule does not apply to admin surfaces.)
- **Honest empty / error states only. No connected-placeholder chatter.** Never fabricate a number. Never show "your account is connected, data will appear here" filler. Show real data or a short, specific empty state ("No campaigns are live for this account.").
- **Read-only by default.** Every surface in this plan is a viewer. The one and only write action is Ad Library "Push to Meta" (Task 6); if the upload fights the real token, ship Ad Library as an internal tracker and split the push to a Phase 2b, logging the decision honestly in the UI.
- **TDD:** pure logic (stage/bucket rollups, resolvers, shared cores) gets Vitest coverage before the endpoint or component consumes it.
- **Test command:** `npm run test` (from `command-center/app`), which runs `vitest run`. Typecheck: `npm run typecheck`.
- **Secrets:** any new secret goes into Doppler (`hauck-command-center` / `prd`), never committed. This phase adds no new secret (reuses `META_SYSTEM_USER_TOKEN`).
- **Migrations** run via `npm run db:migrate` (Management API + ledger). Never the SQL editor.

## The Admin-Tenant Endpoint Pattern (the linchpin, shared by every task)

Client endpoints read `ctx.data.tenant` (session-derived, set by `functions/api/_middleware.ts:146-158`). Admin routes take a different middleware branch (`_middleware.ts:87-100`): they get `ctx.data.admin` but **no `ctx.data.tenant`**. An admin handler must load the tenant itself from `ctx.params.tenantId`.

**Critical gotcha:** the usual admin loader `getTenantById` (`functions/lib/adminAuth.ts:60`) **deliberately omits `ghl_token`**. Paid Ads needs both the Meta account and the GHL token, so admin ads endpoints must use `loadTenantById` (`functions/lib/tenantResolve.ts:114`), whose `TENANT_COLS` includes `ghl_token`, `meta_ad_account_id`, `ghl_location_id`, and `slug`.

Copy this skeleton for every new endpoint (auth is already enforced upstream by the middleware; do NOT re-check admin identity in the handler):

```ts
// functions/api/admin/clients/[tenantId]/ads/<name>.ts
// Depth is 6 levels down, so lib imports use ../../../../../../lib/...
import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { loadTenantById } from "../../../../../../lib/tenantResolve";
import { logAdminAction } from "../../../../../../lib/adminAuth";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
  // tenant.meta_ad_account_id, tenant.ghl_token, tenant.ghl_location_id, tenant.slug are all present.
  // ctx.data.admin!.id is guaranteed (middleware). Optionally logAdminAction(client, ctx.data.admin!.id, "ads.view", tenantId).
};
```

**Confirm the exact import depth** before writing each endpoint by counting directories from the file to `functions/lib`. The examples above assume `functions/api/admin/clients/[tenantId]/ads/insights.ts`.

## React Hook Pattern (shared by every UI task)

Mirror `useAdminClientDetailQuery` (`src/hooks/useApi.ts:259`). Add new hooks to `src/hooks/useApi.ts`:

```ts
export function useAdminAdsInsightsQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "ads", "insights"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () => api<AdsInsightsResponse>(`/api/admin/clients/${tenantId}/ads/insights`),
  });
}
```

`api<T>()` is the fetch wrapper from `src/lib/api.ts` (throws `ApiError` with `.status`). Reuse the existing response types (`AdsInsightsResponse`, `AdMediaItem`, `FunnelForm`, and the leads shape) from the client hook files so the admin endpoints return an identical shape and the render layer can share types.

---

## File Structure

**Backend (new):**
- Create `command-center/app/functions/lib/metaGraph.ts`: the single shared Graph helper (`GRAPH` const, `graphGet`, `graphGetAll`, `resolveAdAccount`), extracted from the three copies in `ads/insights.ts:70`, `ads/media.ts:32/53`, `ads/funnel.ts:49`.
- Create `command-center/app/functions/lib/adsCore.ts`: pure ads-shaping cores lifted from `ads/insights.ts` (`buildAds`, `derivePhase`, the insights request + shaping) so both client and admin routes call one function that takes an explicit `{ metaAccount, ghlToken, ghlLocationId, zone }` context.
- Create `command-center/app/functions/api/admin/clients/[tenantId]/ads/insights.ts`
- Create `command-center/app/functions/api/admin/clients/[tenantId]/ads/media.ts`
- Create `command-center/app/functions/api/admin/clients/[tenantId]/ads/funnel.ts`
- Create `command-center/app/functions/api/admin/clients/[tenantId]/ads/leads.ts`
- Create `command-center/app/functions/api/admin/clients/[tenantId]/ads/creatives/index.ts` (GET list, POST create; Task 6)
- Create `command-center/app/functions/api/admin/clients/[tenantId]/ads/creatives/[creativeId]/push.ts` (POST push-to-Meta; Task 6, may split to 2b)
- Create migration `command-center/app/supabase/migrations/0027_client_ad_creatives.sql` (Task 6)

**Backend (modified, to call the shared cores):**
- Modify `command-center/app/functions/api/ads/insights.ts`, `ads/media.ts`, `ads/funnel.ts` to import from `metaGraph.ts` / `adsCore.ts` instead of their local copies. Behavior unchanged; verified by existing tests.

**Frontend (new):**
- Create `command-center/app/src/components/admin/cockpit/paidads/PaidAdsTab.tsx`: routes the four sub-tabs by `activeSub`.
- Create `command-center/app/src/components/admin/cockpit/paidads/CampaignsPanel.tsx`
- Create `command-center/app/src/components/admin/cockpit/paidads/AdLibraryPanel.tsx`
- Create `command-center/app/src/components/admin/cockpit/paidads/FunnelPanel.tsx`
- Create `command-center/app/src/components/admin/cockpit/paidads/DataLeadsPanel.tsx`
- Add hooks to `command-center/app/src/hooks/useApi.ts`.

**Frontend (modified):**
- Modify `command-center/app/src/lib/deliveryCockpit.ts`: flip `paid-ads` and its sub-tabs to `ready: true` as each lands.
- Modify `command-center/app/src/routes/admin/DeliveryCockpit.tsx`: render `<PaidAdsTab/>` when `activeService === "paid-ads"` instead of the placeholder.
- Modify `command-center/app/src/App.tsx`: retire `/admin/ads` routes (Task 7).
- Delete `command-center/app/src/routes/admin/AdminAds.tsx`, `AdminAdsClient.tsx`, and mock libs `src/lib/mockAds.ts`, `src/lib/adsTracker.ts`, `src/components/ads-tracker/format.ts` (verify no other importers).

---

## Task 1: Extract the shared Meta Graph helper

**Files:**
- Create: `command-center/app/functions/lib/metaGraph.ts`
- Test: `command-center/app/functions/lib/metaGraph.test.ts`
- Modify: `functions/api/ads/insights.ts`, `functions/api/ads/media.ts`, `functions/api/ads/funnel.ts`

**Interfaces:**
- Produces: `const GRAPH = "https://graph.facebook.com/v21.0"`; `graphGet<T>(path: string, token: string, params?: Record<string,string>): Promise<T>`; `graphGetAll<T>(path: string, token: string, params?: Record<string,string>): Promise<T[]>` (follows `paging.next`); `resolveAdAccount(tenantAccount: string | null | undefined, envAccount: string | undefined): string | null` (moved verbatim from `insights.ts:211`).

- [ ] **Step 1: Write the failing test** for `resolveAdAccount` (prefers tenant account, falls back to env, normalizes `act_` prefix exactly as the current `insights.ts` version does) and a `graphGet` URL-builder assertion using a stubbed `fetch`. Copy the current behavior from `insights.ts` so the test locks it in.
- [ ] **Step 2: Run** `npm run test -- metaGraph` and confirm FAIL (module not found).
- [ ] **Step 3: Implement** `metaGraph.ts` by moving `GRAPH`, `graphGet`, `graphGetAll` (the paginating one from `media.ts:53`), and `resolveAdAccount` into it. Keep signatures identical.
- [ ] **Step 4: Repoint the three client endpoints.** In `ads/insights.ts`, `ads/media.ts`, `ads/funnel.ts`, delete the local `GRAPH`/`graphGet`/`graphGetAll`/`resolveAdAccount` and import them from `../../lib/metaGraph`. Change nothing else.
- [ ] **Step 5: Run** `npm run test` (the existing ads tests must stay green) and `npm run typecheck`. Expected: PASS, no behavior change.
- [ ] **Step 6: Commit** `feat(fulfillment): extract shared Meta Graph helper`.

## Task 2: Extract the ads insights core

**Files:**
- Create: `command-center/app/functions/lib/adsCore.ts`
- Test: `command-center/app/functions/lib/adsCore.test.ts`
- Modify: `functions/api/ads/insights.ts`

**Interfaces:**
- Consumes: `metaGraph.ts`; `adRevenueThisMonth` from `functions/lib/adsRevenue.ts:127`.
- Produces: `interface AdsContext { metaAccount: string; ghlToken: string; ghlLocationId: string; zone: string }`; `buildAdsInsights(env: Env, ctx: AdsContext): Promise<AdsInsightsResponse>` returning the exact shape `ads/insights.ts` returns today (per-ad rows, totals, revenue join). Keep `buildAds` and `derivePhase` exported for the test.

- [ ] **Step 1: Write the failing test** feeding a stubbed Meta + GHL response through `buildAdsInsights` and asserting the totals + one ad row + the revenue-join fields match the current output. Seed values from a real `insights.ts` response shape.
- [ ] **Step 2: Run** `npm run test -- adsCore`, confirm FAIL.
- [ ] **Step 3: Implement** `adsCore.ts` by lifting the body of `ads/insights.ts` `onRequestGet` into `buildAdsInsights(env, ctx)`, reading `ctx.metaAccount` / `ctx.ghlToken` / `ctx.ghlLocationId` / `ctx.zone` instead of `ctx.data.tenant`. Keep the KV cache key format (`ads:insights:v2:{account}:{location}:{month}`) but pass `env.KV_CACHE` in.
- [ ] **Step 4: Rewrite** `ads/insights.ts` `onRequestGet` to build `AdsContext` from `ctx.data.tenant` (`meta_ad_account_id`, `ghl_token`, `ghl_location_id`) and the caller's timezone, then `return Response.json(await buildAdsInsights(ctx.env, adsCtx))`.
- [ ] **Step 5: Run** `npm run test` + `npm run typecheck`. Expected: PASS, client Paid Ads unchanged.
- [ ] **Step 6: Commit** `feat(fulfillment): extract ads insights core`.

## Task 3: Admin ads endpoints (insights, media, funnel, leads)

**Files:**
- Create: `functions/api/admin/clients/[tenantId]/ads/insights.ts`, `.../ads/media.ts`, `.../ads/funnel.ts`, `.../ads/leads.ts`

**Interfaces:**
- Consumes: the admin-tenant skeleton above; `loadTenantById`; `buildAdsInsights` (Task 2); `graphGetAll` (Task 1) for media/funnel; the GHL leads query lifted from `ads/leads/index.ts`.
- Produces: four GET routes returning the same JSON shapes as their `functions/api/ads/*` siblings.

- [ ] **Step 1: `ads/insights.ts`** loads the tenant via `loadTenantById`, builds `AdsContext` from the tenant row, returns `buildAdsInsights(ctx.env, adsCtx)`. If `tenant.meta_ad_account_id` is null, return `{ ads: [], totals: null, notConnected: true }` (honest empty, matching the client shape's not-connected branch).
- [ ] **Step 2: `ads/media.ts`** calls `graphGetAll` against `resolveAdAccount(tenant.meta_ad_account_id, env.META_AD_ACCOUNT_ID)` with `env.META_SYSTEM_USER_TOKEN`; return the same `{ media: AdMediaItem[] }` shape as `ads/media.ts`.
- [ ] **Step 3: `ads/funnel.ts`** mirrors `ads/funnel.ts` logic (auto-detect the lead form from live ads) against the tenant's Meta account.
- [ ] **Step 4: `ads/leads.ts`** lifts the GHL Paid Ads pipeline query from `ads/leads/index.ts:56`, sourcing `ghl_token`/`ghl_location_id` from the loaded tenant. Return the same leads array shape.
- [ ] **Step 5:** Manually hit each route in `npm run dev` as an admin against Willis (`/api/admin/clients/<willisId>/ads/insights` etc.) and confirm real JSON, not 401/500. Record one sample payload per route.
- [ ] **Step 6: Commit** `feat(fulfillment): admin-tenant Paid Ads endpoints`.

## Task 4: Admin ads hooks + Data & Leads panel

**Files:**
- Modify: `src/hooks/useApi.ts` (add `useAdminAdsInsightsQuery`, `useAdminAdsMediaQuery`, `useAdminAdsFunnelQuery`, `useAdminAdsLeadsQuery`, all `(tenantId, enabled=true)`).
- Create: `src/components/admin/cockpit/paidads/PaidAdsTab.tsx`, `DataLeadsPanel.tsx`.
- Modify: `src/routes/admin/DeliveryCockpit.tsx`, `src/lib/deliveryCockpit.ts`.

- [ ] **Step 1:** Add the four hooks to `useApi.ts` following the hook pattern above.
- [ ] **Step 2:** Build `PaidAdsTab.tsx` taking `{ tenantId, activeSub }`, switching on `activeSub` to render the four panels (Campaigns/Ad Library/Funnel/Data & Leads). For now, only `DataLeadsPanel` is real; the others render an honest "Building this view" empty until their task lands.
- [ ] **Step 3:** Build `DataLeadsPanel.tsx`: one stacked page reading `useAdminAdsInsightsQuery(tenantId)` for per-ad metrics + totals, then `useAdminAdsLeadsQuery(tenantId)` for the incoming leads table. Loading, error, and honest not-connected states. Reuse `formatMoney` and the `pk-report` tiles from the Overview tab for visual consistency.
- [ ] **Step 4:** In `DeliveryCockpit.tsx`, replace the `paid-ads` placeholder branch with `<PaidAdsTab tenantId={tenantId} activeSub={activeSub ?? "campaigns"} />`.
- [ ] **Step 5:** In `deliveryCockpit.ts`, flip `paid-ads` and its `data-leads` sub-tab to `ready: true`; leave the other three sub-tabs `ready: false` until their tasks land.
- [ ] **Step 6: Run** `npm run typecheck && npm run test`, then eyeball in `npm run dev`. Screenshot Data & Leads for a real tenant.
- [ ] **Step 7: Commit** `feat(fulfillment): Paid Ads Data & Leads panel`.

## Task 5: Campaigns and Funnel panels

**Files:**
- Create: `src/components/admin/cockpit/paidads/CampaignsPanel.tsx`, `FunnelPanel.tsx`.
- Modify: `src/lib/deliveryCockpit.ts`.

- [ ] **Step 1: CampaignsPanel** reads `useAdminAdsInsightsQuery(tenantId)`. There is no campaign>adset>ad tree component today (`buildAds` flattens to an ad list), so render a read-only grouped list: group the ad rows by campaign name, show ad-set and ad beneath, with `effective_status`, spend, and result. Optionally overlay the optimizer's recommended move per campaign using `src/lib/adsOptimizer.ts` (Kill/Watch/Scale/Refresh). No writes.
- [ ] **Step 2: FunnelPanel** reads `useAdminAdsFunnelQuery(tenantId)` and renders the detected lead form (fields + a preview), or an honest empty ("No lead form is attached to this account's live ads.").
- [ ] **Step 3:** Flip `campaigns` and `funnel` sub-tabs to `ready: true`.
- [ ] **Step 4: Typecheck, test, eyeball, screenshot.**
- [ ] **Step 5: Commit** `feat(fulfillment): Paid Ads Campaigns + Funnel panels`.

## Task 6: Ad Library (creatives store + optional Push to Meta)

**Files:**
- Create: migration `supabase/migrations/0027_client_ad_creatives.sql`; `functions/api/admin/clients/[tenantId]/ads/creatives/index.ts`; `.../creatives/[creativeId]/push.ts`; `src/components/admin/cockpit/paidads/AdLibraryPanel.tsx`.
- Modify: `src/hooks/useApi.ts`, `src/lib/deliveryCockpit.ts`.

**Interfaces:**
- Produces: table `client_ad_creatives(id uuid pk, tenant_id uuid references public.tenants(id), media_ref text, headline text, primary_text text, status text check in ('draft','approved','live') default 'draft', created_by text, created_at timestamptz default now())`. Next free migration number is `0027`. There is no existing creatives table, so no naming collision.

- [ ] **Step 1: Write the migration** `0027_client_ad_creatives.sql` with the table above and an index on `tenant_id`. Apply with `npm run db:migrate`. Confirm the ledger row and that the table exists.
- [ ] **Step 2: `creatives/index.ts`** GET lists this tenant's creatives (`.eq("tenant_id", tenantId)`), POST inserts one (validate `headline`/`primary_text` length, `status` enum). Auth is free via middleware; still load the tenant via `loadTenantById` to 404 on unknown tenants.
- [ ] **Step 3:** Add `useAdminAdsCreativesQuery(tenantId)` and a `useCreateAdCreative(tenantId)` mutation to `useApi.ts`.
- [ ] **Step 4: AdLibraryPanel** lists creatives with status chips and a "New creative" form (image/video ref, headline, primary text, status). Read + create only for now.
- [ ] **Step 5: Push to Meta (attempt, may split to 2b).** `creatives/[creativeId]/push.ts` POST uploads the asset to the tenant's ad account media library via `POST /act_<id>/adimages` (images) or `/advideos` (video) with `META_SYSTEM_USER_TOKEN`. If this works cleanly against the real token, wire a "Push to Meta" button that flips status to `live` on success. **If the upload fights the real token, stop:** ship Ad Library as an internal tracker, remove the button, and render an honest note ("Push to Meta is coming in a follow-up."). Log the decision here in the plan and in the PR.
- [ ] **Step 6:** Flip `ad-library` sub-tab to `ready: true`. Typecheck, test, eyeball, screenshot.
- [ ] **Step 7: Commit** `feat(fulfillment): Paid Ads Ad Library` (and a separate commit if Push lands).

## Task 7: Retire `/admin/ads` (mock)

**Files:**
- Modify: `src/App.tsx:79-80` (imports), `src/App.tsx:604-619` (the two `<Route>` blocks).
- Delete: `src/routes/admin/AdminAds.tsx`, `src/routes/admin/AdminAdsClient.tsx`, `src/lib/mockAds.ts`, `src/lib/adsTracker.ts`, `src/components/ads-tracker/format.ts`.

- [ ] **Step 1: Confirm no other importers** of the mock libs: `git grep -n "mockAds\|adsTracker\|ads-tracker/format" command-center/app/src`. If anything outside the files above imports them, stop and report.
- [ ] **Step 2: Repoint the routes.** Replace both `/admin/ads` and `/admin/ads/:clientId` route elements in `App.tsx` with `<Navigate to="/admin/delivery" replace />` (mirroring the pillar redirects at `App.tsx:649-651`), and remove the now-unused imports at lines 79-80.
- [ ] **Step 3: Delete** the five files.
- [ ] **Step 4: Grep** for any nav entry pointing at `/admin/ads` and repoint or remove it.
- [ ] **Step 5: Run** `npm run typecheck && npm run test`. Expected: PASS, no unused-symbol errors.
- [ ] **Step 6: Commit** `chore(fulfillment): retire mock /admin/ads in favor of the cockpit`.

## Task 8: Ship + verify

- [ ] **Step 1:** Full ship per the build-loop autopilot: push, watch deploy, smoke-test the live admin at a real tenant. Grep the live JS bundle to confirm the new build shipped.
- [ ] **Step 2:** Screenshot each of the four Paid Ads sub-tabs live for Jake and get sign-off.

---

## Self-Review

- **Spec coverage:** Campaigns (Task 5), Ad Library + Push (Task 6), Funnel (Task 5), Data & Leads (Task 4) all covered. Admin-tenant endpoints (Task 3) on the shared cores (Tasks 1-2). `/admin/ads` retired (Task 7).
- **Architecture note for the executor:** the DRY choice is to extract pure cores (Tasks 1-2) so client and admin routes share one implementation. Do NOT fork the ads logic into a second copy inside the admin endpoints.
- **Known net-new UI:** there is no existing campaign>adset>ad tree; Task 5 builds a grouped list, not a reuse.
- **Push-to-Meta risk:** the only write. Task 6 Step 5 has an explicit stop-and-split fallback to Phase 2b.
