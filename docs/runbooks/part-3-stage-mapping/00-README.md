# Part 3: Stage Mapping Retirement

Status: code ☑ done 2026-06-10 | manual actions ☐ not started

Theme: the app currently guesses what a pipeline stage "means" by matching English keywords in stage names (`src/lib/stageMap.ts`). Verified against the real test account on 2026-06-10: of the 27 real stage names across 5 pipelines, **19 map to "new"** (including "Closed", "Not Qualified", "Abandoned") and one maps actively wrong: "Lead In No Appointment Booked" contains "book", so it reads as **booked**, and tapping the Booked outcome can move a lead INTO that stage. This part removes keyword guessing everywhere in favor of the raw pipeline stages GHL itself reports.

## What gets fixed

| # | Finding | Where |
|---|---|---|
| 3.1 | `mapGhlStage` / `reverseMapStage` keyword heuristics drive the legacy Leads/Today/Dashboard views | `src/lib/stageMap.ts`, `src/context/LeadsContext.tsx`, `src/hooks/useApi.ts` |
| 3.2 | `/api/pipeline` returns only `pipelines[0]` (Database Reactivation in the test account) and every lead is mapped against that single pipeline's stages | `functions/api/pipeline.ts`, LeadsContext |
| 3.3 | LeadDetail outcome buttons reverse-map against the wrong pipeline; "won" needle matches any stage containing "paid" | `src/routes/LeadDetail.tsx`, `src/hooks/useApi.ts` |
| 3.4 | Board stage moves do not invalidate the global `['leads']` query, so other views show stale stages | `src/hooks/useApi.ts` |
| 3.5 | Won/Lost should be driven by opportunity **status** (a first-class GHL field), never by stage-name guessing | both directions |
| 3.6 | `shortName()` assumes pipeline names end in "Pipeline"; StageFilter list comes from mock client data | `src/components/PipelineSwitcher.tsx`, `src/components/StageFilter.tsx` |

## Design direction (agreed at audit time)

- The Board model is already correct: real pipelines, real stage ids, tap-to-move by id. It becomes the only model.
- Leads/Today/Dashboard render the lead's **actual** GHL stage name (from the lead's own pipeline), not an 8-bucket app vocabulary.
- Outcome buttons map to: Won = status `won`, Lost = status `lost`, and stage moves are picked from the lead's own pipeline's stage list (a small picker), not keyword-guessed.
- `stageMap.ts` is deleted when the last consumer is gone.

## Files in this folder

- [01-implementation-spec.md](01-implementation-spec.md)
- [02-manual-actions.md](02-manual-actions.md)

## Done means

- No keyword matching against stage names remains in the codebase.
- A lead in each of the 5 test pipelines displays its true stage name, and stage moves land on the exact chosen stage in GHL.
