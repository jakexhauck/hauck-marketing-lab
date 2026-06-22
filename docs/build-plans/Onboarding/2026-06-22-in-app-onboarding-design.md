# In-App Client Onboarding — Design Spec

Date: 2026-06-22
Status: Approved design, pre-plan
Scope: command-center app (`command-center/app`). NOT the old Tauri `app/`.

## Problem

Today onboarding lives in three disconnected places: a standalone HTML intake form
(`mockups/forms/client-intake/variant-a-stepped-wizard.html`), a separate booking
calendar mockup, and a 6-phase checklist that only existed in the retired Tauri app
(`app/src/lib/onboardingPlan.ts`). None of it is in the live command-center product.

Jake wants onboarding to happen inside the app: he creates a bare client, the client
logs in and is shown only the onboarding form, fills it out, and the answers land back
with Jake in an admin Onboarding tab where he also tracks his own fulfilment work.

## Goals

- Admin can start an onboarding from inside command-center: create a bare client and
  get a magic link to send.
- The client opens that link, lands in the app, and sees ONLY the onboarding form until
  it is submitted. The rest of the portal is locked.
- The form is the same 6-step / 23-field structure as the existing HTML intake, rebuilt
  in React using the command-center design tokens (Poppins/Inter, green accent,
  light/dark), with autosave per step.
- File-upload fields upload to storage AND keep the Drive-link field.
- On submit, the submission appears in an admin Onboarding tab for review.
- The admin Onboarding detail view also carries the full 6-phase / 37-task ops checklist
  (ported from the old plan) so Jake tracks his fulfilment work per client.

## Non-goals (deferred, explicitly out of scope for this build)

- The standalone public "real website" version of the form. Separate later job.
- Auto-emailing the magic link. Built as a pluggable step; for now the app generates the
  link and Jake copies/sends it himself.
- GoHighLevel automation / pipeline sync. The old plan synced phase completion to a GHL
  opportunity stage; that is dropped here. Checklist tasks that mention GHL/mobile-app
  setup remain as manual to-do items Jake ticks, not app integrations.
- The kickoff-booking calendar. The old form redirected to a booking widget on submit;
  here, submit simply returns the client to a "submitted, we'll be in touch" state.
- Broader "auto-do processes based on their answers" automation. Answers are stored as
  structured JSONB so this is possible later, but no automation ships now.

## Approach

In-app, two screens for the admin and one for the client, backed by three Supabase
tables and a storage bucket, wired through Cloudflare functions. Reuses the existing
`tenants` creation API and the existing client session/auth.

### Data model (Supabase, new migration)

All keyed to `tenant_id` (FK to existing `tenants`).

1. `onboarding_submissions`
   - `tenant_id` (uuid, pk/unique — one submission per client)
   - `status` text: `invited` | `in_progress` | `submitted`
   - `answers` jsonb — the 23 form fields (see Field map below)
   - `submitted_at` timestamptz nullable
   - `created_at`, `updated_at` timestamptz
   - JSONB chosen so the form can evolve and feed later automation without migrations.

2. `onboarding_progress` (the ops checklist state — mirrors the old `onboarding.json`)
   - `tenant_id` (uuid, pk/unique)
   - `done` text[] — completed task IDs
   - `skipped_optional` text[] — optional task IDs marked N/A
   - `phase_done_at` jsonb — `{ "1": "2026-06-22", ... }`
   - `inline_values` jsonb — values from inline fields (budget, offer+CTA, fathom link).
     In the old app these wrote to vault Profile.md/Memory.md; command-center has no
     vault, so they persist here.
   - `updated_at` timestamptz

3. `client_invites` (magic-link tokens)
   - `id` uuid pk
   - `tenant_id` uuid FK
   - `token_hash` text — store a hash, never the raw token
   - `owner_email` text — who the link is for
   - `expires_at` timestamptz
   - `consumed_at` timestamptz nullable
   - `created_at` timestamptz

Storage: a private bucket `onboarding-uploads`, objects pathed `tenant_id/<field>/<filename>`.
Admin-download only; client can write to their own tenant path during onboarding.

### Backend (Cloudflare functions under `functions/api/`)

Admin (admin-session gated):
- `POST /api/admin/onboarding/invite` — body `{ name, ownerEmail, niche? }`. Creates the
  bare tenant (reusing the existing `POST /api/admin/clients` logic), seeds an
  `onboarding_submissions` row with status `invited`, mints a `client_invites` token,
  returns `{ tenantId, slug, magicLink }`. `magicLink` is the copy/send URL.
- `GET /api/admin/onboarding` — list of clients in onboarding with status + dates.
- `GET /api/admin/onboarding/:tenantId` — submission answers + file URLs + checklist state.
- `POST /api/admin/onboarding/:tenantId/checklist` — toggle a task / set inline value /
  stamp a phase complete.

Client (invite or client-session gated):
- `POST /api/onboarding/redeem` — body `{ token }`. Validates the (hashed) token, not
  expired, not consumed; establishes a client session for that tenant; marks
  `consumed_at`; returns the current draft.
- `POST /api/onboarding/save` — autosave a step's answers (sets status `in_progress`).
- `POST /api/onboarding/upload` — upload a file to the tenant's storage path; returns the
  stored reference to put in `answers`.
- `POST /api/onboarding/submit` — validate required fields, set status `submitted` +
  `submitted_at`. (Pluggable hook here for the future "notify Jake" / auto-email step.)

### Frontend

Client — Onboarding form (`/onboarding`):
- 6-step wizard, React, command-center tokens. Steps and fields per the Field map below.
- Reuses existing `ui/` components (Button, Panel, Feedback) and the AdminClientDetail
  input/label pattern. Progress segments, Back/Continue, Submit on step 6.
- Autosaves each step via `POST /api/onboarding/save`. Files via `POST /api/onboarding/upload`.
- Submit shows a calm "submission received, we'll be in touch" state (no calendar redirect).

Client — Gate:
- In the portal shell / `ProtectedRoute`, if the signed-in owner's tenant has an
  onboarding status that is not `submitted`, redirect to `/onboarding` and block the rest
  of the portal routes. Once submitted, the gate lifts and the normal portal shows.

Admin — Onboarding tab:
- New item in `ADMIN_NAV` (`/admin/onboarding`), `ClipboardList` icon (lucide, matches the existing nav icon set).
- `AdminOnboarding.tsx`: list of clients with a status pill (Invited / In progress /
  Submitted) + date. "New onboarding" action → name + owner email → calls invite endpoint
  → shows a Copy-link button with the magic link.
- `AdminOnboardingDetail.tsx` (`/admin/onboarding/:tenantId`): two panels.
  - Submission panel: the 23 answers, read-only, with download buttons for uploaded files
    and the Drive link.
  - Checklist panel: the ported 6-phase / 37-task plan with task toggles, optional-task
    skip, inline fields (budget, offer+CTA, fathom link), and phase-complete stamps.

### Porting the checklist

Move `ONBOARDING_PLAN` and its helper types/functions from `app/src/lib/onboardingPlan.ts`
into a command-center lib (e.g. `command-center/app/src/lib/onboardingPlan.ts`), verbatim
in structure. The plan text references GHL/mobile/vault; that copy stays (it documents
Jake's manual steps). What changes: persistence goes to `onboarding_progress` in Supabase
instead of `onboarding.json`, and inline-field writes go to `inline_values` instead of the
vault. No GHL pipeline sync.

## Field map (23 fields → `answers` JSONB keys)

Step 1 — Business identity: `full_name`*, `legal_business`*, `ein`*
Step 2 — Contact: `street`, `city`, `state`, `country`, `postal`, `phone`*, `email`*
Step 3 — Customer lists: `past_customers`* (file), `current_customers` (file, optional)
Step 4 — Web & assets: `assets_url` (Drive), `facebook`*, `website`
Step 5 — Service: `cities`*, `services`*, `notify` (sms|email|both, default both)
Step 6 — Last things: `faqs`, `timezone`*, `offers`, `notes`
(* = required, matching the existing HTML form. EIN required per Jake's prior change.)

File fields store `{ filename, size, storagePath }` references in `answers`, not the bytes.

## Build sequencing

Stage 1 — the intake loop:
- Migration: `onboarding_submissions` + `client_invites` + storage bucket.
- Invite endpoint + redeem endpoint + the gate.
- The 6-step React form with autosave + uploads + submit.
- Admin Onboarding list + submission review panel.
- Outcome: Jake creates a client, sends the link, the client fills it out, Jake sees it.

Stage 2 — the ops checklist:
- Migration: `onboarding_progress`.
- Port `ONBOARDING_PLAN` into command-center.
- Checklist panel in the admin detail view: toggles, optional skips, inline fields,
  phase stamps; persistence to `onboarding_progress`.

## Risks / decisions to confirm during build

- Auth path for the magic link: redeem creates a real client (owner) session. Confirm it
  reuses the existing staff/owner session cookie mechanism rather than a parallel one.
- Storage access control: client writes only to their own tenant path; admin reads all.
  Enforce via signed upload URLs + RLS on the bucket.
- The gate must not lock out clients who finished onboarding before this feature shipped
  (e.g. Willis). Treat a missing `onboarding_submissions` row as "not in onboarding" =
  full portal access; only an explicit non-`submitted` row gates.

## Design system anchors

Tokens from `command-center/app/DESIGN.md` / `src/index.css`: brand `#4dbb83`, bg
`#f8fafc`, surface `#ffffff`, ink `#0f172a`, Poppins (display 600) + Inter (body), green
accent never as a large wash, tabular figures for numbers, light/dark via `data-theme`.
The form must read as part of the product, not a bolted-on intake.
