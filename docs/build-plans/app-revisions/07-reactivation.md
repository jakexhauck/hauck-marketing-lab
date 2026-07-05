# Reactivation Inner Pages - Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` for shared ground rules.
>
> **SCAFFOLD ALREADY DONE - do not touch shared files.** Plan 06 was absorbed into the scaffold, so the Reactivation section already exists on your branch (`rev/reactivation`): `REACTIVATION_TABS` (Overview / Pipeline / Full Data / Messages), the nav row, the routes, the existing real Reactivation component mounted as Overview, and placeholder components for Pipeline / Full Data / Messages. Do not edit `src/lib/nav.ts`, `pageTabs.ts`, `App.tsx`, or `nav.test.ts`. Replace the body of the reactivation placeholder components with the real UI; only edit files inside the Reactivation section.

**Goal:** Fill out the Reactivation section: keep the current real page as the Overview, add a read-only Pipeline view, repurpose the detailed data into a Full Data page, and add a Messages page to view the SMS and email being sent to customers.

**Scope:** Pages-first. UI plus real data where the source exists (Reactivation is already real). The Pipeline view is **read-only**. The Messages view is read-only reporting. No automations.

## Current state (audited)
- Reactivation component: `src/routes/sales/Reactivation.tsx`, real via `useReactivation` → `GET /api/campaigns/reactivation` (`functions/api/campaigns/reactivation.ts`, resolves the reactivation pipeline by name, buckets stages).
- After plan 06: mounted at `/marketing/reactivation` (Overview) with `REACTIVATION_TABS` = Overview / Pipeline / Full Data / Messages, and placeholder shells at `/pipeline`, `/data`, `/messages`.
- Reference for read-only pipeline UI: the Reviews funnel (`src/routes/reviews/ReviewsPipeline.tsx` if plan 02 ran) and the Leads board (`src/components/Board.tsx`) for layout only.

---

### Task 1: Reactivation Overview stays as the summary
**Files:** `src/routes/sales/Reactivation.tsx`.
- [ ] Confirm the existing real Reactivation view renders as the Overview tab and trim it to a summary if it currently duplicates what will now live on Full Data (avoid showing the same dense table twice). Keep it real; honest empty when no data.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(reactivation): overview as summary`.

### Task 2: Read-only Pipeline view (doc #2)
**Files:** create `src/routes/reactivation/ReactivationPipeline.tsx`; reuse `useReactivation`.
- [ ] Render the reactivation stages as a read-only pipeline/funnel (stage names + counts from `useReactivation`). No drag, no move controls (read-only until the backend is configured).
- [ ] Honest empty / "not started" state when there is no reactivation campaign data for the sub-account. Never name the pipeline or any internal tool.
- [ ] Replace the placeholder route from plan 06 with this component.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(reactivation): read-only pipeline view`.

### Task 3: Full Data page (doc #3)
**Files:** create `src/routes/reactivation/ReactivationData.tsx`; reuse `useReactivation` (extend the endpoint read-only if more detail is available).
- [ ] Move the detailed reactivation metrics/table here (customers contacted, re-booked, stage breakdown, and any rates the endpoint provides). Real data, honest empties.
- [ ] Replace the placeholder route from plan 06.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(reactivation): full data page`.

### Task 4: Messages page (doc #4) - read-only
View the SMS and email being sent to customers in the reactivation flow.
**Files:** create `src/routes/reactivation/ReactivationMessages.tsx`; a read-only hook/endpoint that pulls the reactivation messages from GoHighLevel (reuse the conversation/message APIs, scoped to reactivation-origin contacts, `origin === 'react'` per `src/lib/inboxFilters.ts`).
- [ ] List the SMS and email sent to reactivation customers (read-only). Customer language, never name GHL.
- [ ] If the message data is not readily queryable yet, ship an honest empty + a clear TODO rather than fabricating. Keep `?demo=1` populated.
- [ ] Replace the placeholder route from plan 06.
- [ ] `npm run typecheck` + walk `?demo=1`; note for Jake to confirm real messages in a Willis session.
- [ ] Commit: `feat(reactivation): read-only SMS + email messages view`.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Walk all four Reactivation tabs at `?demo=1`.
- Report which data needs a real Willis session.
