# Admin Calendar: work blocks + optional Google sync

Date: 2026-06-23
Status: Approved (design)

## Goal

Give Jake a calendar inside the **command-center admin console** to block off work
times. Connecting a Google Calendar is **optional**; when connected, blocks sync
two-way (in-app blocks push to Google, Google events show in-app).

Definition of done: from `/admin/calendar` Jake can see a month grid, create/edit/
delete colored work blocks, and optionally one-click connect a Google account so
blocks appear on his phone and his Google meetings overlay in the grid. The page is
fully usable with no Google connection.

## Non-goals (v1)

- No recurring blocks (create day by day).
- No bidirectional conflict resolution: edits made **on Google's side** to a block
  we pushed do NOT flow back into the app. Jake authors blocks in-app; Google is the
  mirror + meeting feed. (Full two-way needs Google sync tokens / push channels: v2.)
- Not the existing client-facing GHL calendar (that stays untouched).
- Single admin user (Jake). No per-user block ownership UI; `created_by` is recorded
  but all blocks are shared across admins.

## Architecture

### Surface / routing
- New nav item "Calendar" in `AdminLayout.tsx` `ADMIN_NAV` (lucide `CalendarDays`),
  placed after Tasks.
- New route `/admin/calendar` in `App.tsx`, wrapped in `<AdminRoute>` like every
  other admin page. Renders `routes/admin/AdminCalendar.tsx`.

### Frontend components (`src/components/admin/calendar/`)
- `MonthGrid.tsx` — 6x7 month grid, prev/next/today controls, current month default.
  Renders day cells with their chips.
- `BlockChip.tsx` — a chip for a work block (filled, category color) or a Google
  event (outlined, muted) so they read as distinct.
- `BlockEditorModal.tsx` — create/edit form: title, date, start time, end time,
  color category, delete button. Validates end > start.
- `ConnectGoogleCard.tsx` — top-of-page card: not connected -> "Connect Google
  Calendar" button (hits oauth/start); connected -> shows connected email +
  Disconnect. Reads connection status from the blocks query payload.
- Phone fallback: a simple stacked agenda/day list below `lg` (month grid is desktop
  only), consistent with how other admin pages degrade. Keep minimal.

### Color categories
Shared constant `src/lib/workBlockCategories.ts`:
- `deep` Deep Work, `client` Client, `admin` Admin, `off` Off.
- Each maps to a token-based class (reuse existing brand/surface tokens; no new
  raw hex unless needed). Stored on the row as the category key string.

### Data (Supabase; applied via `npm run db:migrate`)
New migration `0018_admin_calendar.sql` (latest existing is 0017_admin_sop_flags):

`work_blocks`
- `id uuid primary key default gen_random_uuid()`
- `title text not null`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `color text not null default 'deep'`  (category key)
- `google_event_id text`  (nullable; set when pushed to Google)
- `created_by uuid references admin_accounts(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- RLS enabled, no policies (service-role only, same as `drive_connection`).
- Index on `starts_at` for window queries.

`calendar_connection` (singleton, mirrors `drive_connection`)
- `id boolean primary key default true` + singleton check
- `refresh_token text not null`
- `access_token text`, `access_token_expires_at timestamptz`
- `connected_email text`, `scope text`
- `google_calendar_id text default 'primary'`
- `connected_by uuid references admin_accounts(id) on delete set null`
- `updated_at timestamptz not null default now()`
- RLS enabled, no policies.

### API (Cloudflare Pages Functions, `functions/api/admin/calendar/`)
Admin-gated by existing `/api/admin/*` middleware. All Supabase access via the
service-role client.

- `GET  /blocks?from=&to=` -> `{ blocks: WorkBlock[], googleEvents: GoogleEvent[],
  connection: { connected: boolean, email: string|null } }`. Lists work_blocks in
  window; if connected, also fetches Google events for the window (excluding events
  whose id matches a known `google_event_id`, to avoid double-render).
- `POST   /blocks` -> create; if connected, push to Google, store `google_event_id`.
- `PATCH  /blocks/:id` -> update; if connected + has `google_event_id`, patch the
  Google event (create one if missing).
- `DELETE /blocks/:id` -> delete row; if connected + has `google_event_id`, delete
  the Google event (ignore 404/410).
- `GET  /oauth/start` -> Google consent, scope
  `https://www.googleapis.com/auth/calendar.events`, offline access, prompt=consent.
  CSRF state cookie scoped to `/api/admin/calendar/oauth`. Mirrors assets start.ts.
- `GET  /oauth/callback` -> verify state, exchange code, identify account email,
  upsert `calendar_connection`, redirect `/admin/calendar?connected=1`.
- `POST /disconnect` -> delete the `calendar_connection` row.

### Shared lib `functions/lib/calendarGoogle.ts`
Mirrors `driveDirect.ts`:
- `CALENDAR_SCOPE` constant.
- `getAccessToken(env)` -> read connection, refresh access token if expired using
  the refresh token, persist the new access token + expiry. Returns null if not
  connected.
- `listEvents(env, accessToken, calendarId, fromIso, toIso)` -> Google Calendar
  `events.list` (singleEvents, timeMin/timeMax, orderBy startTime).
- `insertEvent / patchEvent / deleteEvent` -> Calendar `events` REST calls. Map a
  work block to a Google event (summary=title, start/end dateTime + tz).

### Client-side glue
- `src/lib/api.ts`: `WorkBlock`, `GoogleEvent` types + fetch helpers for the 4 block
  endpoints and connection status.
- `src/hooks/useApi.ts`: `useWorkBlocksQuery(from,to)` + create/update/delete
  mutations with optimistic-ish invalidation of the blocks query.

## Data flow
1. Page loads month -> `GET /blocks?from=monthStart&to=monthEnd`.
2. Grid renders work_blocks (filled chips) + googleEvents (outlined chips).
3. Create/edit/delete -> mutation -> server writes Supabase, mirrors to Google if
   connected -> query invalidated -> grid refreshes.
4. Connect -> oauth round-trip -> connection row -> next blocks fetch includes Google
   overlay and mutations begin mirroring.

## Error handling
- Google API failures during a block mutation must NOT fail the in-app write: the
  block is the source of truth. Catch + log Google errors; the row still saves
  (its `google_event_id` just stays null / stale). Surface a soft toast
  ("Saved. Google sync failed, will retry on next edit.").
- `oauth/start` returns 503 if `GOOGLE_OAUTH_CLIENT_ID` unset (same as assets).
- Callback failures redirect with `?connect_error=<reason>`; page shows a banner.
- `GET /blocks` degrades gracefully: if the Google overlay fetch throws, return
  blocks with empty googleEvents rather than erroring the whole page.

## Testing
- Unit: block->Google event mapping, time validation (end>start), window query
  bounds, dedupe of overlay events by `google_event_id`.
- Manual (Playwright + real running app): create a block, edit it, delete it; verify
  month nav; verify the page works with no connection; verify connect card states.
- Google sync verified manually against a real test Google account at ship time.

## Deployment / ops checklist (ship time)
1. Add `https://www.googleapis.com/auth/calendar.events` to the Google Cloud OAuth
   consent screen scopes (same project as the Drive scope).
2. Confirm `GOOGLE_OAUTH_CLIENT_ID/_SECRET` already set on CF Pages (they are, for
   Assets). Redirect for calendar defaults to
   `/api/admin/calendar/oauth/callback`; add it to the OAuth client's authorized
   redirect URIs.
3. `npm run db:migrate` to apply `0018_admin_calendar.sql`.
4. Deploy, smoke-test `/admin/calendar` live.
