# Build Plan: Auto-Provision GHL Sub-Account on Client Create

Status: PLANNED (not yet executing). Filed 2026-06-22.

## Goal

When you create a new client profile in the Command Center admin, the software
provisions a fresh GoHighLevel sub-account for that client in one reviewed step:
creates the sub-account, stamps your standard snapshot onto it, fills custom
values, adds team users, and applies standard tags/pipelines. The new
`locationId` is written back onto the tenant so the rest of the app (leads,
inbox, reporting) is wired up automatically.

Today this is ~20 minutes of manual clicking in GHL per client. Target: one form
+ one confirm click.

## Definition of done

- Admin fills the existing "new client" form, plus a few GHL fields.
- A review screen shows exactly what will be created (sub-account name, snapshot,
  custom values, users, tags). Nothing is created until "Provision" is clicked.
- On confirm: GHL sub-account created, snapshot applied, custom values set, users
  added, tags applied.
- `tenants.ghl_location_id` is populated with the real id (no longer `"pending"`),
  and the tenant has a working data token so leads/inbox load.
- Failures are surfaced clearly and the tenant is left in a retryable state (not a
  half-broken account with no way back).
- Audit log entry written via the existing `logAdminAction()`.

## Decisions locked (2026-06-22)

| Decision | Choice |
|---|---|
| Plan tier | Confirmed: API sub-account creation is unlocked (Agency Pro / SaaS). |
| Auth | Agency-level **Private Integration Token (PIT)** held server-side. No Marketplace OAuth app for v1. |
| Automation | **Review, then one-click provision.** Not automatic on client create. |
| Automated setup scope | Snapshot + custom values + users + **tags & pipelines**. |
| Out of scope (stays manual) | LC Phone / A2P, domain & email auth (Mailgun), Stripe/payments connect. |

## How this fits the existing codebase

The app is already deeply GHL-integrated, so most plumbing exists.

- **Backend:** Cloudflare Pages Functions at `command-center/app/functions/`.
- **GHL HTTP layer:** `command-center/app/functions/lib/ghl.ts`
  - `GhlContext { token, locationId }`, `ghlFetch()`, `ghlJson()`.
  - Important: `ghlFetch` retries GET/PUT/DELETE on 5xx/429 but **never retries
    POST** (avoids duplicate side effects). Our create-location call is a POST, so
    we own retry/idempotency ourselves.
  - API version pinned to `2021-07-28`, base `https://services.leadconnectorhq.com`.
- **Client create endpoint:** `command-center/app/functions/api/admin/clients/index.ts`
  - POST creates the tenant; when GHL creds are omitted it stores `ghl_location_id
    = "pending"`, `ghl_token = "pending"`.
- **Admin UI:** `command-center/app/src/routes/admin/AdminClientDetail.tsx`
  (reads/writes `ghlLocationId` / `ghlToken`, shows Connected vs Not connected).
- **Existing GHL-on-create-side precedent:** the import-staff endpoint
  (`functions/api/admin/clients/[tenantId]/import-staff.ts`) already reads a
  tenant's GHL token and calls GHL to list/import users. The provisioning users
  step mirrors this.
- **Data store:** Supabase `tenants` table. Migrations in
  `command-center/app/supabase/migrations/`, applied via `npm run db:migrate`.
- **Secrets:** Cloudflare Pages env vars (never in the browser bundle).

## The one real unknown — read this first (Phase 0)

**Token model for the NEW sub-account.** The agency PIT can create the sub-account
(an agency-level action). But the rest of the app talks to a sub-account using a
**location-level** token stored in `tenants.ghl_token`. An agency PIT is not
guaranteed to work for per-location data endpoints (opportunities, conversations).

Three possible outcomes, to be confirmed in the Phase 0 spike:

1. **Agency PIT works for location endpoints** (scoped broadly) → store the agency
   PIT as the tenant token, or reference a shared one. Cleanest.
2. **Must mint a location token** → there is a "Get Location Access Token from
   Agency Token" endpoint, but it is part of the OAuth marketplace flow, not PIT.
   If PIT can't mint one, this path forces a (later) OAuth app.
3. **Create a location PIT manually** in each new sub-account (GHL allows up to 5
   per location) and paste it in → one small manual step per client, still leaves
   95% of provisioning automated.

**Plan assumption:** until the spike proves otherwise, assume outcome 3 (a small
manual "paste the new sub-account's data token" step), and treat full token
automation as a fast-follow once outcome 1/2 is confirmed. This keeps the build
honest and shippable.

Also confirm in Phase 0 (docs are gated behind Agency Pro + JS-rendered, so verify
against the live account, not memory):
- Exact `POST /locations/` request body field names.
- Whether the snapshot is passed as `snapshotId` (string) or a `snapshot: { id,
  type }` object, and the valid `type` values (`own` / `imported` / `vertical`).
- Whether snapshot loading is **synchronous or async/queued** (it is usually
  async). If async, the review screen and write-back must not assume the snapshot
  is fully applied at the moment the create call returns.
- The agency `companyId` value (often required in the create body).

## Architecture

```
Admin UI (review screen)
        |  POST /api/admin/clients/:tenantId/provision-ghl   (admin-auth)
        v
Pages Function: provision-ghl.ts
        |  reads agency PIT from env (GHL_PROVISIONING_TOKEN)
        |  1. create sub-account (+ snapshotId)        [POST /locations/]
        |  2. set custom values                        [per-field POST]
        |  3. add users                                [POST users]
        |  4. apply tags / confirm pipelines           [POST/GET]
        v
Supabase tenants: write ghl_location_id, ghl_company_id,
                  ghl_provisioned_at, ghl_provision_status, ghl_token
```

Two-call shape (because we chose review-then-confirm):
- **Existing** `POST /api/admin/clients` — creates the tenant row as today
  (status leaves GHL as `pending`). Unchanged except it can store the form's GHL
  config (snapshot choice, custom-value answers) for the review step.
- **New** `POST /api/admin/clients/:tenantId/provision-ghl` — does the actual GHL
  work, idempotently, and writes results back. This is the button the review
  screen calls. Keeping it separate means a failed provision never blocks tenant
  creation and can be retried.

## Data model changes

New migration `command-center/app/supabase/migrations/0016_ghl_provisioning.sql`:

```sql
alter table public.tenants
  add column if not exists ghl_company_id      text,
  add column if not exists ghl_provisioned_at  timestamptz,
  add column if not exists ghl_provision_status text not null default 'none';
  -- status: none | provisioning | provisioned | failed
```

(`ghl_location_id` / `ghl_token` already exist.)

## Build phases (file-by-file)

### Phase 0 — Spike / prerequisites (no app code)
- [ ] Generate an **agency-level PIT** in GHL with scopes: `locations.write`,
      `snapshots.readonly` (or as required), `users.write`, `contacts.write`,
      `locations/customValues.write`, `locations/tags.write`. Note the exact scope
      names GHL shows.
- [ ] Capture the **snapshot id(s)** for your standard client template, and the
      agency **companyId**.
- [ ] Hand-test `POST /locations/` with curl/Postman: confirm body schema, snapshot
      param shape, sync-vs-async, and the response payload (does it return a token?).
- [ ] Resolve the **token model** question above (outcome 1/2/3).
- [ ] Document the confirmed request/response in this file before writing code.

### Phase 1 — Server: GHL provisioning lib
File: `command-center/app/functions/lib/ghl-provision.ts` (new; keep separate from
the data-plane `ghl.ts` so the agency-token surface is isolated).
- [ ] `createSubAccount(agencyCtx, input)` → POST `/locations/` with snapshot.
      Own retry/idempotency (ghl.ts won't retry POSTs). Use an idempotency guard:
      before creating, check whether this tenant already has a non-pending
      `ghl_location_id` and refuse to double-create.
- [ ] `setCustomValues(locationCtx, values)`.
- [ ] `addUsers(locationCtx, users)` (mirror import-staff's user shape).
- [ ] `applyTags(locationCtx, tags)` and `listPipelines(locationCtx)` to confirm the
      snapshot's pipelines landed.
- [ ] Typed result object summarizing what was done / what failed per step.

### Phase 2 — Server: provision endpoint
File: `command-center/app/functions/api/admin/clients/[tenantId]/provision-ghl.ts` (new).
- [ ] Admin-auth guard (copy the pattern from import-staff).
- [ ] Set `ghl_provision_status = 'provisioning'`.
- [ ] Read `GHL_PROVISIONING_TOKEN` from env; build agency `GhlContext`.
- [ ] Run the lib steps in order; collect per-step results.
- [ ] On success: write `ghl_location_id`, `ghl_company_id`, `ghl_provisioned_at`,
      `ghl_provision_status = 'provisioned'`, and the data token (per Phase 0
      outcome). Call `logAdminAction(..., "client.provision_ghl", tenantId, {...})`.
- [ ] On failure: set status `failed`, return a structured error naming the step
      that failed; do NOT delete the tenant (retryable).

### Phase 3 — Env / secrets
- [ ] Add `GHL_PROVISIONING_TOKEN` to `.env.example` (Pages-only section) and to the
      Cloudflare Pages dashboard secrets.
- [ ] Optionally `GHL_DEFAULT_SNAPSHOT_ID` and `GHL_COMPANY_ID` as env defaults.

### Phase 4 — Admin UI: review + provision
File: `command-center/app/src/routes/admin/AdminClientDetail.tsx` (extend).
- [ ] Add GHL provisioning fields to the create/detail form: snapshot picker
      (default from env), custom-value answers, users to add, tags.
- [ ] Add a **review screen / confirm dialog** listing exactly what will be created.
- [ ] "Provision in GHL" button → calls the new endpoint; shows per-step progress
      and the final result. Surface the "paste data token" step if Phase 0 = outcome 3.
- [ ] Reflect `ghl_provision_status` in the existing Connected/Not connected UI
      (add Provisioning / Failed states).

### Phase 5 — Verify (per Hauck Build Rules: real evidence)
- [ ] Provision a throwaway test sub-account end to end; confirm in the GHL UI that
      the snapshot, custom values, users, and pipelines all landed.
- [ ] Confirm the new tenant's leads/inbox load in the app (token works).
- [ ] Force a mid-way failure (bad snapshot id) and confirm clean `failed` state +
      retry works without creating a duplicate sub-account.
- [ ] Playwright screenshot of the review screen and the success state.

## Error handling & idempotency

- Create-location is non-idempotent and un-retried by the shared client. Guard
  against double-create by checking `ghl_location_id` / `ghl_provision_status`
  before the POST, and short-circuit if already provisioned/in-progress.
- If snapshot loading is async, mark `provisioned` only after a confirmation step
  (poll the location, or accept "submitted" and verify pipelines in Phase 5),
  whichever Phase 0 establishes.
- Partial success (sub-account made, but tag step failed) → status `failed` with a
  note of the last good step; the retry should be safe to re-run the remaining
  steps without recreating the account.

## Security

- Agency PIT lives only in Cloudflare Pages secrets, used only inside Pages
  Functions. Never sent to the browser, never logged.
- Per M8: this touches an agency-wide credential that can create billable
  accounts. Run `security-review` before shipping.
- Consider scoping the PIT to the minimum scopes confirmed in Phase 0.

## Explicitly out of scope (manual, for now)

- LC Phone number provisioning + A2P 10DLC registration.
- Sending domain / Mailgun / email authentication.
- Stripe / payments connect (manual OAuth in GHL).
- Marketplace OAuth app (only needed if this ever ships to other agencies, or if
  Phase 0 proves the location data token must be OAuth-minted).

## Jake's action items (when we execute)

1. In GHL, create an **agency Private Integration Token**; copy it somewhere safe.
2. Grab the **snapshot id** for your standard client template and your agency
   **companyId** (I'll tell you exactly where to click).
3. Paste the PIT into Cloudflare Pages secrets as `GHL_PROVISIONING_TOKEN` (or hand
   it to me to set via `!`).
4. Pick one **throwaway client name** we can use to test-provision and then delete.
5. Confirm the list of standard **custom values, users, and tags** every new client
   should get (so the review screen defaults are right).
```
