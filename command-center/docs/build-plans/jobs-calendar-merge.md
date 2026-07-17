# Jobs + Calendar merge

Combine the standalone Calendar page into the Jobs tab as a set of switchable
views. Jobs keeps its structure and stays the default; Month / Week / Agenda
move in from the old Calendar. The surface shows estimates and jobs only, no GHL
appointment overlay.

Date: 2026-07-17
Branch: `feat/leads-sales-trash`
Preset: Web app feature (command-center). Desktop this pass; mobile keeps its
current Jobs day-panel (phone agenda list folded in as a follow-up).

## Why

Jobs and Calendar overlap heavily. Jobs is already a mini month-calendar plus a
selected-day job list; Calendar is the same jobs (plus appointments) in richer
Month / Week / Agenda views. Two sidebar items for one idea. Jake is handling
appointments elsewhere, so the calendar only needs to show the sales work:
scheduled estimates and booked/completed jobs.

## Definition of done

- Desktop Jobs tab (`/sales/jobs`) has a view switcher: **Jobs · Month · Week ·
  Agenda**. Default is **Jobs** (the current mini-cal + day-cards layout,
  unchanged).
- Month / Week / Agenda render the existing calendar view components, fed by
  jobs and estimates only. No appointment source, no source that toggles it.
- Selected view persists across reloads (localStorage), same as the old Calendar.
- Estimates (Sales pipeline "Estimate Scheduled" stage) appear alongside jobs,
  colored distinctly from booked/completed jobs, in both the calendar views and
  the default Jobs day-panel (dot + month-summary line).
- "Calendar" is gone from the sidebar. `/calendar` redirects to `/sales/jobs`.
- Typecheck + build clean. Existing tests green, new coverage for the estimate
  mapping.

Out of scope: mobile calendar views (follow-up), appointment overlay (removed),
job/estimate stage writes beyond what already exists, invoices/payments.

## Current state (what exists)

- `src/routes/sales/Jobs.tsx` — the Jobs tab. Mini month-calendar (left) +
  selected-day job cards (right). Reads `useJobs()`, uses `jobsPipeline.ts`
  helpers (`dayKinds`, `monthSummary`, `jobKind`).
- `src/routes/Calendar.tsx` — standalone Calendar. Phone list (below `lg`) +
  `CalendarDesktop` (at `lg`).
- `src/components/calendar/CalendarDesktop.tsx` — the desktop calendar: a
  controls row (Today / prev-next / range label / `SourceLegend`) + `MonthView`
  / `WeekView` / `AgendaView`, fed by `useCalendarItems`.
- `src/components/calendar/{MonthView,WeekView,AgendaView}.tsx` — read only
  `CalendarItem[]` and color by `CALENDAR_SOURCE_META[item.source]`. Untouched by
  this work.
- `src/lib/calendarModel.ts` — `CalendarItem`, `CalendarSource`
  (`appointment | job`), `CALENDAR_SOURCE_META`, `jobToItem`, `appointmentToItem`.
- `src/hooks/useCalendarItems.ts` — merges appointments + jobs into
  `CalendarItem[]`.
- `functions/api/sales/jobs/index.ts` — resolves the Sales pipeline + Job Booked
  / Job Completed stages by name, joins each opportunity to its appointment for
  date/time, returns `Job[]`.
- `src/lib/nav.ts` — sidebar items, including Jobs and Calendar.
- `src/App.tsx` — routes `/sales/jobs` and `/calendar`.

## Design

### 1. `estimate` as a first-class kind

Add `estimate` to the domain so it flows through both the day-panel and the
calendar views without touching the view components.

**`src/lib/jobsPipeline.ts`**
- Widen `JobStatus` to `"booked" | "completed" | "estimate"`.
- Widen `DayKind` to include `"estimate"`.
- `jobKind`: a job with `status === "estimate"` returns `"estimate"`.
- `KIND_TONE.estimate` + `KIND_LABEL.estimate = "Estimate"`.
- `dayKinds`: include `estimate` in the stable dot order (estimate first, then
  booked, completed, unpaid).
- `monthSummary`: count estimates (`estimates`, `estimatesValue`) separately;
  they are neither booked nor completed.
- Add a couple of estimate rows to `DEMO_JOBS` so the preview shows the new kind.

**`src/lib/calendarModel.ts`**
- Add `"estimate"` to `CalendarSource`.
- `CALENDAR_SOURCE_META.estimate` — a distinct color (e.g. an indigo/violet
  `--source-estimate` / `--source-estimate-tint`, added to `index.css` for both
  themes; the brand green stays "job", a warmer tone stays for completed within
  the day-panel).
- `jobToItem`: pick `source` from the job kind, so an estimate job maps to
  `source: "estimate"` and a booked/completed job to `source: "job"`.
- `CALENDAR_SOURCE_ORDER` for this surface becomes `["estimate", "job"]`.

### 2. Backend: include the Estimate Scheduled stage

**`functions/api/sales/jobs/index.ts`**
- Resolve an estimate stage id by name alongside the two job stages: exact
  `"estimate scheduled"`, then contains `"estimate"`.
- IMPORTANT (standing rule "check live GHL first"): confirm the exact live stage
  name via the `ghl` CLI before finalizing the matcher. Memory says the live
  Willis Sales pipeline stage is "Estimate Scheduled"; verify, do not trust the
  repo constant.
- Opportunities at the estimate stage map to `status: "estimate"` (same date/time
  join as jobs: appointment `startTime`, else the opportunity timestamp).
- `ApiJob.status` widened to include `"estimate"`. Everything else in the mapper
  is unchanged (estimates carry the same contact/address/value fields).

### 3. Reusable calendar body

Extract the calendar controls + views out of `CalendarDesktop.tsx` into a
reusable component so Jobs can render it.

**New `src/components/calendar/CalendarViews.tsx`**
- Props: `items: CalendarItem[]`, `connected: boolean`, `view: "month" | "week"
  | "agenda"`. Jobs owns the view state (the switcher lives in the Jobs
  `PageHeader`, step 4); `CalendarViews` owns only the anchor + selected-day
  state.
- Contains: the Today / prev-next / range-label controls row, the anchor +
  selected-day state, the `SourceLegend`, and the `MonthView` / `WeekView` /
  `AgendaView` switch. This is the body of today's `CalendarDesktop`, lifted
  minus the `DesktopPage` wrapper, the data hook, and its own Segmented (which
  moves up to Jobs).
- `SourceLegend` now shows Estimate / Job (drops Appointment naturally, since the
  feed has no appointment items and `CALENDAR_SOURCE_ORDER` is `["estimate",
  "job"]`).

### 4. Jobs tab hosts the switcher

**`src/routes/sales/Jobs.tsx`**
- Add a `Segmented<"jobs" | "month" | "week" | "agenda">` control to the
  `PageHeader` `actions`. Default `"jobs"`. Persist to `localStorage`
  (`hml_jobs_view`), same pattern as the old `hml_cal_view`.
- When view is `"jobs"`: render the current layout exactly as today.
- When view is `"month" | "week" | "agenda"`: build `CalendarItem[]` from the
  same `useJobs()` data via `jobToItem` (jobs-only, no appointment query), and
  render `<CalendarViews>` with that view. `connected` = `jobs.length > 0`.
- The existing job-card modals (message, reschedule) stay bound to the `"jobs"`
  view; the calendar views are read/select only this pass (clicking a day
  surfaces that day's items in the calendar's own day panel, no card actions).

### 5. Retire the standalone Calendar

- `src/lib/nav.ts`: remove the Calendar item (line ~114).
- `src/App.tsx`: `/calendar` becomes `<Navigate to="/sales/jobs" replace />`.
  Remove the `Calendar` import + route element.
- Delete `src/routes/Calendar.tsx` and `src/components/calendar/CalendarDesktop.tsx`
  (its guts now live in `CalendarViews`). Per the "delete built plans / dead code"
  hygiene rule, remove in the same commit.
- `useCalendarItems.ts` + `appointmentToItem` + `DEMO_APPOINTMENTS`
  (`calendarDemo.ts`) become unused. Remove them and their tests
  (`calendarDemo.test.ts`, appointment cases in `calendarModel.test.ts`) unless
  another surface imports them (grep first: `SocialCalendar`, `NotificationsDesktop`
  reference "calendar" but are unrelated; confirm no live import before deleting).

## Implementation plan (ordered, file-by-file)

1. **`src/lib/jobsPipeline.ts`** — add the `estimate` status/kind, tone, label,
   `dayKinds` order, `monthSummary` estimate counts, and a demo estimate or two.
   Update `jobsPipeline` unit expectations if any assert the summary shape.
2. **`src/index.css`** — add `--source-estimate` / `--source-estimate-tint` for
   light + dark.
3. **`src/lib/calendarModel.ts`** — add `estimate` source + meta, `jobToItem`
   source-by-kind, reorder `CALENDAR_SOURCE_ORDER`. Update
   `calendarModel.test.ts` (drop appointment cases, add estimate mapping).
4. **`functions/api/sales/jobs/index.ts`** — resolve the estimate stage by name
   (after confirming the live name via `ghl`), map those opportunities to
   `status: "estimate"`, widen `ApiJob.status`.
5. **`src/components/calendar/CalendarViews.tsx`** — new; lift the body of
   `CalendarDesktop`. Feed by props.
6. **`src/routes/sales/Jobs.tsx`** — add the `Segmented` view switcher, persist
   choice, render `CalendarViews` for the three calendar views built from
   `useJobs()` via `jobToItem`; update the day-panel summary to show estimates.
7. **`src/lib/nav.ts`** — remove the Calendar item.
8. **`src/App.tsx`** — redirect `/calendar` → `/sales/jobs`; drop the `Calendar`
   import/route.
9. **Delete** `src/routes/Calendar.tsx`, `src/components/calendar/CalendarDesktop.tsx`,
   `src/hooks/useCalendarItems.ts`, `appointmentToItem`, `DEMO_APPOINTMENTS` +
   dead tests, after grep-confirming no live importers.
10. **Verify** — typecheck, vite build, `npm test`. Run the app, open Jobs,
    switch all four views in demo (`?demo=1`), confirm estimates show colored and
    `/calendar` redirects.

## Risks / notes

- The exact estimate stage name must be verified live before wiring (standing
  rule). If a client renamed it, the `contains "estimate"` fallback covers most
  drift.
- Mobile: `/calendar` now redirects to the Jobs day-panel on phones too, so the
  phone "next 30 days" agenda list is temporarily gone until the follow-up folds
  it into the Jobs tab. Accepted for this pass.
- Removing `useCalendarItems`/appointment mapping is the biggest deletion; grep
  for importers first so nothing else breaks.
