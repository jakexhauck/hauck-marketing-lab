# Fulfillment Cockpit Phase 4: Google Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the four Google Reviews sub-tabs (Funnel, All Reviews, Requests, Reputation Report) inside the admin Fulfillment cockpit (`/admin/delivery/:tenantId?tab=google-reviews`) with a specific tenant's real reviews data where a real source exists, and honest "pending Google verification" states where it does not.

**Architecture:** The client-facing Reviews endpoints (`functions/api/reviews/*`) resolve the tenant from the logged-in session (`ctx.data.tenant`). We add admin-tenant endpoints under `functions/api/admin/clients/[tenantId]/reviews/*` that load the tenant explicitly and reuse the exported GHL cores. **Reality check up front:** only Funnel and Requests have a live backing source today (the GHL review + sales pipelines). All Reviews and the Reputation Report depend on the Google Business Profile (GBP) API v4, which is not built and is gated on Google approval. Those two sub-tabs ship as honest "pending Google verification" states, not demo data, and light up when GBP lands.

**Tech Stack:** React + TypeScript, react-router-dom, React Query, Tailwind + `pk-` design-kit classes, Vitest. Backend: Cloudflare Pages Functions reading GHL pipelines (+ GBP later). Secrets via Doppler.

## Global Constraints

- **Never use em dashes** in any output: code, comments, UI copy, docs.
- **Vendor names allowed here** (admin-only surface). GHL / Google may be named in the UI.
- **Honest empty / error states only. No connected-placeholder chatter.** For the GBP-blocked sub-tabs, show a specific "pending Google verification" state, not demo tiles and not "connected, data will appear here" filler.
- **Read-only.** Every surface in this plan is a viewer. No writes (the client "start review campaign" POST is not ported to admin).
- **TDD:** the GHL rollup/classify cores get Vitest coverage (some already exist in `reviews/funnel.test.ts`) before the admin endpoint consumes them.
- **Test command:** `npm run test` (from `command-center/app`). Typecheck: `npm run typecheck`.
- **Secrets:** reuse per-tenant `ghl_token`; `GOOGLE_PLACES_API_KEY` for the (mostly dead) Places summary. GBP secrets are out of scope until approval. New secrets go into Doppler.

## The Admin-Tenant Endpoint Pattern (linchpin)

Client endpoints read `ctx.data.tenant` (session, `_middleware.ts:146-158`). Admin routes (`_middleware.ts:87-100`) get `ctx.data.admin` but **no `ctx.data.tenant`**; the handler loads the tenant from `ctx.params.tenantId`.

**Critical gotcha:** `getTenantById` (`functions/lib/adminAuth.ts:60`) **omits `ghl_token`**. Reviews Funnel + Requests are GHL-backed, so admin reviews endpoints must use `loadTenantById` (`functions/lib/tenantResolve.ts:114`), which includes `ghl_token`, `ghl_location_id`, and `google_place_id`.

Endpoint skeleton (auth enforced upstream; do not re-check admin identity):

```ts
// functions/api/admin/clients/[tenantId]/reviews/<name>.ts  (count depth for imports)
import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { loadTenantById } from "../../../../../../lib/tenantResolve";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
  // tenant.ghl_token, tenant.ghl_location_id, tenant.google_place_id available.
};
```

## React Hook Pattern (shared)

Mirror `useAdminClientDetailQuery` (`src/hooks/useApi.ts:259`). Example:

```ts
export function useAdminReviewsFunnelQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "reviews", "funnel"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () => api<ReviewFunnelData>(`/api/admin/clients/${tenantId}/reviews/funnel`),
  });
}
```

Reuse the client return types (`ReviewFunnelData`, `ApiReviewContact`) so the admin endpoints return identical shapes.

---

## File Structure

**Backend (new):**
- Create `functions/api/admin/clients/[tenantId]/reviews/funnel.ts` (GHL review pipeline rollup).
- Create `functions/api/admin/clients/[tenantId]/reviews/requests.ts` (GHL sales pipeline "Job completed" + review-tag conversions).

**Backend (refactor for reuse):**
- Modify `functions/api/reviews/index.ts`: export the currently module-private `resolveStage` and the `startedSet` lookup (or extract them into a shared `reviewsRequestsCore(gctx)` function) so the admin endpoint reuses them instead of duplicating. The funnel cores (`resolveReviewPipeline`, `rollupReviewFunnel`, `classifyReviewStage`) are already exported from `functions/api/reviews/funnel.ts`.

**Frontend (new):**
- Create `src/components/admin/cockpit/reviews/ReviewsTab.tsx` (routes the 4 sub-tabs by `activeSub`).
- Create `src/components/admin/cockpit/reviews/FunnelPanel.tsx`, `RequestsPanel.tsx`, `AllReviewsPanel.tsx`, `ReputationReportPanel.tsx`.
- Add hooks to `src/hooks/useApi.ts`.

**Frontend (modified):**
- Modify `src/lib/deliveryCockpit.ts`: flip `google-reviews` + the `funnel` and `requests` sub-tabs to `ready: true`; leave `all-reviews` and `reputation-report` `ready: false` (GBP-blocked) with an honest pending state.
- Modify `src/routes/admin/DeliveryCockpit.tsx`: render `<ReviewsTab/>` for `activeService === "google-reviews"`.

---

## Task 1: Reviews Funnel endpoint + panel

**Files:**
- Create: `functions/api/admin/clients/[tenantId]/reviews/funnel.ts`.
- Create: `src/components/admin/cockpit/reviews/ReviewsTab.tsx`, `FunnelPanel.tsx`.
- Modify: `src/hooks/useApi.ts`, `src/routes/admin/DeliveryCockpit.tsx`, `src/lib/deliveryCockpit.ts`.

**Interfaces:**
- Consumes: `resolveReviewPipeline`, `rollupReviewFunnel`, `classifyReviewStage` (exported from `functions/api/reviews/funnel.ts`); `ghlJson`, `fetchAllOpportunities`, `GhlContext` from `functions/lib/ghl.ts`.
- Produces: `GET /api/admin/clients/:tenantId/reviews/funnel` returning `ReviewFunnelData`; `useAdminReviewsFunnelQuery(tenantId)`.

- [ ] **Step 1:** Build `funnel.ts` mirroring `functions/api/reviews/funnel.ts:162`: build `GhlContext` from the loaded tenant's `ghl_token`/`ghl_location_id`, fetch pipelines via `ghlJson`, `resolveReviewPipeline` by name, `fetchAllOpportunities`, `rollupReviewFunnel`. Return the same `ReviewFunnelData` shape. If no review pipeline resolves, return an honest empty funnel (all zeros with a `resolved: false` flag), not fabricated numbers.
- [ ] **Step 2:** Add `useAdminReviewsFunnelQuery(tenantId)` to `useApi.ts`.
- [ ] **Step 3:** Build `ReviewsTab.tsx` taking `{ tenantId, activeSub }`, switching on `activeSub`. Render `FunnelPanel` for `funnel`; the other three render honest placeholders for now.
- [ ] **Step 4: FunnelPanel** reads `useAdminReviewsFunnelQuery(tenantId)` and renders the request → click → review funnel, reusing `ReviewsFunnelView` from `src/routes/reviews/ReviewsFunnelView.tsx` if it accepts the funnel data as a prop; otherwise render the stage counts directly. Loading, error, honest-empty states.
- [ ] **Step 5:** In `DeliveryCockpit.tsx`, replace the `google-reviews` placeholder branch with `<ReviewsTab tenantId={tenantId} activeSub={activeSub ?? "funnel"} />`. Flip `google-reviews` + `funnel` sub-tab to `ready: true`.
- [ ] **Step 6:** Hit `/api/admin/clients/<tenantId>/reviews/funnel` live to confirm real JSON. Typecheck, test, eyeball, screenshot.
- [ ] **Step 7: Commit** `feat(fulfillment): Google Reviews Funnel panel`.

## Task 2: Reviews Requests endpoint + panel

**Files:**
- Modify: `functions/api/reviews/index.ts` (export/extract `resolveStage` + the started-tag lookup).
- Create: `functions/api/admin/clients/[tenantId]/reviews/requests.ts`.
- Create: `src/components/admin/cockpit/reviews/RequestsPanel.tsx`.
- Modify: `src/hooks/useApi.ts`, `src/lib/deliveryCockpit.ts`.

**Interfaces:**
- Consumes: the GHL sales pipeline "Job completed" stage + the `"request review"` tag lookup.
- Produces: `GET /api/admin/clients/:tenantId/reviews/requests` returning `{ contacts: ApiReviewContact[], truncatedAt?: number }`; `useAdminReviewsRequestsQuery(tenantId)`.

- [ ] **Step 1: Refactor for reuse.** In `reviews/index.ts`, the "requests sent + who converted" logic is module-private. Extract a shared `reviewsRequestsCore(gctx: GhlContext): Promise<{ contacts: ApiReviewContact[], truncatedAt?: number }>` that resolves the Sales pipeline "Job completed" stage (current `resolveStage`), lists contacts in that stage, and marks `started` from the `"request review"` tag (current `startedSet`, capped at `STARTED_LOOKUP_CAP = 50`). Repoint the client `onRequestGet` GET to call it. Run tests; behavior unchanged.
- [ ] **Step 2: Admin endpoint.** `requests.ts` GET builds `GhlContext` from the loaded tenant and returns `reviewsRequestsCore(gctx)`. GET only; do NOT port the client POST (the tag-add campaign enrollment stays a client action).
- [ ] **Step 3:** Add `useAdminReviewsRequestsQuery(tenantId)` to `useApi.ts`.
- [ ] **Step 4: RequestsPanel** renders the completed-jobs list with each contact's name, completed date, and a "requested / not yet" chip from `started`. Honest empty when none. Note the `STARTED_LOOKUP_CAP` truncation honestly if `truncatedAt` is set.
- [ ] **Step 5:** Flip `requests` sub-tab to `ready: true`. Typecheck, test, eyeball, screenshot.
- [ ] **Step 6: Commit** `feat(fulfillment): Google Reviews Requests panel`.

## Task 3: All Reviews + Reputation Report (honest pending states)

**Files:**
- Create: `src/components/admin/cockpit/reviews/AllReviewsPanel.tsx`, `ReputationReportPanel.tsx`.
- Modify: `src/lib/deliveryCockpit.ts` (leave both sub-tabs `ready: false`).

**Reality check:** per the research, per-review content and the live star rating require GBP API v4, which is not built and is approval-gated (project 691475481242). The client All Reviews and Reputation Report render `<ReviewsComingSoon/>` in real sessions. The Places summary (`reviews/summary.ts`) is effectively dead for service-area businesses like Willis. So this task ships honest pending states, not live data, and does NOT build a GBP integration.

- [ ] **Step 1: AllReviewsPanel** renders a specific, honest state: "Individual reviews and the live star rating turn on once Google Business Profile access is approved for this client." No demo tiles, no fabricated rating. If a later phase wires GBP, this panel becomes the render target.
- [ ] **Step 2: ReputationReportPanel** renders the same class of honest pending state, scoped to the report ("The shareable reputation report generates from live review data, available once Google Business Profile access is approved."). Do NOT port the client `ReviewsInsights.tsx` hardcoded `STATS`/`TREND`/`SOURCES` demo constants.
- [ ] **Step 3:** Wire both into `ReviewsTab.tsx`. Keep `all-reviews` and `reputation-report` `ready: false` in `deliveryCockpit.ts` so the tabs read as intentionally pending, consistent with the shell convention.
- [ ] **Step 4: Typecheck, eyeball, screenshot** both pending states.
- [ ] **Step 5: Commit** `feat(fulfillment): Google Reviews pending states for All Reviews + Reputation Report`.

## Task 4: Ship + verify

- [ ] **Step 1:** Full ship per build-loop autopilot: push, watch deploy, smoke-test live, grep the live JS bundle.
- [ ] **Step 2:** Screenshot all four sub-tabs live for Jake (two real: Funnel, Requests; two honest-pending: All Reviews, Reputation Report) and get sign-off.

---

## Self-Review

- **Spec coverage:** Funnel (Task 1), Requests (Task 2), All Reviews + Reputation Report (Task 3, honest pending). All four covered, with the GBP dependency called out rather than faked.
- **Reuse over rebuild:** funnel cores already exported; Task 2 exports the requests core so both routes share it.
- **Honesty:** the two GBP-blocked sub-tabs get specific pending copy, not demo data, per the no-connected-placeholder-chatter rule. They light up when the GBP track lands (its own future plan).
- **Dependency to flag to Jake:** All Reviews + Reputation Report cannot show live data until Google approves GBP API access. This is a Google-side blocker, not a build gap.
