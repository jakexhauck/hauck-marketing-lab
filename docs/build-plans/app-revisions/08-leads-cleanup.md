# Leads Cleanup - Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` for shared ground rules. Self-contained otherwise.

> **SCAFFOLD ALREADY DONE - do not touch shared files.** Nav/routes/tabs are locked on your branch (`rev/leads`). This plan is component-only anyway (intro-call removal). Do not edit `src/lib/nav.ts`, `pageTabs.ts`, `App.tsx`, or `nav.test.ts`.

**Goal:** Remove all intro-call references from the client-facing Leads UI. That is the only Leads change in this phase.

**Scope:** UI cleanup only. **The full Leads pipeline restructure (Organic / Paid Ads / Sales + Trash page, read-only pipelines, stage remap) is DEFERRED** to the automation phase per Jake ("we can redo those pipelines when we configure the internal automations"). Do NOT restructure pipelines here.

## Why intro-call removal now
Standing rule: intro calls were pulled from scope; intro-call references must be removed from the client UI. This is safe, pure-UI, and independent of the deferred pipeline work.

## Current state (audited)
- New Leads hub: `src/routes/sales/LeadsHub.tsx` at `/sales/leads`. Intro-call references:
  - `confirmBooking` books an "Intro Call" calendar + "Intro Call Waiting Confirmation" stage for paid-ad leads (`LeadsHub.tsx:171-179`, `:430`).
  - `bookLead.kind === "intro"` → "Book intro call - {name}" title + "Pick a time for the intro call..." subtitle (`:422-432`).
  - `NextStepModal` copy: "Cold lead from a paid ad. Get them on an intro call." (`:913-915`).
- Pipeline board: `src/routes/Leads.tsx` + `src/components/leads/LeadsDesktop.tsx` (real, unchanged here).

---

### Task 1: Remove intro-call booking path and copy from the Leads hub
**Files:** `src/routes/sales/LeadsHub.tsx`.
- [ ] Remove the "Book intro call" action/branch (`bookLead.kind === "intro"`, `:422-432`) and the intro-call booking in `confirmBooking` (`:171-179`, `:430`). If paid-ad leads previously routed only to an intro call, route the "Next step" to the remaining non-intro action (e.g. reply / book a visit) so the flow still works.
- [ ] Remove the intro-call copy in `NextStepModal` (`:913-915`) and replace with source-appropriate wording that does not mention an intro call.
- [ ] Search `LeadsHub.tsx` (and the wider `src/routes/sales` + `src/components/leads` trees) for any remaining "intro" / "intro call" strings and remove them.
- [ ] `npm run typecheck` + walk `?demo=1`: the Leads hub has no intro-call language or action anywhere.
- [ ] Commit: `feat(leads): remove all intro-call references from client UI`.

## Verify
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Grep the Leads trees to confirm zero "intro" references remain in client-facing copy.

## Deferred (documented, do NOT build here)
- Convert Leads to three pipelines (Organic / Paid Ads / Sales) with the exact stages Jake listed, read-only, plus a Trash page for dead-lead stages. This waits for the internal-automation phase, because the pipelines and their stage transitions are driven by the automations being configured then. When that phase starts, the target stages are:
  - **Sales:** Estimate scheduled, Estimate completed, Job booked, Job completed, Follow up.
  - **Organic:** chat-widget + estimate-form submissions; show when a lead responds to the auto follow-up; chat-widget rows flag "needs your response".
  - **Paid Ads:** lead-form submit, then responds to the auto follow-up.
  - **Trash:** every stage not listed above, one page across all three pipelines.
