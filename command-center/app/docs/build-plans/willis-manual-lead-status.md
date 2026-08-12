# Willis: the lead status becomes theirs to type

**Decided 2026-08-12 with Jake.** Willis ring their own leads. Nobody at the
agency moves their cards, so a status derived from a GHL stage is derived from
nothing anybody is maintaining. On their account the owner types it.

Per tenant, not a fork. `tenant_entitlements` already exists as the per-client
switch; this adds one more thing it decides.

Replaces the Google Sheet approach (`willis-lead-tracker-sheet.md`), which was
solving the same problem outside the app. See "The sheet" at the bottom.

## What Jake decided

| Question | Answer |
|---|---|
| Status | Typed by the owner, never derived, on Willis only |
| Dashboard numbers | **Follow the typed status.** Bookings, Sales, Close Rate all count from what the owner marked |
| Appointment day and time | **Stays automatic**, read from the real GHL calendar whatever is typed |
| New leads | **Still appear on their own**, marked New |
| Everything else on the row | Manual |

Two I decided on his behalf, both flagged for a yes or no:

- **The eight labels**, the same ones he approved for the sheet: New Lead,
  Contacted, No Answer, Follow Up, Appointment Booked, Quoted, Won, Lost. Six of
  the current twelve describe the agency's dialling cadence (Phone Follow Up,
  Phone Appt Confirmed, Handed Off, Long Term Nurture) and mean nothing to an
  owner working their own list.
- **Handoffs off for Willis.** That page and the Handed Off stage exist only
  because we book and hand over. If they ring their own leads there is nothing
  to hand.

## The rule that makes or breaks it

The appointment date keeps coming from GHL **regardless of what is typed**.

Today `leadWhen.ts` chooses the date by status: appointment statuses get the
calendar, chasing statuses get the next task. Keep that and a lead the owner
marks "Appointment Booked" by hand shows a blank date, while one with a real
appointment marked "Contacted" hides the date it has. The status stops being
worth typing about ten minutes after they notice.

So on a manual tenant: always show the appointment if GHL has one. The status
says what the owner thinks; the date says what the calendar knows.

## Data

Migration `0102_lead_status.sql`:

```
lead_status (
  tenant_id   uuid    references tenants(id) on delete cascade,
  contact_id  text,           -- GHL contact id, the key everywhere else
  status      text not null,  -- one of the eight
  set_by      text,           -- staff/owner account id, for the audit trail
  set_at      timestamptz not null default now(),
  primary key (tenant_id, contact_id)
)
```

One row per lead, overwritten in place. No history table: the question asked in
practice is "where is this lead now", never "what was it last Tuesday".

Absent row means the lead has never been touched, which reads as **New**. That
is why nothing needs backfilling: 199 existing contacts all read New on day one
without a single write.

## Surfaces to change

| # | Surface | Change |
|---|---|---|
| 1 | `functions/lib/leadStatus.ts` | An eight-label manual model beside the derived twelve. The derived one stays: every other client uses it |
| 2 | New `functions/api/leads/[id]/status.ts` | PATCH the typed status. Permission-checked, capability-gated |
| 3 | `AdsLeadTracker.tsx` | The Status cell becomes a dropdown on a manual tenant, a read-only badge everywhere else |
| 4 | `adTrackerMetrics.ts` | On a manual tenant the ladder (lead / pickup / booking / sale) reads the typed status instead of `STAGE_LEVELS` |
| 5 | `leadWhen.ts` | On a manual tenant, always take the calendar appointment. See the rule above |
| 6 | `leadTrackerData.ts` | The Trash pipeline no longer forces Lost. A typed status wins |
| 7 | `permissions.ts` + `tenant_entitlements` | The switch itself, plus who may edit a status |
| 8 | Handoffs | Hidden for Willis |

## Phases

1. Migration, the manual status model, and its tests. Nothing user-visible.
2. The PATCH endpoint plus the per-tenant switch.
3. The dropdown on the Lead Tracker. Verify on localhost against real Willis data.
4. Point the Dashboard ladder at the typed status. This is where the numbers
   move, so it ships on its own and gets checked before and after.
5. Turn Handoffs off, trim the Setter Suite's reach into their leads.

## The sheet

`/api/sheets/leads` shipped and is live (commit `61dc71d`). No sheet calls it:
the spreadsheet was never wired up. It costs nothing where it sits and is the
obvious fallback if the owner will not work in the app, so it stays until Jake
says otherwise. If this lands well, delete the endpoint, the Apps Script, the
`SHEETS_SYNC_TOKEN` and its registry entry in one commit.
