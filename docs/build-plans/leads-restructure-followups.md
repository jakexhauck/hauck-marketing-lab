# Leads Restructure: Remaining Work

> Follow-up to the shipped Leads Sales/Trash restructure (live on `main` `1e625e9`, 2026-07-07). The core feature is live: 4 tabs (Sales/Trash/Organic/Paid Ads) on one shared header, boards by-name, side-by-side Organic, chat-first `/lead/:id`. This doc captures only what is LEFT.

Status legend: 🟢 mine, do anytime · 🟡 needs a Jake decision first · 🔵 Jake action.

---

## A. Trash has no in-app entry or exit (biggest gap) — 🟡 decision, then 🟢 build

**What's true today:** The Trash tab renders the Trash pipeline as a board, but nothing in the app moves a lead INTO Trash or back OUT. `MoveStageSheet` only lists the lead's own pipeline's stages, and the move mutation (`useMoveLeadStage`) carries no target pipeline. So a lead reaches Trash only if GHL or an automation puts it there, and it can never be restored from the app.

**Decision needed from Jake:** how should Trash be worked?
- **Option 1 (recommended):** add two cross-pipeline actions. On a Sales lead: "Not a fit / Trash it" moves the opportunity into the Trash pipeline (first stage). On a Trash lead: "Restore to Sales" moves it back. Both from the lead page action rail and/or the card.
- **Option 2:** Trash stays read-only (a record of dead leads); movement happens only in GHL. No app build.
- Also decide: which Trash stage a trashed lead lands in (No Anwser / Opted Out / etc.), and whether "Restore" returns to a fixed Sales stage (e.g. Lead In).

**If Option 1, the build (once decided):**
- Extend the move endpoint (`functions/api/leads/[id].ts` PATCH) to accept an optional `toPipelineId` + `toStageId` and issue a cross-pipeline move to GHL (opportunity update with new `pipelineId` + `pipelineStageId`). Unit-test the resolver.
- Add a `useMoveLeadToPipeline` hook (or extend `useMoveLeadStage`) that resolves the target pipeline by name (reuse `resolveLeadPipeline` from `src/lib/leadPipelines.ts`).
- Add the actions: a "Trash" cell on Sales lead pages / cards and a "Restore to Sales" cell on Trash lead pages / cards. Confirm-toast on success; optimistic move + revert on error (mirror `Board.tsx`).
- Live-verify: trash a real Sales lead, confirm it leaves Sales and appears in Trash in GHL and the app; restore it.

---

## B. Source classifier unverified against real ad leads — 🟢 mine (when data exists) / 🔵 Jake

The `ad`/`form`/`chat` split (`functions/api/sales/leads/source.ts` `classifySource`) has only ever seen `"Chat Widget"` source strings, the account had no ad or form leads at ship time. The paid-signal list (`facebook`, `instagram`, `meta`, `paid`, `" ad"`) is a best guess, flagged in the code.

**When a real Meta ad lead flows:** confirm it lands in the **Paid Ads** tab (classified `ad`), and confirm a real form submission lands in **Organic > Estimate Forms** (classified `form`). Note the exact `source` strings GHL stamps for ad vs form leads, then tighten `PAID` / the form default if the guess is wrong. Watch the `" ad"` token, it would also tag a hypothetical "Radio ad" / "Newspaper ad" source.

---

## C. Live click-through verification not done — 🟢 mine (browser was busy) / 🔵 Jake

Shipped verified by the deployed bundle + full test suite (315/315), but no human/automated click-through of the running UI. Do a 30-second pass on `app.hauckmarketing.com`:
- Leads: click across all four tabs, confirm the header does NOT jump/reflow between any two.
- Organic: confirm the two columns (Estimate Forms | Website Chat) render, and the 3 live Chat Widget leads sit in the Chat column.
- Open a lead: confirm the chat-first page, and that Call / Text / Email / Mark Won / Move each fire (Text/Email switch the composer channel).
- Trash: confirm it shows the Trash pipeline's stages.

If I do it: needs the Playwright/Chrome browser free (it was held by the parallel session at ship time). Capture screenshots as evidence.

---

## D. Jake's uncommitted "Console" WIP — 🔵 Jake / 🟡 decision

Jake's `feat/leads-sales-trash` branch (in the main checkout) still holds ~10 uncommitted files for a **Console tab** (`JobConsole.tsx`, edits to `pageTabs.ts` / `App.tsx` / `index.ts` / `leadsHub.ts` / demo handlers, `job-console.md`). Jake said "scratch the console, we don't need it right now." I left it untouched (did not delete his work).

**To do:**
- Decide: discard the Console WIP, or stash it for later. Discard = `git checkout -- <the reverted files>` + `rm` the two new files. Stash (recoverable) = `git stash push -u -m console-wip <files>`.
- If Console is wanted later, it must be rebuilt on the NEW 4-tab structure (it was written against the old 3-tab `pageTabs.ts` / routes), not merged as-is.

---

## E. Branch + worktree cleanup — 🟢 mine / 🔵 Jake

The leads work reached `main` via a cherry-pick (branches had diverged), so:
- `feat/leads-build` and its worktree `.worktrees/leads-build` are now redundant (fully shipped). Remove when convenient: `git worktree remove .worktrees/leads-build && git branch -D feat/leads-build`.
- `feat/leads-sales-trash` still carries the OLD 3-tab leads structure in its committed history. When Jake next reconciles that branch with `main`, expect conflicts on `pageTabs.ts` / `App.tsx` / `functions/api/sales/leads/index.ts`, take `main`'s side for the leads files (the new structure is canonical now).

---

## Out of scope (not this feature)
- Automations / GHL wiring for the new stages ("pages before automations" standing rule).
- The broader "no connected-placeholder chatter" sweep across other sections.
