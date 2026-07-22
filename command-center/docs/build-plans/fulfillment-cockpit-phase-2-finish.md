# Fulfillment Cockpit Phase 2 (Paid Ads): Finish + Verify Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. NOTE: Tasks 1-3 are ship-finishing steps that need production creds and a logged-in admin browser (Jake), not code. Tasks 5-6 are the only code builds and are optional follow-ups.

**Goal:** Take the already-shipped Phase 2 Paid Ads cockpit (code merged to `main` at `c8eb77a`, CF auto-deploy triggered) from "shipped" to "verified live and closed out", then optionally land the two deferred follow-ups.

**Architecture:** The build is done and reviewed (whole-branch review verdict: ready to merge; one Important fixed in `31f5845`). What remains is: apply the one new DB migration, confirm the deploy, smoke-test the four Paid Ads sub-tabs against a real tenant (Willis), do the plan/memory housekeeping, and (later) build Push-to-Meta (Phase 2b) + a small honesty marker.

**Tech Stack:** Cloudflare Pages (auto-deploy on push to `main`), Supabase (migration via `npm run db:migrate`, Management API + ledger), React + TypeScript admin app, Meta Graph API v21.0 + GHL. Secrets via Doppler / `command-center/app/.env.local`.

## Global Constraints

- **Never use em dashes** in any output (code, comments, UI copy, docs, commit messages). Use commas, periods, parentheses, or colons.
- **Honest states only.** Never fabricate a number. A not-connected or empty surface shows a short specific message, never "your account is connected, results will appear here" filler.
- **Migrations run via `npm run db:migrate`** (Management API + ledger), never the Supabase SQL editor.
- **Read-only cockpit** except the creatives POST (Task 6 adds the only new write, Push-to-Meta, and it is opt-in).
- **What already shipped (do not rebuild):** shared cores `functions/lib/{metaGraph,adsCore,adsMedia,paidAdsPipeline}.ts`; admin endpoints `functions/api/admin/clients/[tenantId]/ads/{insights,media,leads,creatives}`; UI `src/components/admin/cockpit/paidads/{PaidAdsTab,DataLeadsPanel,CampaignsPanel,FunnelPanel,AdLibraryPanel}.tsx`; migration file `command-center/app/supabase/migrations/0027_client_ad_creatives.sql`; mock `/admin/ads` retired. All on `main` at `c8eb77a`. 352 tests green.

---

## Task 1: Apply migration 0027 (creates `client_ad_creatives`)

**Files:**
- Apply (already committed): `command-center/app/supabase/migrations/0027_client_ad_creatives.sql`

**Why:** The Ad Library sub-tab's draft-creatives tracker reads and writes `client_ad_creatives`. Until the table exists, the creatives endpoint degrades to an honest `{ creatives: [], unavailable: true }` and the tracker section shows "unavailable" (no crash). Applying the migration lights it up.

- [ ] **Step 1: Run the migration.**

```bash
cd command-center/app
npm run db:migrate
```

Expected: the runner reports `0027_client_ad_creatives` as newly applied and writes its ledger row. Migrations `0001`-`0026` report as already applied (skipped). Exit code 0.

- [ ] **Step 2: Confirm the table exists.** In the Supabase dashboard (Table editor) or via the project's SQL read path, confirm `public.client_ad_creatives` exists with columns `id, tenant_id, media_ref, headline, primary_text, status, created_by, created_at` and an index on `tenant_id`. The `status` column has a check constraint `in ('draft','approved','live')`.

- [ ] **Step 3: Sanity-check the ledger.** Confirm the migration ledger now lists `0027` as applied so it is never re-run.

---

## Task 2: Confirm the Cloudflare deploy landed

**Files:** none (verification only).

**Why:** The push to `main` (`c8eb77a`) triggers a CF Pages build automatically, but the deploy must be confirmed before smoke-testing, so the live bundle actually contains this code.

- [ ] **Step 1 (option A, lets the agent watch it): add the CF token.** Put a Cloudflare Pages API token into `command-center/app/.env.local` as `CLOUDFLARE_API_TOKEN=...` (Cloudflare dashboard > My Profile > API Tokens > Create Token > Account > Cloudflare Pages > Edit). Then:

```bash
cd command-center/app
node scripts/cf.mjs deploy:watch c8eb77a
```

Expected: polls until the deployment matching `c8eb77a` reports success.

- [ ] **Step 1 (option B, no token): use the dashboard.** In the Cloudflare Pages dashboard for the command-center project, confirm the latest deployment's commit is `c8eb77a` and its status is Success.

- [ ] **Step 2: Confirm the live bundle changed.** Load the live admin app in a browser, view source or the network tab, and note the hashed JS bundle name (e.g. `index-XXXXXXXX.js`). It should differ from the pre-Phase-2 bundle. This is the "grep the live bundle" confidence check the house build loop uses.

---

## Task 3: Live smoke-test the four Paid Ads sub-tabs against Willis

**Files:** none (manual verification in a logged-in admin browser).

**Why:** The admin cockpit is auth-gated, so this cannot be automated headlessly. A human confirms each sub-tab reads real, correct, honest data for a real tenant before sign-off. Willis is the live client with a wired Meta account (`tenants.meta_ad_account_id`, migration 0022) and GHL creds.

- [ ] **Step 1: Open the cockpit.** Log in as admin, go to `/admin/delivery`, click Willis in the roster. The URL becomes `/admin/delivery/<willisTenantId>`. Click the **Paid Ads** service tab (`?tab=paid-ads`). Note `<willisTenantId>` from the URL for the checks below.

- [ ] **Step 2: Data & Leads (`?tab=paid-ads&sub=data-leads`).** Confirm: per-ad metric tiles + totals show Willis's real this-month Meta spend/leads (cross-check against Meta Ads Manager for the same account/month), and the incoming leads table lists Willis's Paid Ad's Pipeline opportunities. If Meta is connected but zero spend this month, every figure is an honest zero (not blank, not fabricated). If GHL has no Paid Ad's Pipeline, the leads section says so specifically.

- [ ] **Step 3: Campaigns (`?tab=paid-ads&sub=campaigns`).** Confirm the campaign to ad-set to ad tree renders Willis's real campaigns, with each ad's status (active/paused), spend, and leads. Ads with no campaign/ad-set name group under an honest "No campaign" / "No ad set" bucket rather than disappearing.

- [ ] **Step 4: Ad Library (`?tab=paid-ads&sub=ad-library`).** Confirm the top section shows Willis's real Meta media library (images/videos). Confirm the draft-creatives tracker (bottom) loads now that migration 0027 is applied (Task 1): create one test creative via the form, see it appear with its status chip, then delete or ignore it. Confirm the honest "Pushing creatives to the client's Meta account is coming in a follow-up" note is present.

- [ ] **Step 5: Funnel (`?tab=paid-ads&sub=funnel`).** Confirm it shows the honest "Coming Soon" placeholder (the intended end state, matching the client app's own Funnel copy), not a broken or empty view.

- [ ] **Step 6: Not-connected check (optional, strong).** If you have a tenant with no `meta_ad_account_id`, open its Paid Ads tab and confirm Data & Leads / Campaigns / Ad Library all show the honest "Meta is not connected for this client yet" state, NOT another client's numbers. (This is the exact bug fixed in `31f5845`.)

- [ ] **Step 7: Sign off.** If all four sub-tabs read right, Phase 2 is verified live. Tell the agent to close out Task 8 of the original build (the build's ledger at `hml-worktrees/fulfillment/.superpowers/sdd/progress.md`).

---

## Task 4: Close-out housekeeping

**Files:**
- Append to: `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md`
- Delete: `command-center/docs/build-plans/fulfillment-cockpit-phase-2-paid-ads.md` and this file (`fulfillment-cockpit-phase-2-finish.md`) once its steps are done
- Update: memory `project_fulfillment_cockpit` + `MEMORY.md` index line to "verified live"

**Why:** House rules: shipped build plans get `git rm`'d in the same spirit as the code that closes them, and any residual Jake-only action items move to the action-items README first. Do this only AFTER Task 3 sign-off.

- [ ] **Step 1: Move any residual action items.** Append to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` anything still outstanding after sign-off (e.g. "Phase 2b: build Push-to-Meta" if not doing Task 5 now; "connect Meta for tenants beyond Willis").

- [ ] **Step 2: Delete the shipped plans.**

```bash
git rm "command-center/docs/build-plans/fulfillment-cockpit-phase-2-paid-ads.md"
git rm "command-center/docs/build-plans/fulfillment-cockpit-phase-2-finish.md"
git commit -m "docs: retire shipped Fulfillment Paid Ads (Phase 2) build plans"
```

- [ ] **Step 3: Update memory.** In `project_fulfillment_cockpit.md` and its `MEMORY.md` index line, change Phase 2 from "SHIPPED (live-verify pending)" to "SHIPPED+VERIFIED LIVE" with the date, and note whether migration 0027 is applied.

---

## Task 5 (deferred follow-up): Phase 2b, Push-to-Meta

**Files:**
- Create: `command-center/app/functions/api/admin/clients/[tenantId]/ads/creatives/[creativeId]/push.ts`
- Create: `command-center/app/functions/api/admin/clients/[tenantId]/ads/creatives/[creativeId]/push.test.ts`
- Modify: `command-center/app/src/hooks/useApi.ts` (add `usePushAdCreative(tenantId)` mutation)
- Modify: `command-center/app/src/components/admin/cockpit/paidads/AdLibraryPanel.tsx` (add "Push to Meta" button + status transition to `live`)

**Interfaces:**
- Consumes: `loadTenantById` (`functions/lib/tenantResolve.ts`), `resolveAdAccount` (`functions/lib/metaGraph.ts`), `META_SYSTEM_USER_TOKEN`, the `client_ad_creatives` row.
- Produces: `POST /api/admin/clients/:tenantId/ads/creatives/:creativeId/push` -> uploads the creative's asset to the tenant's Meta ad account media library (`POST /act_<id>/adimages` for images, `/advideos` for video) and, on success, flips that creative's `status` to `live`; returns the updated row.

**Why it was split out:** The push is the only outward write to a client's real Meta account and could not be verified against the live System-User token from the build environment. It needs testing against Willis's real account before it ships.

- [ ] **Step 1: Write the failing test.** Stub `fetch` for the Meta upload edge and the Supabase update. Assert: a valid creative with an image `media_ref` calls `POST /act_<account>/adimages` with the System-User token, and on a 200 flips `status` to `live`; a Meta non-2xx response leaves `status` unchanged and returns a 502 with the Meta error message; an unknown `creativeId` for the tenant returns 404.

```bash
cd command-center/app
npm run test -- creatives
```

Expected: FAIL (module not found).

- [ ] **Step 2: Implement `push.ts`.** Mirror the admin-tenant skeleton (getServiceClient 503, `loadTenantById` 404). Load the creative by `id` scoped to `tenant_id` (404 if not found). Resolve the account via `resolveAdAccount(tenant.meta_ad_account_id ?? undefined, undefined)` (no env fallback, same as the other admin ads endpoints). Upload the asset (`/adimages` vs `/advideos` by inferred type). On success, update the row's `status` to `live` and return it; on Meta failure return 502 with the error and leave the row unchanged. Import depth from this file to `functions/lib` is SEVEN levels (`../../../../../../../lib/...`); confirm by counting, typecheck confirms.

- [ ] **Step 3: Run the test to green.**

```bash
npm run test -- creatives
```

Expected: PASS.

- [ ] **Step 4: Wire the UI.** Add `usePushAdCreative(tenantId)` to `useApi.ts` (mutation that POSTs to the push route and invalidates the creatives query key). In `AdLibraryPanel.tsx`, add a "Push to Meta" button per draft/approved creative that calls it; on success the status chip flips to `live`. Remove the "coming in a follow-up" note. Keep honest error surfacing if the push fails.

- [ ] **Step 5: Typecheck + test.**

```bash
npm run typecheck && npm run test
```

Expected: PASS.

- [ ] **Step 6: Verify against Willis's real account, THEN commit.** With a real (non-destructive) test image, push one creative to Willis's account from the live cockpit and confirm it appears in Willis's Meta media library and the row flips to `live`. Only after that lands cleanly:

```bash
git add -A
git commit -m "feat(fulfillment): Paid Ads Ad Library Push to Meta (Phase 2b)"
```

If the upload fights the real token, STOP: keep Ad Library as the internal tracker, leave the "coming in a follow-up" note, and log the specific token/permission blocker here for a later pass. Do not ship an unverified write to a client's ad account.

---

## Task 6 (optional polish): distinguish "GHL not wired" from "zero leads" on admin leads

**Files:**
- Modify: `command-center/app/functions/api/admin/clients/[tenantId]/ads/leads.ts`
- Modify: `command-center/app/src/components/admin/cockpit/paidads/DataLeadsPanel.tsx`

**Why:** Today the admin leads endpoint returns `{ leads: [], total: 0 }` when a tenant's GHL creds do not resolve, which the panel renders identically to "connected but genuinely zero leads." An operator cannot tell them apart. This is a logged Minor (T3) from the whole-branch review, non-blocking.

- [ ] **Step 1: Add the marker.** In `leads.ts`, when `resolveGhlCreds(tenant, ctx.env)` returns null, return `{ leads: [], total: 0, configError: "ghl_not_configured" }` instead of the bare empty shape (mirrors the existing `configError: "pipeline_not_found"` convention).

- [ ] **Step 2: Render a distinct state.** In `DataLeadsPanel.tsx`, when the leads response carries `configError === "ghl_not_configured"`, show a specific honest message ("GHL is not connected for this client yet.") distinct from the "No leads have come in yet." zero-state.

- [ ] **Step 3: Typecheck + test + commit.**

```bash
cd command-center/app
npm run typecheck && npm run test
git commit -am "feat(fulfillment): honest ghl-not-configured state on admin Paid Ads leads"
```

Expected: PASS.

---

## Self-Review

- **Coverage of the outstanding checklist:** migration apply (Task 1), deploy confirm (Task 2), 4-sub-tab live smoke test + not-connected check (Task 3), plan/memory close-out (Task 4). The two deferred items from the whole-branch review (Phase 2b Push-to-Meta, T3 marker) are Tasks 5-6.
- **What is NOT in scope:** rebuilding any shipped code; Phases 4-5 (Google Reviews, Reactivation) which have their own plans; Web Design Phase 3 (already shipped separately).
- **Ordering:** Task 1 (migration) must precede Task 3 Step 4 (Ad Library tracker check). Task 2 (deploy confirm) must precede all of Task 3. Task 4 (delete plans + mark verified) must follow Task 3 sign-off. Tasks 5-6 are independent and can happen any time after Task 3.
- **Human-gated by nature:** Tasks 1-3 need production creds and a logged-in admin browser; they cannot be fully automated. Task 5 Step 6 requires a real Meta account to verify before commit.
