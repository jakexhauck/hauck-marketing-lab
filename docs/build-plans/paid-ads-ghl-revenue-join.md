# Paid Ads: GHL revenue join, real thumbnails, per-tenant ad account

Spec + plan for three follow-ups on the just-shipped Paid Ads Meta wiring
(`functions/api/ads/insights.ts`). PLAN ONLY. Read alongside
`docs/connections/paid-ads-meta.md` (the "Known gaps" list this doc closes).

Preset: Web app feature. Fast path leans on the existing GHL join helpers
(`fetchAllOpportunities`, `resolvePipeline`, `resolveStages`). Modules in play:
M1 Research (the attribution SPIKE), M7 Infra (tenants column + migration),
M8 Security (per-tenant ad-account scoping so one client never reads another's
Meta account). No new UI IA; Creatives grid gets a thumbnail swap only.

Universal rule: never use em dashes in any output.

---

## Follow-up 1: Real revenue / ROAS / customers via a GHL job join

### Goal
Meta cannot report true "New customers", "Revenue from ads", or ROAS for a
lead-gen local business (it only has spend, impressions, clicks, leads, and
`action_values` which are 0 without purchase tracking). Replace the three fake
KPIs (`customers: 0`, and Meta's own `revenue`/`roas`) with real numbers by
joining ad-sourced leads to won jobs in the client's GHL and summing their
value.

### Definition of Done
- `/api/ads/insights` returns `totals.customers`, `totals.revenue`,
  `totals.roas` computed from GHL, not Meta.
- `customers` = count of ad-sourced contacts that reached the Sales Pipeline
  "Job Booked" or "Job Completed" stages (resolved BY NAME, id fallback
  `6o9Gx6e0TXRFJdln5d01`).
- `revenue` = sum of those opportunities' `monetaryValue` (this-month scope, to
  match the Meta spend window).
- `roas` = `revenue / spend`, 0 when spend is 0. Never a fabricated number: if
  the GHL join fails or finds nothing, all three are honest zeros and Meta's
  spend/leads still render.
- Numbers reconcile against a manual GHL count for Willis before ship.

### Attribution approach
Ad-sourced leads and won jobs live in DIFFERENT pipelines. Ad leads land in the
**Paid Ad's Pipeline** (`resolvePipeline`, id fallback `uz0fFxCgiwdXbg4Zmwkc`);
won work lives in the **Sales Pipeline** at Job Booked / Job Completed
(`resolveStages` in `functions/api/sales/jobs.ts`). The join therefore runs on
`contactId`, not on a single pipeline:

1. Build the ad-sourced **contact set** = every distinct `contactId` on an
   opportunity in the Paid Ad's Pipeline, unioned with contacts whose
   `utm_source` custom field reads a Meta value (facebook / instagram / meta /
   fb / ig / paid). Both signals are already reachable: pipeline via
   `fetchAllOpportunities({ pipelineId })`, utm via `customFieldKeyMap` +
   `attributionFromCustomFields` in `functions/lib/ghl.ts`.
2. Pull Sales Pipeline opportunities at Booked/Completed
   (`fetchAllOpportunities({ pipelineId: salesId })`, filter by the two resolved
   stage ids, same as `jobs.ts`).
3. A won job counts as an ad customer when its `contactId` is in the ad-sourced
   set. `customers` = count of matched opportunities;
   `revenue` = sum of their `monetaryValue`.

Scope revenue to jobs whose `lastStatusChangeAt` (fallback `updatedAt`) falls in
the current month so it lines up with `date_preset: this_month` spend. Keep this
window in one helper so it is easy to widen later.

### SPIKE (do FIRST, blocks the build)
Confirm how a Meta ad lead is actually identifiable in Willis's GHL. Three
candidate signals, in priority order:
- **A. utm custom fields** on the contact (`utm_source` = a Meta value). Most
  precise if populated. Verify with `ghl` CLI: pull 5 recent Paid-Ad contacts
  and inspect their custom fields for a populated `utm_source`.
- **B. Paid Ad's Pipeline membership** (contact has/had an opportunity there).
  Always true for ad leads by construction, but a lead that converts may have
  its opportunity MOVED into the Sales Pipeline rather than duplicated, in which
  case the won job's contact would no longer appear in the Paid Ad's Pipeline.
  Confirm: does converting a Paid-Ad lead create a NEW Sales-Pipeline
  opportunity (contact stays in both) or MOVE the existing one (contact leaves
  Paid Ad's Pipeline)? This decides whether B alone is sufficient.
- **C. A contact tag** (e.g. `facebook-lead`). Check whether Willis tags ad
  leads on intake.

Deliverable of the spike: one sentence stating which signal(s) are reliable for
Willis, written into `docs/connections/paid-ads-meta.md`. Build the union of A
and B (cheap, both already fetched); add C only if the spike shows A and B miss
real customers. Do NOT guess: if no signal reliably marks ad leads, ship
`customers`/`revenue`/`roas` as honest zeros with an `error` note and hand the
gap back to Jake rather than inventing attribution.

### Files
- **NEW `functions/lib/adsRevenue.ts`** - the join, isolated from the Meta code:
  - `resolvePaidPipelineId(pipes)` and `resolveSalesStages(pipes)` reusing the
    exact name/fallback logic already in `ads/leads/index.ts` and
    `sales/jobs.ts` (extract or duplicate the small resolvers; prefer extracting
    a shared `resolvePipelineByName` into `functions/lib/ghl.ts` if it stays
    tiny).
  - `adSourcedContactIds(gctx, paidPipelineId)`: distinct contactIds from the
    Paid Ad's Pipeline; optionally union utm-matched contacts via
    `fetchAllContacts` + `customFieldKeyMap` + `attributionFromCustomFields`
    (gate the utm arm behind the spike result).
  - `adRevenue(gctx): Promise<{ customers: number; revenue: number }>` doing the
    contactId join against Booked/Completed Sales opportunities, month-scoped.
  - Wrap in try/catch; on failure return `{ customers: 0, revenue: 0 }` so Meta
    numbers still render.
- **EDIT `functions/api/ads/insights.ts`**:
  - The handler needs GHL context. It currently reads only `ctx.env`; add
    `const t = ctx.data.tenant` and build `GhlContext` from
    `t.ghl_token` / `t.ghl_location_id` (populated by `_middleware.ts`).
  - After the Meta calls, `const { customers, revenue } = await adRevenue(gctx)`
    (run it inside the existing `Promise.all` batch to avoid a serial hop).
  - Set `totals.customers = customers`, `totals.revenue = round2(revenue)`,
    `totals.roas = spend > 0 ? round2(revenue / spend) : 0`. Drop the Meta
    `action_values` revenue for these fields (keep the `actionsValue(..,
    "action_values")` import only if still used elsewhere; it is not, so remove
    it and its now-dead uses).
  - Update the comment block on `AdsInsightsResponse.totals` to say
    revenue/roas/customers now come from the GHL job join, not Meta.
- **EDIT `src/lib/adsInsights.ts`**: no shape change (fields already exist);
  leave `demoAdsInsights()` as is (demo stays hand-authored).
- No frontend change: `AdsOverview.tsx` already renders these three KPIs.

### Verification
- `ghl` CLI: manually count Sales Pipeline Booked+Completed opportunities whose
  contact is ad-sourced for Willis this month; confirm the endpoint's
  `customers` matches and `revenue` sums the same `monetaryValue`s.
- Authed live smoke (Willis session): `GET /api/ads/insights` returns non-Meta
  revenue; with 0 ad spend, `roas` is 0 and does not divide-by-zero.
- Degradation: temporarily break the Sales pipeline name resolution and confirm
  the endpoint still returns Meta spend/leads with zeroed customers/revenue.

---

## Follow-up 2: Real ad thumbnails

### Goal
Replace the deterministic gradient placeholder in the Creatives grid with the
real Meta creative image.

### Definition of Done
- `AdItem` carries a `thumbnail` URL sourced from Meta
  `creative.thumbnail_url` (or `image_url`).
- `AdsCreatives.tsx` renders the real image when present and falls back to the
  existing gradient when absent (never a broken image).
- Images load in production without CSP or hotlink errors.

### Approach + concerns
- **Fetch**: `graphGet(token, /${account}/ads, { fields: ... })` already pulls
  `creative{...}`. Add `thumbnail_url` (and `image_url` as a secondary) to the
  creative subfield list. `buildAds()` reads
  `creative.thumbnail_url` into a new `thumbnail?: string`.
- **CSS url() format**: the frontend `thumbFor(i)` currently returns a raw
  `linear-gradient(...)` string assigned to `style.backgroundImage`. A real URL
  must be wrapped as `url("...")`; a gradient must NOT. Handle both: if
  `ad.thumbnail` is set use `url("${ad.thumbnail}")`, else the gradient string.
  Prefer a real `<img>` element over a background for correctness (alt text,
  lazy-load, natural fallback via `onError`), keeping the gradient as the
  container background behind it.
- **Hotlink / expiry**: Meta `thumbnail_url` points at an fbcdn host and can be
  short-lived / rate-limited. Two options, decide in build:
  - Simplest: hotlink directly (client browser to fbcdn). Works today; risk is
    occasional 403 on expired URLs, which the `onError` gradient fallback
    covers.
  - Robust: proxy through a new `functions/api/ads/thumb.ts?adId=` that fetches
    the Meta image server-side (agency token) and streams it with a cache
    header. Removes expiry/hotlink risk and hides the token. Recommend the proxy
    only if direct hotlinking shows 403s in the live smoke; otherwise ship
    direct.
- **CSP**: there is no app-level CSP blocking image hosts today (verify with a
  quick check of `functions/_middleware.ts` / any `content-security-policy`
  header). If one is added later, `img-src` must include the fbcdn host or the
  proxy route sidesteps it entirely.

### Files
- **EDIT `functions/api/ads/insights.ts`**: add `thumbnail_url` to the
  `creative{...}` field list; extend `AdItem` + `buildAds()` with `thumbnail`.
- **EDIT `src/lib/adsInsights.ts`**: add `thumbnail?: string` to `AdItem`;
  optionally set a demo thumbnail (leave gradient for demo is fine).
- **EDIT `src/routes/paid-ads/AdsCreatives.tsx`**: render `<img>` with the
  gradient container as fallback; drop or keep `thumbFor()` as the fallback
  background only.
- **NEW (only if proxy chosen) `functions/api/ads/thumb.ts`**: token-side image
  proxy with `Cache-Control`.

### Verification
- Live Creatives grid shows real ad images for a client with running creatives;
  paused/old ads with no thumbnail fall back to the gradient, no broken-image
  icon.
- Network tab: image requests return 200 (direct) or 200 from the proxy route.

---

## Follow-up 3: Per-tenant `meta_ad_account_id`

### Goal
Today the Meta ad account is the single `META_AD_ACCOUNT_ID` env var (one
client). Move it onto the tenant row so each client maps to its own account,
with the env var kept as the fallback for single-tenant deploys.

### Definition of Done
- `tenants` has a `meta_ad_account_id text` column.
- The insights endpoint reads `ctx.data.tenant.meta_ad_account_id` and falls
  back to `ctx.env.META_AD_ACCOUNT_ID`; a client with no account set and no env
  fallback returns `{ configured: false }`.
- Willis's live account is seeded by migration so behavior is unchanged after
  ship.
- Security: a client can only ever read the account on THEIR tenant row (scoping
  flows through the existing session -> tenant resolution in `_middleware.ts`).

### Files
- **EDIT `functions/lib/tenantResolve.ts`**:
  - Add `meta_ad_account_id: string | null;` to `TenantRow`.
  - Append `meta_ad_account_id` to the `TENANT_COLS` select string (this is the
    one place the column list lives; every loader uses it).
- **EDIT `functions/lib/env.ts`**:
  - Add `meta_ad_account_id?: string | null;` to `TenantContext`.
  - Keep the `META_AD_ACCOUNT_ID?` env field (now the fallback).
- **EDIT `functions/api/_middleware.ts`**:
  - In the live branch, set
    `meta_ad_account_id: tenant?.meta_ad_account_id ?? null` on the
    `ctx.data.tenant` object.
  - In the test branch, set `meta_ad_account_id: null` (test uses the env
    fallback / not-connected).
- **EDIT `functions/api/ads/insights.ts`**:
  - Replace `let account = ctx.env.META_AD_ACCOUNT_ID` with
    `let account = ctx.data.tenant.meta_ad_account_id || ctx.env.META_AD_ACCOUNT_ID`.
    The existing `act_` normalization and `{ configured: false }` guard stay.
- **EDIT `docs/connections/paid-ads-meta.md`**: mark the per-tenant column done;
  note the env var is now the fallback only.

### Migration SQL sketch
New file `supabase/migrations/0022_tenant_meta_ad_account.sql` (next number;
picked up automatically by `scripts/db-migrate.mjs`, then `npm run db:migrate`):

```sql
-- 0022: per-tenant Meta ad account id.
--
-- Moves the Paid Ads ad account off the single META_AD_ACCOUNT_ID env var and
-- onto the tenant row so one deployment can report each client's own Meta
-- account. The runtime reads tenants.meta_ad_account_id and falls back to the
-- env var when null (single-tenant deploys keep working). See
-- functions/api/ads/insights.ts and functions/lib/tenantResolve.ts.

alter table public.tenants
  add column if not exists meta_ad_account_id text;

-- Seed the live client (Willis Windows) so behavior is unchanged after ship.
-- Match by the stable GHL location id, not slug, so a rename cannot miss it.
update public.tenants
  set meta_ad_account_id = 'act_27110669075184924'
  where ghl_location_id = 'OznT3yyuwK3dqVXDsCaD'
    and (meta_ad_account_id is null or meta_ad_account_id = '');
```

Store the value WITH the `act_` prefix (the endpoint tolerates either via its
`startsWith("act_")` normalization). Confirm Willis's real `act_...` id against
the value currently set in the `META_AD_ACCOUNT_ID` CF secret before running the
migration.

### Verification
- `npm run db:migrate` applies 0022; `select slug, meta_ad_account_id from
  tenants` shows Willis populated, others null.
- Authed Willis smoke: `/api/ads/insights` still returns the same account's real
  numbers (now sourced from the column).
- A second tenant with no column value and no env fallback returns
  `{ configured: false }` (not another client's data).

---

## Sequencing
1. Follow-up 3 first (per-tenant account): smallest, unblocks correct scoping and
   is a prerequisite for testing more than one client. Ship it.
2. Follow-up 1 SPIKE, then the revenue join. Highest value, gated on the spike.
3. Follow-up 2 (thumbnails) last: cosmetic, independent, low risk.

Each ships on the Spine: build, verify with real GHL/Meta evidence (no "should
work"), commit, push, watch the CF deploy, smoke-test the live authed endpoint,
then `git rm` this plan and append any leftover Jake action items (e.g. seeding a
new client's `meta_ad_account_id`) to the action-items README.
