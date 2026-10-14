# Fulfillment > Onboarding

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

**Status: built and verified on localhost (2026-07-26). Not shipped.** Parts 1-4
and 6 are done; Part 5 is still deliberately out of scope. Migration 0054 has
been applied to the live database (the standing exception to localhost-first);
everything else is uncommitted local code awaiting a ship decision.

**It is a page, not a tab.** This was first built as a ninth tab inside the
Fulfillment cockpit and moved on Jake's call: onboarding is its own job, so it
gets its own page under Fulfillment alongside Clients and the Setter Suite. What
that changed, against the plan below:

- `/admin/onboarding` - roster of every client with recorded progress
  (`AdminOnboarding.tsx` + `components/admin/onboarding/OnboardingRoster.tsx`).
- `/admin/onboarding/:tenantId` - one client's record, same shell as the cockpit
  (`OnboardingClient.tsx`), with an "Open cockpit" link across.
- The record body lives at `components/admin/onboarding/record/` and is a plain
  component, no longer a cockpit tab. `deliveryCockpit.ts` is back to eight tabs.
- `GET /api/admin/onboarding` now returns brand fields plus `tasksDone` /
  `tasksTotal` for the rail.
- The readiness endpoint records what GHL answered into `onboarding_checklist`,
  so the rail's count matches the record's without calling GHL once per client.
  Without that the rail read 0/9 while the record read 2 of 9.
- `AdminDelivery` and `AdminOnboarding` share `components/admin/PickPrompt.tsx`
  rather than each carrying a copy of the "pick a client" styling.

**Goal.** One page per client that is the whole onboarding record: how far along
they are, what is left to do, the GHL setup values we push into their
sub-account, and what they told us at intake.

**Where.** A new service tab in the Fulfillment cockpit,
`/admin/delivery/:tenantId?tab=onboarding`, sitting second in the tab bar (right
after Overview, since onboarding comes before delivery).

**Definition of done.** Open a real client, see their true onboarding status,
tick a checklist item and have it survive a reload, edit a setup field and save
it, press Provision and watch the values land in GHL, read and edit their intake
answers. No demo data anywhere on the page.

## What already exists (do not rebuild)

An earlier phase built the entire backend and never gave it a UI:

- `supabase/migrations/0018_onboarding.sql` - tables `onboarding` (tenant_id,
  fields jsonb, status, provision_result, provisioned_at) and
  `onboarding_checklist` (tenant_id, task_key, done, value, done_at, done_by).
  Both service-role only, no RLS policies.
- `functions/api/admin/onboarding/index.ts` - GET, every client + status.
- `functions/api/admin/onboarding/[tenantId].ts` - GET saved fields/status,
  PUT saves them (GHL location id + token are diverted onto `tenants`, the raw
  token is never stored in `onboarding.fields`).
- `functions/api/admin/onboarding/[tenantId]/checklist.ts` - GET/PUT one task.
- `functions/api/admin/onboarding/[tenantId]/readiness.ts` - GET, live checks
  against GHL (token authenticates, mapped custom values non-blank, calendars
  exist).
- `functions/api/admin/onboarding/[tenantId]/provision.ts` - POST, writes every
  mapped field into the client's GHL custom values, records the result, and
  auto-ticks `provision-values` when it all wrote.
- `src/lib/onboarding.ts` (+ `onboarding.test.ts`) - the 28 mapped fields in
  four groups, the 9-task checklist in three phases, `buildProvisionPlan`,
  `summarizeReadiness`.

Nothing in `src/` calls any of it. The only references to `/admin/onboarding`
are dead links in `src/lib/pillars.ts`.

The intake questionnaire is defined separately in `src/lib/clientOnboarding.ts`
and drives the unwired wizard at `/admin/clients/new`. Its answers have nowhere
to go today. This build gives them one.

## Part 1 - Database

**`supabase/migrations/0054_onboarding_intake.sql`** (new)

```sql
alter table public.onboarding
  add column if not exists intake jsonb not null default '{}'::jsonb;
```

A separate column, not a merge into `fields`: `fields` is keyed by the GHL
provisioning map and `buildProvisionPlan` walks it. Intake answers share the
row, not the namespace.

Before anything else, confirm `0018` was ever applied to the live database. If
the tables are missing, apply `0018` then `0054`.

## Part 2 - API

**`functions/api/admin/onboarding/[tenantId].ts`** (edit)

- GET: also return `intake` from the row (default `{}`).
- PUT: accept an optional `intake` object and upsert it alongside `fields`. A
  body with only `intake` must not blank `fields`, and the reverse.

No other endpoint changes. Checklist, readiness and provision are already right.

## Part 3 - Client data layer

**`src/lib/onboarding.ts`** (edit, additive)

- `INTAKE_FIELDS`: derived from `clientOnboarding.ONBOARDING_FIELDS` (imported
  under an alias, since both modules export that name) filtered to steps 4-6,
  the client-answered half. Reused, not retyped, so a field added to the wizard
  shows up here too. File-type fields render as a text input holding the link to
  where the asset lives.
- `checklistPhases()`: the 9 tasks grouped into their three phases, in order.
- `checklistProgress(items)`: `{ done, total, pct }` over the saved states.
- `onboardingStage(status, progress)`: the one-line human label for the header.

Tests go in the existing `src/lib/onboarding.test.ts`.

**`src/lib/api.ts`** (edit) - response types:
`AdminOnboardingResponse` (fields, intake, status, hasToken, provisionResult),
`AdminOnboardingChecklistResponse`, `AdminOnboardingReadinessResponse`,
`AdminProvisionResponse`.

**`src/hooks/useApi.ts`** (edit) - six hooks, following the Billing pair's shape:

- `useAdminOnboardingQuery(tenantId)`
- `useAdminOnboardingSave(tenantId)` - PUT, invalidates the query
- `useAdminOnboardingChecklistQuery(tenantId)`
- `useAdminOnboardingChecklistToggle(tenantId)` - PUT one task, optimistic
- `useAdminOnboardingReadinessQuery(tenantId)` - manual refetch, it hits GHL
  live and is slow; `staleTime` high, `refetchOnWindowFocus` off
- `useAdminOnboardingProvision(tenantId)` - POST, invalidates onboarding +
  checklist + readiness on success

## Part 4 - UI

**`src/lib/deliveryCockpit.ts`** (edit) - add `"onboarding"` to `ServiceTab` and
`{ id: "onboarding", label: "Onboarding", ready: true }` as the second entry in
`SERVICE_TABS`. No sub-tabs: this is one record on one page.

**`src/components/admin/cockpit/onboarding/OnboardingTab.tsx`** (new) - stacked
sections in the `.pk-kit` admin theme, top to bottom:

1. **Status strip** - status pill (Draft / Provisioned), "N of 9 done" progress
   bar, last-provisioned timestamp, and the **Provision to GHL** button with its
   result (written / failed / not found) shown plainly underneath. Disabled with
   a reason when the location id or token is missing.
2. **Readiness** - the three live GHL checks with a Re-check button. Honest
   "not wired up yet" state when there is no token.
3. **Checklist** - three phase cards (GHL Setup, Connections, Go Live), each
   task a tick row. Auto tasks are marked as auto and reflect readiness.
4. **Setup values** - the 28 mapped fields in their four groups (Connection,
   Business, Rep & Alerts, Calendars), collapsible, one Save for the lot. Token
   is a password input that never renders a stored value (the API never returns
   it); `hasToken` shows as "token on file".
5. **Intake answers** - the client's questionnaire, grouped by wizard step
   (Contact & Legal, Targeting & Ops, Story & Assets), editable, one Save.

Split into `StatusStrip`, `ReadinessCard`, `ChecklistCard`, `FieldGroups` and
`IntakeCard` in the same folder if the file passes ~350 lines.

**`src/routes/admin/DeliveryCockpit.tsx`** (edit) - render `<OnboardingTab
tenantId={tenantId} />` for `activeService === "onboarding"`.

## Part 5 - Follow-up, deliberately not in this build

The new-client wizard at `/admin/clients/new` still saves nothing. Once this tab
exists, the wizard's steps 4-6 have a home (`onboarding.intake`) and wiring it is
a small, separate job. Until then intake answers are typed or pasted into this
tab, which is how they arrive today anyway (a Google Form emailed to the client).

## Part 6 - Verify

Localhost first, per the standing rule: wrangler on 8788 + vite on 5173 against
prod data. Open a real client, exercise every save and the provision button,
screenshot the page. Only then commit and ship.

Risk to watch: Provision writes to the client's live GHL sub-account. Test it
against the test sub-account first, never against Willis.

### What was actually verified (Test Account, 2026-07-26)

- The tab loads real state: token check green, 4 calendars found, 10 mapped
  custom values still blank. Two of nine steps done, all of it from live GHL.
- Saving an intake answer wrote to `onboarding.intake` and survived a reload.
- Ticking a manual task wrote to `onboarding_checklist` with `done_by` set to
  the admin id, and progress moved from 2/9 to 3/9.
- Light and dark themes both check out; the layout collapses correctly at narrow
  widths (container queries, not viewport ones - the roster rail means this tab
  is far narrower than the window).
- Test data was removed afterwards: the checklist row deleted, intake set back
  to `{}`.
- **Push values to GHL has not been fired.** It writes to a live sub-account and
  is the one action worth watching happen rather than reading about.

### One fix worth remembering

Both editable cards seed their form state once, on mount, and are keyed by
tenant id. The obvious `useEffect(() => setValues(props), [props])` looks right
and is a trap: React Query refetches on window focus, so alt-tabbing away and
back would hand the card a fresh object and wipe whatever was half-typed.
BillingTab still has that pattern; worth revisiting when it is next touched.
