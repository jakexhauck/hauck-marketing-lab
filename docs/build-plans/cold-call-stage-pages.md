# Cold Call stage pages (Acquisition)

Spec + implementation plan in one doc. Localhost only: nothing in here deploys or
touches the production database until Jake says ship.

## Why

`Acquisition > Leads` was built with an invented status vocabulary (New,
Contacted, No Answer, Booked, Qualified, Closed, Dead). The agency GHL
sub-account (`wbrjjHYzznyEHx9wumSr`) now has a real **Cold Call Leads** pipeline,
and the two do not match. Every page should correlate to a pipeline stage, one
page per stage, in one repeated format.

## Source of truth (pulled live 2026-07-26)

Pipeline **Cold Call Leads**, 7 stages, with the tag that already exists in the
account for each:

| # | Stage | Tag | Means |
|---|---|---|---|
| 1 | New Lead | (none yet) | Sourced, never dialed |
| 2 | 1st Dial (Day 1) | `cc no answer day 1` | Dialed once, no answer |
| 3 | 2nd Dial (Day 2) | `cc no answer day 2` | Dialed twice, no answer |
| 4 | Brushed Off | `cc brush off` | Picked up, would not engage |
| 5 | Call Back | `cc call back` | Asked to be called later |
| 6 | Booked | `cc demo call booked` | Demo call on the calendar |
| 7 | Not Interested | `cc not interested` | Hard no |

Reality check at time of writing: the pipeline holds **0 opportunities** and the
account holds **14 contacts**, two of them carrying `cc` tags. So the pages have
no real data to render yet.

## Scope

In: the 7 Cold Call Leads stages, under `Acquisition > Cold Calling`.

Out: SMS Pipeline, Sales Pipeline, Main, Main FB Ads Pipeline. Same format gets
cloned to those later with no redesign. No click-to-dial: GHL exposes no
call-initiation API (proven ceiling, do not re-litigate).

## Design

### Navigation

`Acquisition` keeps its three tabs: `Leads`, `Cold Calling`, `SMS`.

Inside **Cold Calling**, the colored tile strip becomes the stage navigation.
Each tile is a real page with its own URL and its own live count. A final
`Tracker` chip keeps the existing hand-typed daily dialing sheet, so nothing is
lost.

```
[ Leads ] [ Cold Calling ] [ SMS ]

 New Lead  1st Dial  2nd Dial  Brushed Off  Call Back  Booked  Not Int.  Tracker
```

URL: `/admin/pillar/acquisition?tab=cold-call&stage=new-lead`. Linkable, and it
survives a reload.

### The one format every stage page repeats

Identical on all seven. Only the stage name, its one-line meaning and its filter
change:

1. Stage strip on top, active tile marked
2. Header: stage name, what the stage means, count
3. The same editable table as the Leads book: First, Last, Phone, Timezone,
   Stage, First Contact, Source, Appointment Date, No Answer, Last Contact,
   Follow Up Date, Email, Notes
4. Sortable headers, click-to-edit cells, add-row footer
5. Empty state: "No leads in this stage." Never filler copy.

### Demo data

The lead book is empty, so every page would render blank. Until real leads
arrive, the pages render a seeded demo set behind a visible **Demo data** badge,
and editing is disabled in that mode. The moment the book returns a real lead the
demo set disappears on its own. Nothing fabricated is ever presented as real.

### Data + writes

Reads `/api/admin/tracker/leads` exactly as the Leads book does today. The stage
lives in the existing `status` column; only the vocabulary changes.

The tag column above is recorded for the later automation pass (app writes tags,
GHL automations move the stage: the Setter Suite precedent). This build does not
write to GHL.

## Implementation

Order matters: pure modules first, then components, then the migration that is
written but not run.

1. **`app/src/lib/coldCallStages.ts`** (new). The 7 stages as one exported list:
   `id`, `label`, `meaning`, `tag`, colour token. Pure, no React. Everything else
   reads from here so a stage rename is a one-line change.
2. **`app/src/lib/coldCallStages.test.ts`** (new). Guards the list against drift
   from the live pipeline names and asserts every stage has a unique id + tag.
3. **`app/src/lib/api.ts`**. `AdminLeadStatus` becomes the stage union.
4. **`app/src/lib/adminLeads.ts`**. `LEAD_STATUSES` and `STATUS_META` rebuilt off
   `coldCallStages.ts`. `countByStatus`, `filterByStatus`, `sortLeads` unchanged.
5. **`app/src/lib/adminLeads.test.ts`**. Update the vocabulary assertions.
6. **`app/src/demo/coldCallDemoLeads.ts`** (new). ~14 demo leads spread across
   all seven stages so every page has something to show.
7. **`app/src/components/admin/leads/LeadStatusTiles.tsx`**. Tiles take an
   `active` stage id and call back with a stage id instead of a filter string.
8. **`app/src/components/admin/acquisition/ColdCallSurface.tsx`**. Becomes the
   stage workspace: reads `?stage=`, renders the strip, the stage header and the
   table, and keeps the existing `DailyTracker` month sheet under the `Tracker`
   chip.
9. **`app/src/routes/admin/PillarPage.tsx`**. Pass the `stage` search param and
   its setter into the Cold Calling body.
10. **`app/supabase/migrations/00XX_lead_stage_vocabulary.sql`** (written, NOT
    run). Replaces the `status` CHECK constraint with the seven stage names and
    maps any existing row. Number picked at push time, not now: migration
    numbering is a race.
11. **`app/functions/api/admin/tracker/leads.ts`**. Server-side status list
    updated to match. Not deployed in this pass.

## Verification

- `npm run typecheck` clean
- `npm run test` clean, including the two new pure-module suites
- On localhost, all seven stage pages render, the strip switches pages, the URL
  updates, a reload lands on the same stage, and the Tracker chip still shows the
  month sheet
- Jake eyeballs it at `http://localhost:5173/admin/pillar/acquisition?tab=cold-call`

## Open, deliberately deferred

- What puts a lead into **New Lead** in GHL: today no tag marks it. Needs an
  automation decision before the tag write-back pass.
- No cron or webhook syncs GHL contacts into the lead book. Until that exists,
  the book is typed by hand.
- `AGENCY_GHL_TOKEN` / `AGENCY_GHL_LOCATION_ID` exist in Doppler but are not in
  `.dev.vars` or Cloudflare. Needed only when the pages start reading GHL
  directly.
