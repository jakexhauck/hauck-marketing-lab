# Sales Calls

Spec and implementation plan in one document. Branch `feat/sales-calls`, worktree
`hml-worktrees/sales-calls`, cut from `feat/cold-call-review`.

## What this is

The demo call. A cold caller books a business owner onto Hauck Marketing's own
calendar; this is the page Jake runs that call from, and the place the outcome
is recorded.

It closes a gap the cold-call work names out loud. From `ColdCallBooked.tsx`:

> A meeting that has been and gone sits under "Already happened" until its lead
> is moved on to Qualified or Closed, which is the honest state of things until a
> showed / no-showed outcome exists to record.

This builds that outcome.

## What already exists

Established by reading the code and probing the live account, not assumed:

- `functions/lib/agencyGhl.ts` holds the agency's own GHL credentials
  (`AGENCY_GHL_LOCATION_ID` / `AGENCY_GHL_TOKEN`), deliberately outside the
  tenants table so agency sales never touch a client's account.
- `/api/admin/cold-call/book` upserts the prospect as an agency GHL contact,
  books the appointment, then marks the lead Booked.
- `leads.ghl_contact_id` (migration 0053) links a lead to that contact. This is
  the join: a calendar appointment carries `contactId`, so the appointment finds
  its lead, and the lead carries `assigned_to`, so the call finds the caller who
  set it.
- `/api/admin/cold-call/calendars` already lists the agency's calendars.
- Cold Call ends at the `Booked` stage, marked terminal. The demo call is the
  next thing that happens, and it is a Sales concern, not an Acquisition one.

The live agency account (`wbrjjHYzznyEHx9wumSr`) has two active calendars:

| Calendar | ID | Holds |
| --- | --- | --- |
| Hauck Marketing Demo Call | `bNngVkJWa6qNGw18whfp` | The demo calls |
| Hauck Marketing Onboarding | `NK53JD0np0dfOaRpmUWh` | Jake's flight bookings |

**The page reads one nominated calendar, never "all active calendars".** The
Setter Calendar reads all of them, and copying that here would list Jake's
flights as demo calls with a Start Call button next to them.

## Decisions

Settled with Jake before building.

| Question | Answer |
| --- | --- |
| Feed | The agency GHL sub-account's demo-call calendar |
| Call type | One: a demo call with a business owner |
| Outcomes | Closed, Follow-up booked, No show, Not a fit |
| Notes | Guided sections plus a freeform scratchpad |
| Note sections | Editable, in settings |
| Which calendar | A setting on the Cold Call settings page |
| GHL write-back | None. The app reads GHL and never writes to it |
| Sales Data | Derived from logged calls; those cells become read-only |
| Start Call | Full-screen workspace, duration timer, marked in progress |
| Deal | Component checkboxes, any combination |
| Also captured | Contract length, agreed ad spend budget |

### Why no write-back

Two reasons, and they agree. Jake's standing rule is to lock the pages before
wiring automations. And `agencyGhl.ts` already states the principle for the cold
caller: the app states what happened, GHL decides what that means. A second
system moving the same card is how a pipeline starts lying.

## Architecture

Three pieces.

**The feed.** The nominated calendar's appointments, read-only, over a date
window.

**The log.** One `sales_calls` row per appointment, holding everything that
happened on the call. Keyed by GHL appointment id, so a call cannot be logged
twice.

**The reconcile.** Loading a window upserts a row for every appointment in it:
insert what is missing, refresh time, status and contact on what is not. After
that, the table alone answers every question, including the Sales Data counts,
without a second call to GHL.

Reconcile writes on a read. That is deliberate and worth stating plainly: the
alternative is asking GHL for the month every time the Sales Data tab renders,
and a month of counts that depends on a live third-party call is a month of
counts that can disagree with itself. The upsert is idempotent.

### Data flow

```
GHL demo calendar ──┐
                    ├──► reconcile ──► sales_calls ──┬──► Sales Calls page
leads.ghl_contact_id┘   (idempotent)                 └──► Sales Data (derived)
```

### The Sales Data mapping

`sales_calls` answers every column the tracker types by hand today:

| Sales Data column | Derived from |
| --- | --- |
| On Calendar | rows scheduled that day |
| Resched / Cancel | rows whose appointment status is cancelled |
| Taken | rows with an outcome that is not `no_show` |
| Qualified | rows with `qualified = true` |
| Closed | rows with outcome `closed` |
| Cash | sum of `cash_collected` |

Show-Up %, Qual %, Close % and Close % (Qual) are already computed from those
counts in `src/lib/salesTracker.ts` and need no change.

A day with any logged call locks those six cells. The Notes cell stays typeable.

## Schema

Migration number is provisional. `0055` and `0056` already exist twice across
branches with different contents, so the number gets picked at push time, not
now.

```
0057_sales_calls.sql
  agency_settings   id='agency', demo_calendar_id, call_note_sections jsonb
  sales_calls       one row per demo call
```

`sales_calls` columns, grouped by what they answer:

- Identity: `ghl_appointment_id` (unique), `ghl_contact_id`, `lead_id`
- Denormalised prospect: name, business, phone, email, timezone. Copied at
  reconcile so history survives a deleted contact or appointment.
- Schedule: `scheduled_at`, `appointment_status`
- The call: `started_at`, `ended_at`, `duration_seconds`
- The result: `outcome`, `qualified`, `not_a_fit_reason`, `follow_up_at`
- The notes: `sections jsonb`, `scratchpad text`
- The deal: `deal jsonb`, `cash_collected numeric`
- Audit: `logged_by`, `created_at`, `updated_at`

`deal` holds only the components that were ticked:

```json
{ "upfrontFee": 1500, "monthlyRetainer": 2000, "revSharePct": null,
  "perJobFee": null, "contractMonths": 3, "adSpendBudget": 1500 }
```

Outcome is a CHECK constraint over `closed | follow_up | no_show | not_a_fit`,
matching how every other status vocabulary in this app is pinned.

## Files

### Backend

| File | Job |
| --- | --- |
| `supabase/migrations/0057_sales_calls.sql` | New. Both tables. |
| `functions/lib/salesCalls.ts` | New. Pure: outcome vocabulary, deal shape, appointment-to-row mapping, day counts. Unit-tested. |
| `functions/api/admin/sales-calls/index.ts` | New. GET a window: reconcile, then return calls joined to leads. |
| `functions/api/admin/sales-calls/log.ts` | New. PATCH one call: notes, outcome, deal. |
| `functions/api/admin/sales-calls/settings.ts` | New. GET/PATCH the demo calendar id and the note sections. Owner-only writes. |
| `functions/api/admin/tracker/sales-data.ts` | Edit. Merge derived counts over the typed row, and say which days are derived. |

### Frontend

| File | Job |
| --- | --- |
| `src/lib/salesCalls.ts` | New. The shared model: views, outcomes, deal components, default note sections. Unit-tested. |
| `src/components/admin/sales/SalesCallsSurface.tsx` | New. The four-view list. |
| `src/components/admin/sales/SalesCallCard.tsx` | New. One booked call, with Start Call or its outcome. |
| `src/components/admin/sales/SalesCallWorkspace.tsx` | New. Full-screen: brief, timer, notes, outcome. |
| `src/components/admin/sales/OutcomePanel.tsx` | New. The four buttons and what each one asks for. |
| `src/components/admin/sales/DealBuilder.tsx` | New. Component checkboxes and their amounts. |
| `src/components/admin/sales/NoteSectionsEditor.tsx` | New. Add, rename, reorder, remove. |
| `src/hooks/useSalesCalls.ts` | New. Queries and mutations. |
| `src/lib/adminPillars.ts` | Edit. Add the `calls` tab to the Sales pillar. |
| `src/routes/admin/PillarPage.tsx` | Edit. Wire the tab body. |
| `src/components/admin/acquisition/ColdCallSettings.tsx` | Edit. Add the demo-calendar picker. |
| `src/components/admin/tracker/SalesDataTracker.tsx` | Edit. Lock derived cells, explain why. |

## Build order

Each step ends green before the next starts.

1. Migration, applied and verified against the real table list.
2. `functions/lib/salesCalls.ts` plus its tests. Pure, so it is provable before
   any endpoint exists.
3. The three endpoints, tested against the live agency calendar.
4. `src/lib/salesCalls.ts` plus its tests.
5. The list surface and the tab wiring. Visible on localhost at this point.
6. The workspace, the outcome panel, the deal builder.
7. The settings: calendar picker, note sections editor.
8. Sales Data derivation and cell locking.
9. Typecheck, full test run, then Jake eyeballs it against a real booking.

## Verification

- `npm run typecheck` and `npm run test` green.
- The list rendered against the live Demo Call calendar, showing a real booking
  Jake makes, and showing nothing from the Onboarding calendar.
- One call logged end to end, with the Sales Data row moving to match.

## Known risks

- **Migration numbering.** 0055 and 0056 exist twice across branches with
  different contents. Pick the number at push time and re-check.
- **The empty calendar.** No demo calls are booked, so every view renders its
  empty state until Jake books one. He is booking a test appointment.
- **Reconcile writes on read.** Idempotent, but it means loading the page
  creates rows. A call that is deleted from the calendar keeps its row, on
  purpose: notes about a real conversation should not vanish because someone
  tidied the calendar.
- **One timezone.** Times render in the browser's clock, matching the Setter
  Calendar. `agencyTimezone()` exists if that proves wrong.
