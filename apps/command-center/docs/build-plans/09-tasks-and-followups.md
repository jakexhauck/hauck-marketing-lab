# 09: Tasks & Follow-ups

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Objective

Give the client a per-contact task list and a single "my open tasks" view: create a follow-up,
set a due date, check it off. Tasks are GHL-native, so anything created here shows up in GHL and
vice versa.

## Why it matters

Notes (08) record what happened; tasks record what is next. Together they turn the app into a
working surface rather than a report. A follow-up task with a due date is also the natural input
to the calendar (10) and the notification center (14): "you have 3 follow-ups due today" is the
kind of nudge that makes a client open the app daily.

## Dependencies

- Builds directly on the 08 pattern (per-contact write resource). Do 08 first; the route shape
  and the `useApi` mutation pattern are identical, so 09 is mostly a copy with a different noun.
- Soft dependency on 04 (user management) to assign a task to a specific team member via
  `assignedTo`. Until then, tasks are unassigned or assigned to the default user.

## Current state

Nothing. No task endpoints, no task UI. GHL holds tasks per contact already; the app simply does
not read or write them yet.

## Target state

GHL endpoints (v2, version `2021-07-28`):

- `GET    /contacts/{contactId}/tasks`
- `POST   /contacts/{contactId}/tasks`                       body `{ title, body?, dueDate, completed?, assignedTo? }`
- `PUT    /contacts/{contactId}/tasks/{taskId}`
- `DELETE /contacts/{contactId}/tasks/{taskId}`
- `PUT    /contacts/{contactId}/tasks/{taskId}/completed`    body `{ completed: boolean }`

`dueDate` is ISO 8601. Confirm timezone handling against a live response before trusting it (GHL
stores in the location's timezone; render in the same).

A `functions/api/contacts/[contactId]/tasks` resource (list + create) and a `[taskId]` sub-route
(update, complete, delete). A `<TaskList>` on the lead/contact detail. Plus a new `/today` style
roll-up: the existing `Today.tsx` route is the natural home for "open tasks due today" if you
want a cross-contact view (see step 5).

## Step-by-step

### 1. List + create route

`functions/api/contacts/[contactId]/tasks.ts`. Same shape as 08's notes route. Sort open tasks
first, then by `dueDate` ascending (soonest due at top); completed tasks sink to the bottom.

```ts
interface GhlTask {
  id: string; title: string; body?: string;
  dueDate?: string; completed?: boolean; assignedTo?: string;
}
```

### 2. Mutations sub-route

`functions/api/contacts/[contactId]/tasks/[taskId].ts` with `onRequestPut` (edit) and
`onRequestDelete`. Add a dedicated complete toggle: either a `PUT` to the `/completed` endpoint
or fold it into the main PUT. Prefer the dedicated `/completed` endpoint since GHL exposes it and
it is the most common action.

### 3. Client API + hook

`src/lib/api.ts`: `getTasks`, `createTask`, `updateTask`, `toggleTask`, `deleteTask`. A
`useTasks(contactId)` hook with optimistic completion (flip the checkbox immediately, roll back
on error) since check-off is the highest-frequency action and should feel instant.

### 4. `<TaskList>` component

`src/components/TaskList.tsx`: checkbox + title + due date, overdue dates in the alert color,
a compact "add task" row (title + optional due date). Render on `LeadDetail.tsx` beneath notes.

### 5. Cross-contact "due today" (optional, recommended)

GHL exposes `POST /contacts/tasks/search` for a location-wide task query in some API versions.
If available in the test account, add `functions/api/tasks/today.ts` that filters to
`completed=false` and `dueDate <= end-of-today`, and surface it on `Today.tsx`. If the search
endpoint is not available on the token, defer this step and ship the per-contact list only;
note the limitation rather than faking a roll-up.

## Testing

1. Create a task on a test contact with a due date; confirm it appears in GHL's contact tasks.
2. Check it off in the app; confirm GHL shows it completed (and it sinks in the list).
3. Edit the title and due date; confirm both persist.
4. Delete it; confirm it is gone in both places.
5. If step 5 shipped: a task due today appears in the Today roll-up; one due tomorrow does not.

## Acceptance criteria

- [ ] Per-contact tasks list with open-first, soonest-due ordering.
- [ ] Create / edit / complete / delete all write through to GHL.
- [ ] Completion is optimistic and rolls back on error.
- [ ] Overdue tasks are visually distinct.
- [ ] If the location-wide search is unavailable, the limitation is logged and documented, not
      hidden behind an empty or fabricated roll-up.

## Rollback

Delete the two task route files, the `TaskList` component and its usage, the `api.ts` functions,
and (if built) the `tasks/today.ts` route plus its `Today.tsx` section. No shared state touched.
