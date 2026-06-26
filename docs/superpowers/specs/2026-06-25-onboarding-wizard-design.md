# Onboarding Wizard (GHL provisioning + readiness) - Design Spec

Date: 2026-06-25
Status: Approved design, pending implementation plan

## Summary

A new admin **Onboarding** tab in the command center that turns client onboarding into a guided,
agency-operated console: pick a client, fill one grouped setup form, hit **Provision to GHL** to
write all of that client's GHL custom values in one shot, then work a merged readiness view that
auto-verifies what the API can confirm and tracks the rest as a manual checklist.

This supersedes the earlier `docs/build-plans/Onboarding/` plan (magic-link client intake + a
separate 27-task manual checklist with GHL automation explicitly dropped). The decisions below
reverse that: onboarding is agency-operated, GHL provisioning is the core, and the checklist merges
into the readiness view.

## Locked decisions (from brainstorming)

1. **One unified Onboarding tab** - not a separate provisioning tab, not two onboarding surfaces.
2. **Agency enters everything** - no client-facing form, no magic link. The agency operator fills
   the setup form during onboarding.
3. **Configure-only** - the GHL subaccount already exists (operator creates it + loads the snapshot
   in GHL manually). The wizard configures it; it does NOT create subaccounts or load snapshots.
4. **One merged readiness view** - the 27-task ops checklist becomes the readiness screen. The
   wizard auto-ticks what it can verify; the rest are manual checkboxes.
5. **Setup console UX** (not a linear step wizard) - a single sectioned page per client: fill →
   provision → verify, re-runnable, no forced step navigation.

## Architecture

Everything lives in the existing `command-center/app`, following current patterns:

- **Frontend:** new admin tab.
  - Nav item in `src/routes/admin/AdminLayout.tsx` (`{ to: "/admin/onboarding", label: "Onboarding", icon: ... }`).
  - Route in `src/App.tsx` wrapped in `<AdminRoute>`.
  - Pages: `src/routes/admin/AdminOnboarding.tsx` (client list) and an onboarding detail view per
    client, using the standard `<DesktopPage>` shell.
- **Backend:** Cloudflare Pages Functions under `functions/api/admin/onboarding/*`, matching the
  existing admin endpoint pattern (`functions/api/admin/clients/*`).
- **GHL calls** reuse `functions/lib/ghl.ts` (public API, `services.leadconnectorhq.com`). No new
  GHL plumbing.
- **Storage:** new Supabase tables via a migration applied with `npm run db:migrate`.

### Public-API constraint (important)

The app uses GHL's **public** API. That supports: validating the token, reading/writing custom
values, and reading calendars. It does NOT expose deep workflow internals (published state, the flip
webhook header). Because the snapshot ships those already wired (the flip webhooks reference
`{{custom_values.location_api_token}}`), the wizard treats them as trusted-by-snapshot and does not
re-check them. Auto-checks are therefore limited to: token valid, custom values written, calendars
present. Everything else is a manual checkbox.

## Data model

Two new tables (plus reuse of `tenants`):

### `onboarding` (one row per client)
- `tenant_id` uuid (FK to tenants, unique)
- `fields` jsonb - all setup values the operator typed (business, rep, calendars). JSON blob so new
  fields don't require a migration.
- `status` text - `draft` -> `provisioned` -> `ready`
- `provision_result` jsonb - result of the last Provision run: per-field written/failed/not-found + errors
- `provisioned_at` timestamptz, `updated_at` timestamptz

### `onboarding_checklist` (one row per client per task)
- `tenant_id` uuid (FK)
- `task_key` text - stable id for one of the ~27 ops tasks
- `done` boolean, `value` text (nullable, for tasks that capture a value e.g. budget/offer)
- `done_at` timestamptz, `done_by` text
- primary key (`tenant_id`, `task_key`)

### `tenants` (existing - not the JSON blob)
- The GHL **location ID** writes to `tenants.ghl_location_id`.
- The all-scopes **token** writes to `tenants.ghl_token` (backend-only, never returned to the browser).

## The setup form (grouped)

Each business/rep/calendar field maps 1:1 to a GHL custom value **by name**. The two connection
fields are the exception and write to `tenants`.

- **Connection (2):** GHL Location ID, all-scopes Token.
- **Business (~8):** Company Name, Company Phone, From Name, From Email, Review Google URL, GMB
  Reviews Link, review request link, Database Reactivation Offer, Database Reactivation Relevance,
  Custom Contest Prize.
- **Rep & internal alerts (~8):** rep first name, rep full name, rep personal phone, Internal
  Notification From Name, Internal Notification From Email, Internal Notification SMS, To Custom
  Email, To Custom Number.
- **Calendars & confirmation pages (~8):** Intro Call Calendar, Intro Call 2nd Chance Calendar, Home
  Estimate Calendar, Facebook Home Estimate Calendar, FB Calendar Link, Calendar Link, Intro Call
  Confirmation Website, Intro Call 2nd Chance Confirmation Website.

The exact field-to-custom-value name map is derived from the test account's 26 custom values and
will be encoded as a single source-of-truth mapping table in the backend.

**Save draft:** the form persists to `onboarding.fields` without provisioning, so it can be filled
across sessions; pushing to GHL is a separate explicit action.

## Provisioning logic

`POST /api/admin/onboarding/[tenantId]/provision`:

1. Load the client's saved `fields`; store location ID + token on the tenant.
2. **Token preflight:** a cheap authenticated GET. If it fails (401 / missing scope), stop and write
   nothing; return a clear "token invalid or missing scope" error.
3. `GET /locations/{loc}/customValues`; build a name -> id map for that subaccount.
4. For each form field, resolve its custom value by name and `PUT /locations/{loc}/customValues/{id}`
   with the value. Custom-value IDs are resolved live, never hard-coded.
5. Collect a per-field result: `written` / `failed` / `not_found` (snapshot didn't include it).
   Not all-or-nothing - partial success is reported field by field.
6. Save `provision_result`, set `status = provisioned`, return the summary.

**Idempotent:** every write is a PUT update, so re-running re-applies the same values with no
duplicates or side effects. Fix a field, push again.

## Readiness view

- **Auto-checks** (re-runnable): token valid · every mapped custom value non-empty (re-GET) ·
  expected calendars present (`GET /calendars/`). Each renders green/red with a reason.
- **Manual checklist:** the ~27 ops tasks (connect Google Calendar, connect phone, verify sending
  email, add + assign user, publish workflows, creative, campaign build/QA, launch/monitor).
  Tickable, persisted to `onboarding_checklist`. The few the wizard can prove (custom values
  written, token connected, calendars present) auto-tick from the auto-checks.
- **Overall status:** a client reads "Ready to launch" only when the required auto-checks pass and
  the required manual tasks are done.

## Error handling

- Bad/expired/under-scoped token: caught at preflight, writes nothing, clear message.
- Custom value missing from the subaccount (snapshot gap or rename): reported as `not_found`,
  skipped, never crashes the run.
- GHL rate limit / 5xx: the existing `ghl.ts` client retries idempotent calls (PUT/GET).
- Token confidentiality: `ghl_token` is written from the form but never selected back to the
  browser; the form shows a "token set" state, not the value.

## Testing

- `npm run typecheck` and `npm run build` stay green.
- Unit tests for the field -> custom-value name-matching: correct IDs resolved, missing values
  reported (not silently dropped).
- Real end-to-end smoke test against the test subaccount `r0WfsA12qpBv7M185V3v` (snapshot loaded,
  all-scopes token): provision for real, confirm all 26 custom values are written, run readiness,
  watch checks go green.
- Edge paths: bad token stops cleanly; double-provision is idempotent; a deliberately-missing custom
  value is reported, not crashed.

## Out of scope (explicitly, for this phase)

- Creating GHL subaccounts or loading snapshots via API (phase 2).
- Any client-facing form / magic-link intake.
- Workflow publish/activate via API (manual checklist item; needs internal API the app lacks).
- Deep workflow/webhook auto-verification (trusted-by-snapshot).
