# Editable Pillar Tasks — Design

Date: 2026-06-27
Surface: command-center admin console, pillar workspace Tasks tab.

## Problem

Every pillar workspace (`/admin/pillar/<id>/tasks`) has a Tasks tab that renders a
fixed roadmap from `pillars.ts` as read-only rows. Jake cannot add a task to a
pillar from inside the app. He wants an "add a task" control on each pillar's
Tasks tab, with the added tasks persisted and synced across his Windows and Mac.

## Decisions (locked with Jake)

1. **Persistence:** Supabase, via the existing `admin_tasks` table. Synced across
   devices. Needs a DB migration.
2. **Task state:** binary done / not done (a checkbox), matching the standalone
   Admin Tasks page. No three-state todo/doing/done cycle.
3. **Roadmap rows:** everything editable. The static `pillars.ts` roadmap is
   migrated into the database as a one-time seed, after which all pillar tasks
   (seeded or newly added) can be checked off and deleted.

## Data model

Reuse `public.admin_tasks` (migration 0012). Add two nullable columns
(migration **0020**):

- `pillar_id text` — `null` means a standalone agency/client task (today's
  behaviour, the `/admin/tasks` page). A non-null value is a pillar id from
  `pillars.ts` (`operations`, `outreach`, `sales`, `onboarding`, `service`,
  `retention`).
- `note text` — optional context line, preserves the existing roadmap notes and
  is shown as a sub-line under the task title.

A task is never both a client task and a pillar task: pillar tasks have
`tenant_id = null` and `pillar_id = <id>`. We do not enforce this with a
constraint (service-role only, low risk), but the API always sets one or the
other.

Index: add `admin_tasks_pillar_idx on admin_tasks (pillar_id)` for the
per-pillar listing.

### Seed

Insert the current `pillars.ts` roadmap as rows. Mapping per `PillarTask`:

- `title` → `title`
- `status === "done"` → `completed = true`, otherwise `completed = false`
  (the `doing` state collapses to not-done, per decision 2)
- `note` → `note` (null when absent)
- `pillar_id` = the owning pillar's id
- `tenant_id = null`, `created_by = null`, `due_date = null`
- `created_at` = `now() + (n * interval '1 second')` where `n` is the row's
  global insert index, so seed order is preserved by an ascending `created_at`
  sort. (~13 rows total.)

The seed is written as explicit `insert` statements in the migration (the
roadmap content is duplicated from `pillars.ts` into SQL, a one-time copy). The
migration guards re-runs: seed only when no pillar tasks exist yet
(`where not exists (select 1 from admin_tasks where pillar_id is not null)`).

After this ships, `pillars.ts` `tasks` arrays are no longer the source of truth
for the Tasks tab. They are left in place as the documented seed reference, but
the live UI reads the database.

## API (`/api/admin/tasks`, admin-only, existing middleware)

`functions/api/admin/tasks/index.ts`:

- `GET`:
  - `?pillarId=<id>` → tasks where `pillar_id = <id>`, ordered
    `completed asc, created_at asc` (open first, then seed/added order).
  - no param → unchanged: tasks where `pillar_id is null`, ordered
    `completed asc, created_at desc`. This keeps the standalone Admin Tasks page
    behaviour identical and stops seeded pillar tasks from leaking into it.
- `POST`: accept optional `pillarId` and `note` in the body. When `pillarId` is
  present, insert with that `pillar_id`, `tenant_id = null`, and the `note`.
  Existing `title` validation unchanged.

`functions/api/admin/tasks/[taskId].ts`:

- `PATCH`: also accept `note` (set when the key is present; empty string → null).
  `completed` toggle and `title` edit unchanged.
- `DELETE`: unchanged (works for pillar tasks already, keyed by id).

The `toTask` shape gains `pillarId` and `note` fields so the client can render
the note and the hook can scope by pillar.

## Frontend

### `usePillarTasks(pillarId)` — new hook

`command-center/app/src/hooks/usePillarTasks.ts`. Plain `api()` + `useState`,
matching `AdminTasks.tsx` (the admin console does not use react-query). Returns:

```
{ tasks, loading, error, adding, addTask(title), toggleTask(task), deleteTask(task) }
```

- `addTask` POSTs `{ pillarId, title }` and prepends/appends to local state.
- `toggleTask` PATCHes `{ completed }` optimistically, rolls back on failure
  (same pattern as `AdminTasks.onToggle`).
- `deleteTask` DELETEs optimistically, rolls back on failure.

### `AdminPillar.tsx`

Call `usePillarTasks(pillar.id)` once at the top. Use it for:

- the Tasks tab count badge: replace `{pillar.tasks.length}` with the live
  `{tasks.length}`.
- pass the hook result down to `TasksTab` as props.

This gives a single fetch and an always-accurate badge regardless of the active
tab. (Small over-fetch on non-Tasks tabs; the payload is tiny.)

### `TasksTab.tsx`

Becomes presentational, taking the hook result as props:

- Add row: a text input ("Add a task...") + Add button. Enter or click submits a
  non-empty title via `addTask`. Sticky focus, clears on success.
- List: one row per task with a checkbox (calls `toggleTask`), the title
  (struck through + muted when done), an optional `note` sub-line, and a delete
  button revealed on hover (calls `deleteTask`).
- States: loading spinner, error line, and the existing empty state
  ("No tasks yet.") when the list is empty.
- Styling reuses the current `pk-task*` look so the rows match the rest of the
  pillar workspace.

`PillarTask` and `pillar.tasks` stay defined in `pillars.ts` as the seed
reference; nothing else reads them after this change except the migration's
hand-copied seed.

## Testing

- Unit-test `usePillarTasks` toggle/add/delete optimistic + rollback behaviour if
  a test harness for hooks exists in the package; otherwise cover the pure list
  ordering/mapping helper.
- Manual verification (per the build rules' Verify step): run the app, open two
  pillars, add a task to each, check it off, reload (persists), confirm the
  standalone `/admin/tasks` page does NOT show pillar tasks, and confirm the tab
  badge count updates live.

## Out of scope

- Due dates on pillar tasks.
- Three-state todo/doing/done.
- Reordering / drag.
- Editing a task's title inline (delete + re-add covers v1; can add later).

## Files touched

- `command-center/app/supabase/migrations/0020_pillar_tasks.sql` (new)
- `command-center/app/functions/api/admin/tasks/index.ts`
- `command-center/app/functions/api/admin/tasks/[taskId].ts`
- `command-center/app/src/lib/api.ts` (extend the admin task type)
- `command-center/app/src/hooks/usePillarTasks.ts` (new)
- `command-center/app/src/routes/admin/AdminPillar.tsx`
- `command-center/app/src/components/pillars/tabs/TasksTab.tsx`
</content>
</invoke>
