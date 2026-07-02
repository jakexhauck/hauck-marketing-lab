# Reactivation — connections

The client-facing Reactivation surface (`/marketing/campaigns/reactivation`)
over the GHL **Database Reactivation** pipeline. Wins back dormant past
customers with a text + email sequence.

## Data sources

- ✅ **GHL Database Reactivation pipeline** — resolved BY NAME
  (`database reactivation`, then `reactivation` contains, then id
  `A7PNIqk4Fg1HINtirAmR` as last resort). Read via `fetchAllOpportunities`.
  Opportunities are bucketed by stage into the four surface buckets:
  - **booked** = Estimate Scheduled + Apt Completed/Quote Given
  - **notFit** = Not Qualified
  - **replied** = Lead Responded + Followup - Not ready
  - **noAnswer** = everything else (Lead Contacted, No answer, No Show)
  - **reached** = total opportunities in the pipeline
  - **recent** = the most recently updated booked opps (won-backs), newest first.

## Backend endpoints

- ✅ `GET /api/campaigns/reactivation` — `functions/api/campaigns/reactivation.ts`.
  Returns `{ reached, replied, booked, noAnswer, notFit, recent, configError? }`.
  Degrades to an all-zero payload with `configError: "pipeline_not_found"` when
  the pipeline is absent, so the surface shows its honest not-connected state.

## Frontend

- ✅ `src/lib/reactivation.ts` — `ReactivationData` shape + `DEMO_REACTIVATION`.
- ✅ `src/hooks/useReactivation.ts` — `useReactivation(enabled)`.
- ✅ `src/demo/handler.ts` — demo case returns `DEMO_REACTIVATION`.
- ✅ `src/routes/sales/Reactivation.tsx` — data-driven; populated when
  `reached > 0`, else `NotConnectedNotice` + empty states.

## Known gap / honest mapping

- ⚠️ **"Dormant database size" is not available from the pipeline.** The pipeline
  only holds people the campaign has already contacted; the pre-campaign dormant
  list (a smart list / tag count) is a separate GHL resource. So the surface was
  reframed to what is real ("Reached out to" / "customers reached so far") rather
  than inventing a dormant total. If a real dormant-list count is wanted later,
  add a contacts smart-list / tag count endpoint and a `dormant` field.
- ❌ **Per-stage timestamps for `recent.sub`** currently show the stage name, not
  a booked-on date. GHL's `lastStatusChangeAt` is used for ordering; surfacing a
  formatted date would need the appointment/opportunity date join (as Jobs does).

## Not wired (out of scope here)

- ❌ Sending the reactivation sequence (SMS/email) — that's the Campaigns send
  path (SMS wireable, email waits on a verified domain). This surface is read-only.
