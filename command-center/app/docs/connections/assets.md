# Assets — connections backlog

`/company/documents` (Company > Assets). Client-facing file library served from a
Google Drive the client connects themselves. Shipped **demo-complete but not
connected**: demo/preview renders the populated Drive (Variation A: folder rail +
file list on sample data); a real session shows the "Connect your Google Drive"
state with a disabled connect button. Every write action is gated with a toast.

Design decisions live in the `project_client_drive_feature` memory. Scope is
**`drive.file`** (non-sensitive: no Google restricted-scope verification / CASA),
so the client uses a Google **Picker** to choose which folders to share.

## Status legend
❌ not wired · ⚠️ partial · ✅ live

## Data source(s)
- ❌ **Google Drive (per-tenant)** — the client's own Drive, connected via OAuth.
  Powers the file list, folder/category grouping, storage meter, upload,
  download, new folder. Reuse `functions/lib/driveDirect.ts` (token-per-call REST).
- ❌ **Category mapping** — the demo groups files into Contracts / Brand / Reports /
  Invoices. Decide the real mapping (shared Drive folders per category, or a label
  convention) when wiring; the UI reads `DemoFile.cat` today.

## AI
- None. This surface has no Claude calls.

## Backend endpoints (Pages Functions to build)
- ❌ `GET  /api/assets/oauth/start` — begin client Drive OAuth (`drive.file`).
- ❌ `GET  /api/assets/oauth/callback` — exchange code, store the per-tenant token.
- ❌ `GET  /api/assets/files` — list shared files (name, kind, size, modifiedTime, owner).
- ❌ `POST /api/assets/upload` — upload into the connected Drive.
- ❌ `POST /api/assets/folder` — create a folder.
- ❌ `GET  /api/assets/download?id=` — signed download / passthrough.

## Auth / identity
- ⚠️ Session already carries the tenant. New: a per-tenant Drive connection record,
  and the admin "Client Drives" view browses a client's Drive via that stored token.

## Secrets / env vars
- ❌ `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` — Web OAuth client
  (redirect `https://app.hauckmarketing.com/api/assets/oauth/callback` + JS origin).
- ❌ `GOOGLE_PICKER_API_KEY` — for the folder Picker.
- **Waiting on Jake:** Google Cloud setup (enable Drive + Picker APIs, consent
  screen with `drive.file`, Web OAuth client, API key), then send the three values.

## Webhooks
- None required for v1. (Optional later: Drive push notifications to refresh
  listings instead of on-load fetch.)

## Persistence
- ❌ `tenant_drive_connection` table (tenant_id, refresh token, connected email,
  shared folder ids, connected_at). Files themselves stay in Drive — not mirrored.

## Per-action gating (what each connection turns on)
- **Connect Google Drive** ← OAuth start/callback + `tenant_drive_connection`.
- **Upload / New folder** ← `POST /api/assets/upload` · `/api/assets/folder`.
- **Download / ⋯** ← `GET /api/assets/download`.
- **File list + counts + storage meter** ← `GET /api/assets/files`.

Until these exist the page is demo-aware and gated, so a real client only ever sees
the connect prompt — never fabricated files.
