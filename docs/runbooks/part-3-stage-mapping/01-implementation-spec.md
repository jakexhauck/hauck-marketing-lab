# Part 3 Implementation Spec (Claude executes this)

No manual actions in this file. Numbers map to [00-README.md](00-README.md).

## 3.1 + 3.2 Leads carry their real stage

Backend:
- `functions/api/leads/index.ts` and `leads/[id].ts` responses include `pipelineId` and `pipelineStageId` (verify they already do via `lib/ghl.ts` mapping; add if missing).
- `/api/pipeline` (singular, `pipelines[0]`) is removed once nothing consumes it; until then it is marked deprecated in a comment. All consumers move to `/api/pipelines` (plural, all pipelines with ordered stages).

Frontend:
- `LeadsContext.adaptApiLead` stops calling `mapGhlStage`. A lead's display stage is resolved by looking up `(pipelineId, pipelineStageId)` in the PipelinesContext data: `stageName`, `stagePosition`, `pipelineName` become derived fields.
- The `LeadStage` 8-bucket union type is removed from `src/types/index.ts`; views that grouped by app-stage group by real stage (within the selected pipeline) or by status (open/won/lost) across pipelines.
- StageFilter options come from the selected pipeline's real stages (PipelinesContext), not from mock client data.

## 3.3 + 3.5 Outcome actions

- LeadDetail outcome row becomes: **Won** (sets status won), **Lost** (sets status lost), **Move stage** (opens a sheet listing the lead's own pipeline's stages by position; tap sends `pipelineStageId`).
- `useMarkLeadStage`/`reverseMapStage` paths are deleted. The PATCH body sends only explicit ids/status; no name matching.
- WonSheet (value entry) stays, wired to the won action.

## 3.4 Cache invalidation

- `useMoveLeadStage` invalidates the `['leads']` prefix (covers global list + per-pipeline) in addition to `['summary']`.

## 3.6 Cosmetics tied to real data

- `shortName()` falls back gracefully for pipeline names that do not end in "Pipeline" (use first two words, max ~16 chars).
- Remove remaining stage-name consumers of mock `client.pipeline`; `stageColors.ts` keys by stage position/index instead of name keywords.

## Deletion

- `src/lib/stageMap.ts` deleted; `pnpm typecheck` confirms no dangling imports.

## Watch-outs

- Today/Dashboard "no-show"/"consultation" queue logic currently keys on app-stages. Re-key on: appointment-related data (Part 5 may improve this) or on status + stage position. Choose the least surprising behavior and note it in the report.
- Leads in pipelines the pipelines endpoint does not return (deleted pipeline edge case) must render "Unknown stage" rather than crash.

## Exit criteria

- `pnpm typecheck`, `pnpm build` pass; `stageMap.ts` gone; report delivered before Jake runs [02-manual-actions.md](02-manual-actions.md).
