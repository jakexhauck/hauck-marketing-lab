# Job Console — Spec + Build Plan

Status: in design · 2026-07-07 · client #1 = Willis Windows

One place for the client to work each active lead to a close: advance it through
the pipeline, record the job's dollar value, and mark the outcome. Every action
writes to GHL live. Split queue + focused console, new "Console" tab under Leads.

---

## 1. Frame (what / why / done)

**What.** A dedicated client-facing surface where, for any active lead, the client
can: (a) move it to another stage in its pipeline, (b) type the dollar amount the
job was for, and (c) mark the outcome (Won / Lost). One confirm writes stage +
amount + status to GHL in a single call.

**Why.** The actions already exist but are scattered (board drag on the Pipeline
tab, a modal buried in each lead's detail). The client has no single, obvious
"work my leads and log what happened" screen. This consolidates it.

**Definition of done.**
- New "Console" tab at `/sales/leads/console`, beside Pipeline / Organic / Paid Ads.
- Left: a queue of the client's active Paid + Organic leads. Right: a focused
  console for the selected lead (stage stepper + amount + Won/Lost).
- Confirm writes to GHL live via the existing `/api/sales/leads/:id/stage`
  endpoint; the queue reflects the change (a Won/Lost lead leaves the active queue).
- Real session shows real leads; an unconnected/empty session shows an honest
  empty state (no "connected, results show up here" filler — standing rule).
- Demo/preview is fully walkable (queue populated, writes mirrored in the in-memory
  store).
- Responsive: desktop = side-by-side; phone = queue first, tap a lead to push the
  console full-screen with a back control.
- `tsc` clean, `npm run build` clean, Playwright-verified in demo (both themes).

**Non-goals (YAGNI).**
- No Sales Pipeline spine (Intro Call → Estimate → Job Booked → Job Completed).
  Nothing flows into that pipeline yet; that wiring is parked. The console works
  the pipelines that hold real leads today (Paid + Organic). Adding the spine is a
  later, additive extension once leads are wired to flow into it.
- No new telephony, no call logging (that is the separate Call Console).
- No invoicing / payment collection (that lives on the Jobs page).
- No bulk actions, no CSV export.

---

## 2. The data (all real, all existing)

**Read — the queue.** `GET /api/sales/leads` (via `useLeadsHub`) returns every
opportunity in the **Paid Ad's Pipeline** + **Organic Pipeline**, each tagged with
a channel `source` ("ad" | "form" | "chat"), a friendly `status`, and its real
`stageName`. Newest activity first. This is the same feed the Call Console and the
Organic / Paid Ads lead lists already read.

**Read — the stage list per lead.** `usePipelines()` (PipelinesContext) exposes
every pipeline with its ordered stages. The console looks up the selected lead's
pipeline (`lead.pipelineId`) to render its stage stepper. No hardcoded ids.

**Write — one call does everything.** `POST /api/sales/leads/:id/stage` accepts
`{ stageName?, pipelineName?, monetaryValue?, status? }` and writes them to the
GHL opportunity in a single `putOpportunity`:
- `stageName` (same-pipeline) → resolves within the lead's own pipeline and moves it.
- `monetaryValue` → the job's dollar amount, written as-is.
- `status` → "won" | "lost" | "abandoned" | "open".

Front-end hook `useMoveSalesLeadStage` already wraps this and invalidates the
`["sales-leads"]` query the queue reads, so the list settles after a write.

### 2a. The one required backend change: surface the real outcome

The merged feed's `ApiSalesLead` **redefines** `status` with a stage-derived
friendly label ("new" | "working" | "booked" | "won" | "cold"), which shadows the
real GHL opportunity status ("open" | "won" | "lost" | "abandoned") that
`shapeOpportunity` sets. So the front end currently cannot tell a Won/Lost lead
apart from a working one.

**Fix (small, contained):** add a separate `outcome` field to `ApiSalesLead`
carrying the raw GHL status, and map it through to the front-end lead shape. The
existing friendly `status` is untouched (other surfaces keep working). The console
uses `outcome` to:
- show a Won/Lost badge on a worked lead, and
- drop won/lost leads out of the active queue (they are done).

This also fixes the same blind spot for anything else reading the hub feed later.

---

## 3. Layout

### Desktop (lg+): side-by-side

```
┌───────────────────────────┬───────────────────────────────────────────┐
│  QUEUE (≈360px)           │  CONSOLE (selected lead)                    │
│                           │                                             │
│  [search]                 │  Jane Doe        ⭐ Paid Ad   (248) 555-…   │
│  ● Jane Doe   Paid  $—    │  Currently: Estimate Scheduled · Paid Pipe  │
│  ● Mark R.    Form  $450  │                                             │
│  ○ Bianca M.  Chat  $—    │  STAGE ───────────────────────────────────  │
│  …                        │  ○ Lead In → ● Estimate Scheduled → ○ Apt…  │
│                           │  (tap a stage to move the lead there)       │
│  N active                 │                                             │
│                           │  JOB AMOUNT   $ [   450   ]                 │
│                           │                                             │
│  [ Won ]  [ Lost ]  [ Follow up ]   ← outcome, one confirm = one write  │
└───────────────────────────┴───────────────────────────────────────────┘
```

- **Queue (left):** active Paid + Organic leads (outcome not yet won/lost). Each
  row: status dot, name, source badge, current stage, value (if set). Search by
  name / phone. Sorted newest-first. Selected row highlighted.
- **Console (right):** the selected lead.
  - Header: name, source badge, phone (click-to-call `tel:`), current stage + pipeline.
  - **Stage stepper:** the lead's own pipeline stages in order, current one
    highlighted. Tapping a stage moves the lead there (writes `stageName`).
  - **Job amount:** a `$` number field, prefilled with the lead's current value.
  - **Outcome bar:** `Won` (green — writes `status: won` + the amount), `Lost`
    (writes `status: lost`), `Follow up` (moves to the pipeline's follow-up stage
    if one resolves; otherwise hidden). Won/Lost drops the lead from the queue.
  - Empty console (nothing selected): a short "Pick a lead to work it" prompt.

### Phone (below lg): queue first, console pushed

- Default view = the queue (full width).
- Tapping a lead pushes the console full-screen with a back arrow to the queue.
- Same stepper + amount + outcome, stacked vertically.

Aesthetic: the app's existing surface tokens (`--surface`, `--border`, brand
gradient for the active stage / Won), matching the Leads worklists. Not the dark
"call mode" of the Call Console — this is a daytime worklist, kept light and calm.

---

## 4. Files

**New**
- `command-center/app/src/routes/sales/JobConsole.tsx` — the page (queue + console,
  responsive). Demo-aware via `useLeadsHub`; writes via `useMoveSalesLeadStage`.
- (If it grows past ~250 lines, split the console panel into
  `components/sales/LeadConsolePanel.tsx` and the queue into
  `components/sales/LeadConsoleQueue.tsx`. Decide during build.)

**Edited**
- `command-center/app/functions/api/sales/leads/index.ts` — add `outcome: o.status`
  (raw GHL status) to each `ApiSalesLead` row.
- `command-center/app/src/lib/leadsHub.ts` — carry `outcome`, `value`, `stageName`
  through `mapApiSalesLead` into the front-end `HubLead`; extend the `HubLead` type.
- `command-center/app/src/lib/pageTabs.ts` — add `{ to: "/sales/leads/console",
  label: "Console" }` to `LEADS_TABS`.
- `command-center/app/src/App.tsx` — route `/sales/leads/console` → `JobConsole`.
- `command-center/app/src/demo/handlers/actions.ts` — extend the `/stage` demo
  handler so a Won write sets the demo lead's outcome + value and a stage move
  updates its `stageName`, so the console is walkable in preview.
- `command-center/app/docs/connections/` — add `job-console.md` connection notes
  (what is real, what a live account needs).

**Tests**
- `command-center/app/src/demo/actions.test.ts` — extend to cover the Won + amount
  write and a stage move reflecting in the demo feed.
- `nav.test.ts` — the new tab route exists and does not collide with a sidebar row
  (asserted by the existing harness once the tab is added).

---

## 5. Build order (Spine, with the fast path for a UI-over-real-plumbing job)

1. **Backend outcome field** — add `outcome` to the merged feed; `tsc` the functions.
2. **Type + mapper** — thread `outcome` / `value` / `stageName` through `leadsHub.ts`.
3. **Route + tab** — register `/sales/leads/console` and the LEADS_TABS entry
   (empty component first, confirm nav lands).
4. **Queue** — render the active-lead list from `useLeadsHub`, search + select.
5. **Console panel** — header, stage stepper (from `usePipelines`), amount field,
   outcome bar; wire each control to `useMoveSalesLeadStage`.
6. **Responsive** — desktop split; phone queue→console push + back.
7. **Empty / not-connected states** — honest, no placeholder chatter.
8. **Demo** — extend `actions.ts` + demo test so the flow is walkable in preview.
9. **Verify** — `tsc`, `npm run build`, Playwright in demo (select a lead, move a
   stage, enter an amount, mark Won → it leaves the queue), both themes.
10. **Ship** — commit (deleting this plan in the same commit per the standing rule),
    push, watch deploy, grep the live bundle, smoke-test the live URL.

---

## 6. Open questions / risks

- **Won display on refetch.** Handled by §2a (`outcome`). Verify a real Won lead
  actually leaves the active queue after invalidation, not just optimistically.
- **Follow-up stage name.** The "Follow up" outcome only appears if a follow-up
  stage resolves in the lead's pipeline; otherwise it's hidden (no dead button).
- **Amount on a stage move vs. on Won.** MVP: amount is written together with the
  outcome/stage on confirm. A stage move without an outcome still carries the
  amount if the field was edited. Keep it one write per action.
- **Sales spine later.** When leads are wired to flow into the Sales Pipeline,
  extend the feed to include it and the console gains the Job Booked / Job
  Completed stages for free (same stepper, same endpoint).
