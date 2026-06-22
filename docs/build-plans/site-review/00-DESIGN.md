# Site Review: design

Status: approved 2026-06-22. Source: brainstorming session.

## What it is

A "My Site" area in the client-facing Command Center where each client sees
up-to-date screenshots of their live website / funnel pages, drops pin-notes
anywhere on a page, and tracks the status of each request. The agency works the
incoming notes from a unified "Site Feedback" inbox in the admin tower, replies,
and moves each note through New -> In progress -> Done. Clients view and comment
only; they never edit the site. Jake makes the actual change in GoHighLevel.

## Why this shape

GHL sites live on their own domain. Browsers block any app from reading or
drawing on top of another site loaded in a cross-origin iframe, so notes cannot
pin to live DOM elements without injecting a script into GHL or proxying the
site. Both are fragile or high-maintenance. A snapshot board (full-page
screenshots the client annotates) is cross-origin safe, looks premium, works on
phone, and is the cleanest path. The trade-off (notes are coordinates on an
image, not live elements) is acceptable and managed via versioned captures.

## Decisions locked in brainstorming

1. **View mode:** Snapshot board (screenshots, not live/iframe/proxy).
2. **Capture:** Auto-capture from registered page URLs. MVP = on-demand
   "Recapture" button; v2 = scheduled nightly refresh.
3. **Notes:** Tracked with status (New / In progress / Done) + admin replies the
   client can see. Two-way, not a one-way suggestion box.
4. **Admin:** Unified "Site Feedback" inbox across all clients, plus a per-client
   board inside the client's admin detail. New notes ping admins; replies and
   status changes ping the client. Reuse the existing notification center + push.

## Data model (Supabase migration `0017_site_review.sql`)

- **`site_pages`** — one row per registered page for a client.
  - `id`, `tenant_id`, `label` (e.g. "Home"), `source_url`, `sort_order`,
    `latest_capture_id` (nullable FK), `created_at`.
- **`site_captures`** — versioned screenshots of a page.
  - `id`, `page_id` (FK), `storage_path`, `image_width`, `image_height`,
    `captured_at`, `status` (pending / ready / failed).
- **`site_notes`** — a pin-note on a specific capture.
  - `id`, `tenant_id`, `page_id` (FK), `capture_id` (FK), `x_pct`, `y_pct`
    (floats 0..1, NOT pixels), `body`, `status` (new / in_progress / done),
    `created_by` (client user id), `created_at`, `resolved_at` (nullable).
- **`site_note_replies`** — thread on a note.
  - `id`, `note_id` (FK), `author_type` (admin / client), `author_id`, `body`,
    `created_at`.

**Pin robustness:** coordinates are stored as a percentage of the capture they
were made on, and bound to that `capture_id`. When a page is recaptured and the
layout shifts, existing pins stay attached to the capture version they were
created against, so they never drift onto the wrong element. The newest capture
becomes the default layer for new notes; a note created on an older capture
shows a "newer version exists" hint.

## Storage + capture pipeline

- Private Supabase Storage bucket `site-captures`, following the same pattern as
  the team-comms bucket (migration `0016`). Images served via signed URLs.
- **Register pages:** admin enters page label + live URL per client (in the
  client's admin detail).
- **Capture (MVP, on-demand):** admin hits **Recapture** -> Pages Function calls
  an external full-page screenshot API -> uploads the PNG to `site-captures` ->
  inserts a `site_captures` row (with image dimensions) -> updates the page's
  `latest_capture_id`.
- **Capture (v2, scheduled):** nightly auto-refresh via a small Cloudflare Worker
  cron or trigger.dev job that re-runs capture for every registered page.
- **External dependency:** a screenshot API key (ScreenshotOne / Urlbox /
  APIFlash). This is a Jake action item before the capture function can run.
  Cloudflare Pages Functions have no cron, which is why nightly is v2.

## Client UI ("My Site" nav)

- New nav entry in the client-facing app: **My Site**.
- Lists the client's registered pages (label + thumbnail of latest capture).
- Open a page -> full-page screenshot in a scrollable canvas.
- Tap / click anywhere -> drops a numbered pin and opens a note composer.
- Existing pins render as numbered dots; tap to open the note thread (their note,
  agency replies, current status).
- Read-only otherwise: no editing the page, no moving others' pins.
- Works on phone / PWA (tap to pin).

## Admin UI

- **`/admin/site-feedback`** — unified queue across all clients: client, page,
  note snippet, status, thumbnail. Filter by client and status. Click a note ->
  opens the page board with that pin in context + reply box + status control.
- **Site tab inside each client's admin detail** (`AdminClientDetail`) — manage
  registered page URLs, trigger Recapture, and view that client's board.

## Notifications (reuse existing center + push)

- New client note -> notify admins (notification center + push).
- Agency reply or status change -> notify the client.

## Build order

1. Migration `0017_site_review.sql` + storage bucket.
2. Storage helper + capture Pages Function (on-demand).
3. Client "My Site" board (list, page view, pin, note thread).
4. Admin "Site Feedback" inbox + per-client Site tab + page management.
5. Notifications wiring.

## Out of scope (v1)

- Live / element-aware annotation (iframe, injected widget, proxy).
- Scheduled nightly auto-capture (v2 fast-follow).
- Client editing the site or applying changes themselves.
- Manual screenshot upload fallback (can add later if a page resists capture).
