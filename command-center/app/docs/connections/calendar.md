# Connections: Company Calendar

The unified Company calendar (`/calendar`) merges four streams into one source-agnostic
model (`src/lib/calendarModel.ts`) rendered as Month / Week / Agenda views. It ships
demo-complete: `?demo=1` shows all four streams richly; a real session shows only the
streams that are actually wired. This file tracks what each stream needs to go live.

Statuses: ✅ live / ⚠️ partial / ❌ not wired.

## Streams

### Appointments ✅ live
- **Data source:** GoHighLevel calendar via `/api/calendar/events` (`useCalendarEventsQuery`),
  mapped by `appointmentToItem`. Next 30 days, read-only.
- **Auth:** existing client session (live/test) injects the GHL token server-side.
- **Notes:** the only stream with real data today. Timezone comes from the API response.

### Jobs ⚠️ partial
- **Data source:** `useJobs()` (`src/hooks/useJobs.ts`) currently returns demo rows and `[]`
  in a real session. To go live, query the GHL Sales Pipeline (`SALES_PIPELINE_ID`,
  see `src/lib/jobsPipeline.ts`) at the **Job Booked + Job Completed** stages, joined to
  each appointment for date/time + value, and map each to a `Job`. `jobToItem` already
  turns a `Job` into a calendar item, so nothing downstream changes.
- **Backend endpoint:** `/api/jobs` (or fold into `/api/calendar/events`) as a Pages Function.
- **Gating:** the `job` legend chip flips to connected automatically once `useJobs` returns rows
  (`connected.job` in `useCalendarItems`).

### Social posts ❌ not wired
- **Data source:** a social-post schedule. The Social section (`/marketing/social/calendar`)
  is still a hardcoded mock (`SocialCalendar.tsx`), so there is no live post feed yet.
- **Backend endpoint:** `/api/social/posts` returning scheduled + published posts with a
  scheduled time and channel; map to `CalendarItem` (source `social`).
- **Depends on:** the Social Media section's real backend (GHL social planner or the chosen
  scheduler). Until then `connected.social = false` and the chip shows a "turns on once
  connected" hint.

### Campaign sends ❌ not wired
- **Data source:** email/SMS campaign send dates from Marketing Campaigns (a coming-soon
  section today).
- **Backend endpoint:** `/api/campaigns/sends` returning scheduled/sent campaigns with a
  send time and audience size; map to `CalendarItem` (source `campaign`).
- **Depends on:** the Campaigns section's real backend. `connected.campaign = false` until then.

## Model / UI

- **Merge point:** `src/hooks/useCalendarItems.ts` is the single place streams are combined.
  Add a new stream by adding its mapper + demo data and one branch here; the three views need
  no change.
- **Demo data:** `src/lib/calendarDemo.ts` (July 2026, appointments/social/campaigns) plus
  `DEMO_JOBS` from `jobsPipeline.ts`. Real sessions never read these.
- **Colors:** `--source-*` tokens in `src/index.css` (light + dark). No hardcoded hex in views.
- **View preference:** persisted per-browser in `localStorage["hml_cal_view"]`.

## Persistence / secrets / webhooks

- **Persistence:** none beyond the view preference. The calendar is read-only over the source
  feeds; no calendar-owned store.
- **Secrets / env vars:** none new. Appointments reuse the existing GHL token; future streams
  reuse each section's existing credentials.
- **Webhooks:** none. Data is pulled on load and refetched every 5 minutes (appointments query).

## Backlog (polish, not blockers)

- Week view uses a fixed 7 AM to 7 PM window; items outside it are clipped. Widen or make the
  window data-driven if early/late items appear.
- Overlapping timed items pack into side-by-side lanes (`packDayColumns`); very dense days will
  narrow blocks. Consider a "+N" collapse past a lane cap.
