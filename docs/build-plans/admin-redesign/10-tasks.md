# 10 — Tasks (Operations)

Approved mockup (implement THIS): `command-center/docs/mockups/admin-redesign/task-list-A.html`. Read `_architecture.md` + `00-foundation.md` first. This surface REUSES the existing `admin_tasks` table + `/api/admin/tasks` endpoints (migrations 0012 + 0020); it only adds two columns and retires the old standalone `/admin/tasks` route (00-foundation F1).

## 1. Goal / DoD
Operations pillar tab "Tasks": an editable working checklist. One flat table of agency tasks with a Done checkbox, an editable Task title, a Notes/Files cell, a status pill (To do / Doing / Done), and an editable Updates cell. Add-a-row appends a blank task and focuses it; every cell edits inline and persists; the checkbox and status pill stay in sync (checking Done sets status Done; setting status Done checks Done; un-checking a Done row drops it to Doing). Header sub-line shows `N open, N done`. Manual entry; app DB is source of truth. The old `/admin/tasks` page is removed and folded into this tab.

## 2. Chosen layout
`task-list-A.html` (Bento Bold, editable table). Structure:
- Operations tab bar (Calculator · Time Audit · **Tasks**) — supplied by the Operations `PillarPage` (00-foundation F2), not by this component.
- Header block: kicker "Operations", title "Tasks", tagline "Your working checklist." — supplied by `PillarPage`.
- An "Add task" primary button (top-right of the controls row).
- One `.tablecard`: card head (`Today's Checklist` + `N open, N done` sub + a To do/Doing/Done legend) over a scrollable sticky-header table.
- Columns: Done (22px checkbox) · Task (bold input) · Notes / Files (input, optional file icon) · Status (pill `<select>`) · Updates (input).
- Row states: a done row is dimmed with strikethrough title/inputs. Status pill colors: To do = amber, Doing = sky, Done = green.

Port the markup/CSS into the `.pk-kit` admin theme (Bento Bold). No em dashes in code/UI (the mockup's `—` placeholder in the Updates cell must become a plain placeholder like `Add an update` or empty).

## 3. Data model
REUSE `admin_tasks` (0012 + 0020). Agency-internal (this tab reads the standalone list: `pillar_id is null`). Do NOT create a new table.

Migration `00NN_admin_task_status.sql` (next free at build time — architecture says next-new is 0027, and 03-cold-call also claims 0027, so this is most likely **0028**; use `add column if not exists` so ordering never matters). Add ONLY the two missing columns:
- `status text not null default 'todo'` with `check (status in ('todo','doing','done'))`.
- `updates text` (the mockup's "Updates" cell; free text, nullable).

Backfill existing rows: `status` defaults to `'todo'`; then set `status = 'done' where completed = true` (idempotent one-shot `update`). Keep `status`/`completed` consistent on every write (the API does this — see §4). The Notes/Files "file" icon in the mockup is seed-only (no upload UI); Phase 1 renders the Notes cell from the existing `note` column and does NOT ship a file column or attachments — attachments are Phase 2 (§9). Do not add `has_file`.

No new indexes needed; the existing `admin_tasks_listing_idx (completed, created_at desc)` already orders the list.

## 4. API
REUSE the existing admin-gated, service-client endpoints. Extend them for the two new fields; do NOT add new routes.

`functions/api/admin/tasks/index.ts`:
- Add `status, updates` to `SELECT` and to `toTask()` (map `updates` → `updates`, `status` → `status`).
- `onRequestGet` (no `pillarId`) already returns the standalone list (`pillar_id is null`, open-first) — this is the tab's data source; unchanged beyond the wider SELECT.
- `onRequestPost` (add-a-row): accept optional `status` (default `'todo'`, validate against the enum) and `updates` (trim → null). Title may be empty on create (the mockup adds a blank row then focuses it) — allow an empty title on POST for this surface, OR create with a single space and let the first inline edit set it; prefer: relax the title-required guard to default to `''` and drop the 400 so a blank row can be added, since the row is immediately editable. (Confirm this does not break the old callers — they always send a title; keeping the guard only when `title` key is present is safe.)

`functions/api/admin/tasks/[taskId].ts` (`onRequestPatch`):
- Add to the whitelist: `if ("status" in body)` → validate enum, set `update.status`; `if ("updates" in body)` → trim → null, set `update.updates`.
- Keep `status`/`completed` coupled server-side as a safety net: if `completed === true` and no explicit `status`, set `status = 'done'`; if `completed === false` and stored/incoming status is `'done'`, set `status = 'doing'`; if `status === 'done'` and no explicit `completed`, set `completed = true`; if `status` moves off `'done'` and no explicit `completed`, set `completed = false`. (The client also sends both on coupled changes — §5 — so this is defensive.) Extract this pure coupling into `functions/lib/taskStatus.ts` (§6) and call it from both POST and PATCH.
- Add `logAdminAction(client, ctx.data.admin!.id, "task.update", null, { taskId })` on PATCH and `"task.create"`/`"task.delete"` on POST/DELETE — these endpoints currently skip audit and `_architecture.md` requires it on writes. Best-effort, never blocks the write.

DELETE is unchanged (reused for row removal if a delete affordance is added; the mockup has none in Phase 1, so a delete control is optional — keep the endpoint available but the table need not expose delete this pass).

## 5. Client
- **DTO** `src/lib/api.ts` → extend `AdminTask`: add `status: "todo" | "doing" | "done"` and `updates: string | null`. Add a `TaskStatus` union type. (Old callers — the retired AdminTasks page is deleted; `usePillarTasks`/pillar Tasks tab read the same DTO and simply ignore the new optional-in-practice fields, which now always arrive.)
- **Hook** `src/hooks/useAdminTaskList.ts` (new) — modeled on `usePillarTasks.ts` (plain `api()` + `useState`, optimistic with rollback; the admin side does not use react-query). Exposes:
  - `tasks, loading, error, adding`
  - `addTask()` → POST blank/`todo` row, append, return the created row's id so the UI can focus it.
  - `patchField(task, field, value)` → optimistic PATCH of a single `title | note | updates` field (debounce-on-blur or on change; blur is simplest and matches inline-edit).
  - `setStatus(task, status)` → optimistic PATCH `{ status, completed: status === "done" }`.
  - `toggleDone(task)` → optimistic PATCH `{ completed, status }` using the pure coupling helper (checking → `done`; un-checking a `done` → `doing`).
  Reuse the `deriveCoupling` logic from a shared `src/lib/taskStatus.ts` (§6) so client and server agree.
- **Component** `src/components/admin/OperationsTasksTab.tsx` (new) — ports `task-list-A.html`: the Add-task button, the `.tablecard`, sticky-header scroll table, checkbox, inline `<input>`s, and the status `<select>` pill. Renders the `N open, N done` sub from a pure `taskCounts()` helper. Mounts inside the Operations `PillarPage` (00-foundation F2) as the body for `?tab=tasks` (add the `tasks` entry to the Operations tab config in `src/lib/adminPillars.ts` and the branch in the Operations pillar page's tab switch). The header/kicker/tagline and the tab bar come from `PillarPage`; this component renders only the controls row + table card.
- **Retire the old route**: delete `src/routes/admin/AdminTasks.tsx`; remove its import + the `/admin/tasks` `<Route>` in `src/App.tsx`; add a `<Route path="/admin/tasks" element={<Navigate to="/admin/pillar/operations?tab=tasks" replace />} />` so old links land on the new tab. Remove any `SPINE_NAV`/menu link to `/admin/tasks`.

## 6. Tests
`src/lib/taskStatus.ts` + `src/lib/taskStatus.test.ts` (pure, shared by client hook and server endpoints — import the app copy from functions or duplicate the tiny pure fn if cross-package import is awkward; a `functions/lib/taskStatus.ts` mirror with its own `taskStatus.test.ts` is fine):
- `deriveCoupling`: checking Done → `{completed:true, status:"done"}`; un-checking a `done` row → `{completed:false, status:"doing"}`; setting status `done` → `completed:true`; moving status off `done` → `completed:false`; setting status `todo`/`doing` on an unchecked row leaves `completed:false`.
- `isValidStatus` enum guard (rejects unknown strings).
- `taskCounts(tasks)` → `{ open, done }` for the sub-line.

## 7. File-by-file
1. `supabase/migrations/00NN_admin_task_status.sql` — `add column if not exists status/updates` + enum check + `status='done' where completed` backfill.
2. `src/lib/taskStatus.ts` (+ `taskStatus.test.ts`) — `deriveCoupling`, `isValidStatus`, `taskCounts` (pure).
3. `functions/lib/taskStatus.ts` (+ test) — mirror of the coupling/validate fns for the endpoints (or a shared import if the build allows).
4. `functions/api/admin/tasks/index.ts` — widen SELECT + `toTask`, POST accepts `status`/`updates`, allow blank title, `logAdminAction`.
5. `functions/api/admin/tasks/[taskId].ts` — PATCH whitelist `status`/`updates`, apply coupling, `logAdminAction`.
6. `src/lib/api.ts` — extend `AdminTask` (+ `TaskStatus`).
7. `src/hooks/useAdminTaskList.ts` — new plain-api hook (add/patchField/setStatus/toggleDone, optimistic).
8. `src/components/admin/OperationsTasksTab.tsx` — port `task-list-A.html` into `.pk-kit`.
9. `src/lib/adminPillars.ts` — add the `tasks` tab to the Operations pillar config (depends on 00-foundation F2).
10. Operations `PillarPage` tab switch — render `<OperationsTasksTab />` for `?tab=tasks`.
11. `src/App.tsx` — remove the `AdminTasks` import + `/admin/tasks` route; add the `/admin/tasks` → `/admin/pillar/operations?tab=tasks` redirect.
12. Delete `src/routes/admin/AdminTasks.tsx`.

## 8. Verify
`npm run typecheck && npm test && npm run build`. `npm run db:migrate` (applies the two `add column if not exists` + backfill cleanly and idempotently). In-app (Operations → Tasks): add a task (blank row appears + focuses), type a title/note/update (blur → reload → persisted), flip the status pill To do→Doing→Done (row dims, checkbox ticks), un-check a Done row (drops to Doing), confirm `N open, N done` updates. Hit old `/admin/tasks` → redirects to the new tab. Confirm the retired route no longer 404s and the app still boots.

## 9. Out of scope / Phase 2
- Notes/Files **attachments** (real upload + the file icon wired to a stored asset). Phase 1 shows the `note` text only; the mockup's file icon is decorative seed data and is not shipped.
- Per-client tagging, due dates, and category chips from the OLD `AdminTasks` page are intentionally dropped from this flat checklist (the endpoint still supports `tenantId`/`dueDate` for the pillar Tasks tab, but this surface does not surface them).
- Row reordering / drag-sort. Ordering stays open-first then `created_at` (existing index).
- Auto-populating tasks from GHL/Meta or a recurring-task template. Not now.
