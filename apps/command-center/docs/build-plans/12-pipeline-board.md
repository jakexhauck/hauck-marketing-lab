# 12: Pipeline Board (visual kanban + multi-pipeline)

## Objective

Add a visual pipeline board: stages as columns, leads as cards, drag a card to move a lead to a
new stage. Also support a location's multiple pipelines, not just the first one. The write-back
to GHL already exists; this is the board UI plus multi-pipeline plumbing on top of it.

## Why it matters

The data and the write path are already done, so this is high perceived value for relatively
contained effort. A board is how a client intuitively thinks about their funnel, and "drag from
Booked to Won" is a more satisfying action than the current detail-screen status change. Multi
pipeline support matters because several clients run more than one funnel and the app currently
shows only `pipelines[0]`.

## Dependencies

- None hard. The stage-move write path already exists (see Current state).
- Better with 02 (pagination) landed, so the board shows all leads in a stage, not the first 100.

## Current state (already built)

Stage / status / value write-back to GHL is live. `functions/api/leads/[id].ts` PATCH:

```ts
// functions/api/leads/[id].ts (current, write-back works)
if (body.pipelineStageId !== undefined) ghlBody.pipelineStageId = body.pipelineStageId;
if (body.status !== undefined) ghlBody.status = body.status;
if (body.value !== undefined) ghlBody.monetaryValue = body.value ?? 0;
// PUT /opportunities/{id}
```

The client already has `WonSheet`, `StagePill`, `StageFilter`, and `PipelineSwitcher` components,
and `functions/api/pipeline.ts` returns ordered stages. The limitation: `pipeline.ts` uses
`data.pipelines?.[0]` only, so only the first pipeline is ever shown, and there is no board view,
only filtered lists.

## Target state

- `functions/api/pipelines.ts` (note: the plural route exists; confirm what it returns) extended
  or added to return **all** pipelines with their ordered stages, so the client can switch.
- A `Board.tsx` view (or a board mode toggle on `Leads.tsx`): one column per stage, lead cards
  grouped by `pipelineStageId`, horizontal scroll on mobile.
- Drag a card between columns to fire the existing PATCH with the new `pipelineStageId`.
- The existing `PipelineSwitcher` wired to pick among all pipelines.

GHL endpoints (already in use):

- `GET /opportunities/pipelines?locationId={id}`     all pipelines + stages
- `PUT /opportunities/{id}`                           move stage / set status / value

## Step-by-step

### 1. Return all pipelines

Audit `functions/api/pipeline.ts` and `functions/api/pipelines.ts` (both exist). Make one return
the full array: `{ pipelines: [{ pipelineId, name, stages: [{ id, name }] }] }`, keeping the
5-minute cache. Leave the singular `/pipeline` for any existing caller, or migrate callers to the
plural and remove the singular. Do not silently change the shape a caller depends on; check
`useApi.ts` and `PipelineSwitcher` first.

### 2. Group leads by stage on the client

The leads query already returns `pipelineStageId` per lead. Build a `Map<stageId, lead[]>` in the
board view. No new fetch is needed beyond selecting the active pipeline and asking the existing
leads endpoint for that `pipelineId`.

### 3. Board view

`src/routes/Board.tsx` (or a `viewMode` on `Leads.tsx` using the existing `ViewTabs`): columns
per ordered stage with a count and summed value header, lead cards reusing `LeadRow` content in a
compact card form. Horizontal snap-scroll between columns on mobile.

### 4. Drag to move

Use a lightweight pointer-based drag (or a small dnd library already acceptable to the project).
On drop, optimistically move the card, fire `PATCH /api/leads/{id}` with the new
`pipelineStageId`, and roll back the card on error with a `Toast`. Moving into a Won/Lost stage
should reuse the existing `WonSheet` flow so value capture stays consistent.

### 5. Pipeline switcher

Wire `PipelineSwitcher` to the full pipeline list. Persist the last-selected pipeline (local
storage) so the client returns to the funnel they actually use.

## Testing

1. `/api/pipelines` returns every pipeline in the test location, each with ordered stages.
2. Switching pipelines re-groups the board and refetches that pipeline's leads.
3. Dragging a card to a new stage updates GHL (verify in GHL's UI) and persists on refresh.
4. A failed move rolls the card back and shows an error.
5. Moving into Won opens the existing value-capture sheet and writes value + the Won note.

## Acceptance criteria

- [ ] All of the location's pipelines are selectable, not just the first.
- [ ] Board shows stages as columns with per-stage count and value totals.
- [ ] Drag-to-move writes the new stage to GHL and survives refresh.
- [ ] Failed moves roll back visibly.
- [ ] Won/Lost moves reuse the existing `WonSheet` flow (no duplicate value-capture logic).
- [ ] Existing list view and its filters still work; the board is additive.

## Rollback

The board view and multi-pipeline switch are additive. Revert `Board.tsx`/the view toggle and the
`pipelines.ts` shape change. The PATCH write path is unchanged and pre-existing, so there is no
write behaviour to roll back.
