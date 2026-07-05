# App Revisions - Plan Index & Ground Rules

These plans turn Jake's page-revision doc into per-page execution plans. **Each file
is self-contained**: hand one to a fresh Claude instance and it can execute without
this conversation. Read this README once for shared context, then work only your
assigned plan file.

Source analysis: `docs/build-plans/app-revision-tasks.md`.

## Phase scope: PAGES ONLY
This is the pages-first phase. **Build UI and display real data where the source
already exists. Do NOT build or change automations / GHL write-back / triggers.**
Where a task needs a write path or an automation, build the read-only UI and leave a
clearly-marked TODO. Pipelines are **read-only** until the backend is configured.

## SCAFFOLD IS ALREADY DONE - the shared files are locked
A scaffold commit (on `main`, branch base for every worktree) already made ALL the
nav / route / tab plumbing for every plan, plus placeholder components for the new
pages. This is what makes the plans collision-free.

**Do NOT edit these shared files in any plan (they are final):**
`src/lib/nav.ts`, `src/lib/pageTabs.ts`, `src/App.tsx`, `src/lib/nav.test.ts`.

Every new page already has a route and a placeholder component. Your job in each plan
is to **replace the body of your section's components** with the real UI, touching only
your own section's files. If your plan text says "add a tab / add a route / update
nav.test", that step is already done by the scaffold: skip it.

## Run order - all parallel now
Plan `06` (the Campaigns split) was fully absorbed into the scaffold, so it no longer
exists as work and the old `06 → 07` dependency is gone. **All seven remaining plans
touch disjoint files and run at the same time**, each in its own git worktree/branch.

| Plan | Page | Branch / worktree | Type |
|---|---|---|---|
| 01 | Paid Ads | `rev/paid-ads` | Real UI + data |
| 02 | Google Reviews | `rev/reviews` | Real UI + data |
| 03 | Website | `rev/website` | Real UI + data |
| 04 | Social Media | `rev/social` | Real UI (+ data flag) |
| 05 | Inbox | `rev/inbox` | Real UI restructure |
| 07 | Reactivation inner pages | `rev/reactivation` | Real UI + data |
| 08 | Leads cleanup (intro-call removal) | `rev/leads` | UI cleanup |

Plan `06` is retained only as a record of what the scaffold did; do not run it.

Worktrees live at `C:/Users/games/Desktop/hml-worktrees/<name>` and each already has
its dependencies installed. Run all app commands from `command-center/app` inside the
worktree.

## The app (read first)
- **Location:** `command-center/app`. One responsive React + Vite app (desktop + mobile PWA), same routes for both.
- **Run:** from `command-center/app` - `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`.
- **Routing:** `src/App.tsx` `<Routes>` table.
- **Sidebar + phone bottom-bar nav:** `src/lib/nav.ts` (`NAV`). Two sections only: Marketing, Company.
- **In-page sub-tabs:** `src/lib/pageTabs.ts` (per-section tab arrays + `sectionLabel()`).
- **Shared page header:** `src/components/PageBar.tsx` - renders section title, tab row, page actions, and the `description` prop under the divider. Section title comes from `sectionLabel()`.
- **Nav guard test:** `src/lib/nav.test.ts` asserts pageTabs routes exist and don't collide with sidebar rows. Update it whenever you add/rename/remove a tab or section.
- **Desktop vs mobile:** most routes are one responsive component; some have a `src/components/<feature>/*Desktop.tsx` variant rendered under a `hidden lg:...` block. Check each page's audit note in its plan.

## Data / wiring contract (hold in every plan)
- Real session calls `api('/api/...')` → Cloudflare Pages Function → GHL/source. Demo session (`?demo=1`) is served by the demo handlers. **Never edit `src/demo/handler.ts`.**
- **A real connected client never sees fabricated data.** Populated/demo layouts render only under `?demo=1`. Real sessions show real data, honest zeros, or an honest empty/not-connected state.
- If a source is not connected, show the existing not-connected / coming-soon component, not demo rows.

## Copy & brand rules (non-negotiable)
- **Never name GoHighLevel, GHL, pipelines, opportunities, or any internal tool in client-facing UI.** Customer language only.
- **No em dashes anywhere** (chat, copy, UI, docs, comments). Use commas, periods, parentheses, or colons.
- Match the surrounding code's style, component patterns, and Tailwind conventions.

## Verify before you ship (every plan)
From `command-center/app`:
1. `npm run typecheck` - clean.
2. `npm test` - green (update `nav.test.ts` if you touched nav/tabs).
3. `npm run build` - succeeds.
4. Walk the page at `?demo=1` and confirm the visual change.
5. Live `/api/*` is 401 unauthenticated, so the real-data path is verified in Jake's own Willis session, not by the agent. Note what Jake should eyeball.

Ship per the standing build-loop rule (commit, push, watch deploy, confirm the live bundle hash changed) only if Jake asked this instance to ship; otherwise stop at verified + report.
