# Fulfillment Cockpit Phase 5: Reactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the two Reactivation sub-tabs (Campaign, Results) inside the admin Fulfillment cockpit (`/admin/delivery/:tenantId?tab=reactivation`) with a specific tenant's real reactivation data where a real source exists, and honest empties where it does not.

**Architecture:** The client-facing Reactivation endpoints (`functions/api/campaigns/reactivation.ts`, `functions/api/reactivation/messages.ts`) resolve the tenant from the logged-in session (`ctx.data.tenant`). We add an admin-tenant endpoint under `functions/api/admin/clients/[tenantId]/reactivation/*` that loads the tenant explicitly and reuses a pure rollup core extracted from the client handler.

**This is the thinnest service, and it is partly blocked by missing data sources.** Per research, of the six intended data points, only two are real today (replies, leads booked), one is a labeled proxy (audience = pipeline count), and three have no backing source (offer, send status, campaign template copy). Revenue recovered needs a new reactivation-specific join. This plan builds the **Results** sub-tab from real data, builds **Campaign** from what is real plus honest empties, and flags the gaps to Jake so he can decide whether to add stored config (offer text, send schedule) as a follow-up.

**Tech Stack:** React + TypeScript, react-router-dom, React Query, Tailwind + `pk-` design-kit classes, Vitest. Backend: Cloudflare Pages Functions reading the GHL "Database Reactivation" pipeline. Secrets via Doppler.

## Global Constraints

- **Never use em dashes** in any output: code, comments, UI copy, docs.
- **Vendor names allowed here** (admin-only surface). GHL may be named in the UI.
- **Honest empty / error states only. No connected-placeholder chatter.** Label the audience-size proxy honestly ("Contacts in the reactivation pipeline"), never fabricate a send status or offer. Show a short empty state where no source exists.
- **Read-only.** Every surface in this plan is a viewer. No writes.
- **TDD:** the pure reactivation rollup core gets Vitest coverage before the admin endpoint consumes it.
- **Test command:** `npm run test` (from `command-center/app`). Typecheck: `npm run typecheck`.
- **Secrets:** reuse per-tenant `ghl_token`. New secrets (none expected) go into Doppler.

## The Admin-Tenant Endpoint Pattern (linchpin)

Client endpoints read `ctx.data.tenant` (session, `_middleware.ts:146-158`). Admin routes (`_middleware.ts:87-100`) get `ctx.data.admin` but **no `ctx.data.tenant`**; the handler loads the tenant from `ctx.params.tenantId`.

**Critical gotcha:** `getTenantById` (`functions/lib/adminAuth.ts:60`) **omits `ghl_token`**. Reactivation is GHL-backed, so the admin endpoint must use `loadTenantById` (`functions/lib/tenantResolve.ts:114`), which includes `ghl_token` + `ghl_location_id`.

Endpoint skeleton (auth enforced upstream; do not re-check admin identity):

```ts
// functions/api/admin/clients/[tenantId]/reactivation/index.ts  (count depth for imports)
import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { loadTenantById } from "../../../../../../lib/tenantResolve";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
  // tenant.ghl_token, tenant.ghl_location_id available.
};
```

## React Hook Pattern (shared)

Mirror `useAdminClientDetailQuery` (`src/hooks/useApi.ts:259`). The client hooks (`useReactivation`, `useReactivationMessages`) are session-scoped with fixed URLs and cannot be reused; add a new tenantId-keyed hook:

```ts
export function useAdminReactivationQuery(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "clients", tenantId, "reactivation"],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: () => api<AdminReactivationData>(`/api/admin/clients/${tenantId}/reactivation`),
  });
}
```

Reuse the client `ReactivationData` shape (`src/lib/reactivation.ts:8-17`) for the rollup portion of `AdminReactivationData`.

---

## Reality Check (read before building)

| Data point | Real source today? | Plan handling |
|---|---|---|
| Replies | Yes (`replied` bucket) | Results tile, real |
| Leads booked | Yes (`booked` bucket) | Results tile, real |
| Audience size | Proxy only (`reached` = opps in pipeline) | Label honestly as "Contacts in the reactivation pipeline" |
| Revenue recovered | No (needs a new reactivation join) | Task 3, new join; if reactivation opps carry no dollar values, honest empty |
| Message copy (template) | No (only per-contact sent previews exist) | Campaign shows recent sent messages, honest note that the template is not stored |
| Offer | No source | Honest empty; optional admin-entered config is a flagged follow-up, not built here |
| Send status | No source (only inferred "Running" from reached>0) | Do not fabricate; omit or show "Status not tracked" |

---

## File Structure

**Backend (new):**
- Create `functions/lib/reactivationCore.ts`: a pure `rollupReactivation(pipe, opps): ReactivationData` extracted from the inline logic in `functions/api/campaigns/reactivation.ts` (the `bucketForStage` + tally loop).
- Create `functions/api/admin/clients/[tenantId]/reactivation/index.ts`: the admin rollup + messages endpoint.

**Backend (refactor for reuse):**
- Modify `functions/api/campaigns/reactivation.ts`: call `rollupReactivation` from `reactivationCore.ts` instead of the inline loop. Behavior unchanged.
- (Task 3) Add a reactivation revenue join, either in `reactivationCore.ts` or a new `functions/lib/reactivationRevenue.ts`, reusing the pure helpers (`completedInMonth`, `tallyRevenue`) from `functions/lib/adsRevenue.ts` but keyed on the "Database Reactivation" pipeline, not the `"facebook ad"` tag.

**Frontend (new):**
- Create `src/components/admin/cockpit/reactivation/ReactivationTab.tsx` (routes the 2 sub-tabs by `activeSub`).
- Create `src/components/admin/cockpit/reactivation/CampaignPanel.tsx`, `ResultsPanel.tsx`.
- Add the hook to `src/hooks/useApi.ts`.

**Frontend (modified):**
- Modify `src/lib/deliveryCockpit.ts`: flip `reactivation` + both sub-tabs to `ready: true`.
- Modify `src/routes/admin/DeliveryCockpit.tsx`: render `<ReactivationTab/>` for `activeService === "reactivation"`.

---

## Task 1: Extract the reactivation rollup core

**Files:**
- Create: `functions/lib/reactivationCore.ts`
- Test: `functions/lib/reactivationCore.test.ts`
- Modify: `functions/api/campaigns/reactivation.ts`

**Interfaces:**
- Produces: `function rollupReactivation(opps: GhlOpportunity[]): ReactivationData` (buckets each opp by stage name into `reached/replied/booked/noAnswer/notFit`, exactly as `bucketForStage` + the tally loop do today). Keep `bucketForStage` exported for the test. `ReactivationData` matches `src/lib/reactivation.ts:8-17`.

- [ ] **Step 1: Write the failing test** feeding a handful of stubbed `GhlOpportunity` rows across the stage names (`"estimate scheduled"`, `"not a fit"`, `"replied"`, an unknown stage) and asserting the resulting counts match the current `campaigns/reactivation.ts` output.
- [ ] **Step 2: Run** `npm run test -- reactivationCore`, confirm FAIL.
- [ ] **Step 3: Implement** `reactivationCore.ts` by lifting `bucketForStage` (`campaigns/reactivation.ts:47-67`) and the tally loop into `rollupReactivation(opps)`. Keep the bucket string mapping identical.
- [ ] **Step 4: Rewrite** `campaigns/reactivation.ts` `onRequestGet` to resolve the pipeline + `fetchAllOpportunities` as it does now, then `return Response.json(rollupReactivation(opps))`.
- [ ] **Step 5: Run** `npm run test` + `npm run typecheck`. Expected: PASS, client Reactivation unchanged.
- [ ] **Step 6: Commit** `feat(fulfillment): extract reactivation rollup core`.

## Task 2: Admin reactivation endpoint + Results panel

**Files:**
- Create: `functions/api/admin/clients/[tenantId]/reactivation/index.ts`
- Create: `src/components/admin/cockpit/reactivation/ReactivationTab.tsx`, `ResultsPanel.tsx`
- Modify: `src/hooks/useApi.ts`, `src/routes/admin/DeliveryCockpit.tsx`, `src/lib/deliveryCockpit.ts`

**Interfaces:**
- Consumes: `rollupReactivation` (Task 1); `ghlJson`, `fetchAllOpportunities`, `GhlContext` from `functions/lib/ghl.ts`; the pipeline-by-name resolution (`PIPELINE_NAME = "database reactivation"`, fallback id `A7PNIqk4Fg1HINtirAmR`) from `campaigns/reactivation.ts`.
- Produces: `interface AdminReactivationData extends ReactivationData { /* revenue added in Task 3 */ }`; `GET /api/admin/clients/:tenantId/reactivation`; `useAdminReactivationQuery(tenantId)`.

- [ ] **Step 1:** Build `reactivation/index.ts`: load the tenant via `loadTenantById`, build `GhlContext`, resolve the "Database Reactivation" pipeline by name (reuse the constant), `fetchAllOpportunities`, `rollupReactivation`, return the `ReactivationData` shape. If the pipeline does not resolve, return honest zeros with a `resolved: false` flag.
- [ ] **Step 2:** Add `useAdminReactivationQuery(tenantId)` to `useApi.ts`.
- [ ] **Step 3:** Build `ReactivationTab.tsx` taking `{ tenantId, activeSub }`, switching on `activeSub` (`campaign` / `results`). Render `ResultsPanel` for `results`; `campaign` renders an honest placeholder until Task 4.
- [ ] **Step 4: ResultsPanel** reads `useAdminReactivationQuery(tenantId)` and renders the real tiles: Replies (`replied`), Leads booked (`booked`), and the rate rows from `reactRates()` (`src/lib/reactivation.ts:54`). Reuse the `pk-report` tiles for consistency. Revenue recovered shows "Coming next" until Task 3. Honest empty when the pipeline has no opportunities.
- [ ] **Step 5:** In `DeliveryCockpit.tsx`, replace the `reactivation` placeholder branch with `<ReactivationTab tenantId={tenantId} activeSub={activeSub ?? "campaign"} />`. Flip `reactivation` + `results` sub-tab to `ready: true`.
- [ ] **Step 6:** Hit `/api/admin/clients/<tenantId>/reactivation` live to confirm real JSON. Typecheck, test, eyeball, screenshot.
- [ ] **Step 7: Commit** `feat(fulfillment): Reactivation Results panel`.

## Task 3: Revenue recovered (new reactivation join)

**Files:**
- Create: `functions/lib/reactivationRevenue.ts` (or extend `reactivationCore.ts`)
- Test: `functions/lib/reactivationRevenue.test.ts`
- Modify: `functions/api/admin/clients/[tenantId]/reactivation/index.ts`, `functions/api/campaigns/reactivation.ts` (optional, to also show it client-side), `src/components/admin/cockpit/reactivation/ResultsPanel.tsx`

**Interfaces:**
- Consumes: the pure helpers `completedInMonth`, `tallyRevenue` from `functions/lib/adsRevenue.ts` (reusable building blocks; the `"facebook ad"` tag + Sales-pipeline constants in that file are NOT reused).
- Produces: `reactivationRevenueThisMonth(opps: GhlOpportunity[], zone: string, nowMs?: number): { revenue: number; wonCount: number }` summing `monetaryValue` on booked/won reactivation-pipeline opportunities this month.

- [ ] **Step 1: Write the failing test** feeding booked reactivation opps with `monetaryValue` set (and some without) and asserting the summed revenue + won count for the current month.
- [ ] **Step 2: Run** `npm run test -- reactivationRevenue`, confirm FAIL.
- [ ] **Step 3: Implement** `reactivationRevenueThisMonth` summing `monetaryValue` on opps in the booked/won buckets closed this month, reusing `completedInMonth`/`tallyRevenue` where they fit. **If reactivation opps carry no dollar values in GHL** (verify against a real tenant), the function returns `{ revenue: 0, wonCount }` and the UI shows an honest "Revenue not tracked on reactivation opportunities for this client" rather than a fake number.
- [ ] **Step 4:** Add the revenue field to `AdminReactivationData`, wire it into the admin endpoint, and render it in `ResultsPanel` (real number or the honest empty from Step 3).
- [ ] **Step 5: Run** `npm run test` + `npm run typecheck`. Verify against a real tenant whether reactivation opps carry values; record the finding in the PR.
- [ ] **Step 6: Commit** `feat(fulfillment): Reactivation revenue recovered join`.

## Task 4: Campaign panel (real where possible, honest empties elsewhere)

**Files:**
- Create: `src/components/admin/cockpit/reactivation/CampaignPanel.tsx`
- Modify: `src/hooks/useApi.ts` (optional messages hook), `src/lib/deliveryCockpit.ts`

**Interfaces:**
- Consumes: `useAdminReactivationQuery(tenantId)` for the audience proxy; optionally a new admin messages endpoint mirroring `functions/api/reactivation/messages.ts` for recent sent previews.

- [ ] **Step 1: CampaignPanel** renders, honestly:
  - **Audience:** the `reached` count from `useAdminReactivationQuery`, labeled "Contacts in the reactivation pipeline" (not "audience size", which we cannot source).
  - **Message copy:** if you build an admin messages endpoint (mirroring `reactivation/messages.ts` with `loadTenantById`), show recent sent SMS/email previews with a one-line note "This shows recent sent messages. The campaign template is managed in GHL." If you skip the messages endpoint this phase, render an honest empty for message copy.
  - **Offer:** honest empty ("The reactivation offer is not stored in the app yet.").
  - **Send status:** omit, or render "Status not tracked" (do not infer "Running").
- [ ] **Step 2:** Flip `campaign` sub-tab to `ready: true` (the panel is honest about what it can and cannot show, which satisfies the shell convention).
- [ ] **Step 3: Typecheck, eyeball, screenshot.**
- [ ] **Step 4: Commit** `feat(fulfillment): Reactivation Campaign panel`.

## Task 5: Ship + verify

- [ ] **Step 1:** Full ship per build-loop autopilot: push, watch deploy, smoke-test live, grep the live JS bundle.
- [ ] **Step 2:** Screenshot both sub-tabs live for Jake and get sign-off. Surface the two decisions below.

---

## Self-Review

- **Spec coverage:** Campaign (Task 4), Results (Task 2 + revenue in Task 3). Both sub-tabs covered.
- **Reuse over rebuild:** the rollup core (Task 1) is shared between client and admin routes; the revenue join reuses `adsRevenue.ts`'s pure helpers without its tag/pipeline constants.
- **Honesty over fake data:** audience is a labeled proxy; offer, send status, and template copy are honest empties, not fabricated.

## Decisions to surface to Jake (do not decide these solo)

1. **Revenue recovered** is only real if reactivation opportunities carry dollar values in GHL. Task 3 Step 5 verifies this against a real tenant; if they do not, revenue stays an honest empty until GHL data changes.
2. **Offer + send status + campaign template copy** have no source in the app today. This plan shows honest empties. If Jake wants these populated, that is a separate follow-up adding stored config (an admin-entered offer, list size, and schedule per tenant), which is net-new data modeling, not a wiring task.
