# Connections — Job Console · `/sales/leads/console`

One screen where the client works an active lead to a close: move it through its
pipeline, log the job amount, and mark the outcome (Won / Lost / Follow up). Split
queue (left) + focused console (right). Unlike most surfaces, this one is **live,
not gated** — it reads and writes real GHL through endpoints that already exist. A
real, unconnected session simply shows an honest empty state.

Status key: ❌ not wired · ⚠️ partial · ✅ live

## What is live
- ✅ **Queue** → `GET /api/sales/leads` (`useLeadsHub`). Every open opportunity in
  the **Paid Ad's** + **Organic** pipelines, resolved BY NAME per tenant. Closed
  opportunities (GHL status won/lost/abandoned) drop out of the active queue.
- ✅ **Move stage** → `POST /api/sales/leads/:id/stage` `{ stageName }`. Resolves
  the stage BY NAME within the lead's own pipeline and PUTs the opportunity.
  (`useMoveSalesLeadStage`.)
- ✅ **Won + amount** → same endpoint `{ status: "won", monetaryValue }`. Writes the
  job value and the won status in one call.
- ✅ **Lost** → same endpoint `{ status: "lost" }`.
- ✅ **Follow up** (only shown if the lead's pipeline has a follow-up stage) → same
  endpoint `{ stageName: "<Follow up stage>" }`.
- ✅ **Call** → `tel:` link on the lead's phone (native dialer).

## The one change this page required
- ✅ **Raw outcome on the feed.** `GET /api/sales/leads` now returns `outcome` (the
  real GHL opportunity status) alongside the stage-derived friendly `status`, which
  previously shadowed it. The console needs the raw status to keep closed leads out
  of the queue. Threaded through `ApiSalesLead` → `HubLead`
  (`src/lib/leadsHub.ts`). No other surface reads `outcome`, so nothing else changed.

## Data source(s)
- ✅ **Paid Ad's + Organic pipeline opportunities** — the workable leads.
- ✅ **Pipelines + stages** (`usePipelines`) — the stage rail per lead, BY id/name.
- ⛔ **Sales Pipeline spine** (Intro Call → Estimate → Job Booked → Job Completed) —
  deliberately NOT included. Nothing flows leads into that pipeline yet (wiring is
  parked). When it does, extend `functions/api/sales/leads/index.ts` to include it
  and the console gains those stages for free (same rail, same write).

## Reflection model
- The console holds an optimistic override per lead after each successful write, so
  the change shows instantly (the demo feed is a stable in-memory reference with no
  refetch; a real session also invalidates `["sales-leads"]` and converges).

## Auth / identity
- ⚠️ Per-tenant GHL location token injected server-side (same pattern as the rest of
  the app). Not specific to this page.

## Secrets / env vars
- None new. Reuses the tenant GHL token.

## Demo
- `src/demo/handlers/actions.ts` mirrors the `/stage` write on the demo leads
  (amount, stage move, won/lost outcome) so the console is fully walkable in
  preview. Covered by `src/demo/actions.test.ts`.

## Persistence
- None beyond GHL (the opportunity is the source of truth).
