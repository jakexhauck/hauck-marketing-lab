# Connections — Paid Ads (Sales) · `/sales/paid-ads`

The lead-first worklist over the GHL **Paid Ad's Pipeline** (`uz0fFxCgiwdXbg4Zmwkc`).
Ships **demo-complete but not connected**: real sessions show the empty/not-connected
state, and every terminal action is gated (`GATED_NOTE` toast) until the backend exists.

Status key: ❌ not wired · ⚠️ partial · ✅ live

## Data source(s)
- ❌ **GHL Paid Ad's Pipeline opportunities** — the lead list + each lead's stage. Read
  opportunities in pipeline `uz0fFxCgiwdXbg4Zmwkc`, map `pipelineStageId` → `StageKey`
  (the 10 real stages live in `src/lib/paidAdsPipeline.ts` → `STAGE_META.ghlName`).
- ❌ **GHL conversations** — the SMS thread shown in the lead drawer (same thread the
  Unified Inbox / Estimate Forms read; never a copy).
- ❌ **Meta ad attribution** — the "which ad" badge (`adName` + platform). GHL does not
  natively record the source ad; needs a Meta Lead-Ads → GHL webhook that stamps an
  `ad_id`/`ad_name` custom field (shared problem with the marketing Paid Ads area, F4).

## AI
- None for v1. (A future "draft the next text" helper would be server-side via a Pages
  Function, never client-side.)

## Backend endpoints
- ❌ `GET /api/sales/paid-ads/leads` — opportunities in the paid-ads pipeline + their
  stage + latest message preview. Could extend the shared leads fetch with a pipeline
  filter rather than a new endpoint.
- ❌ `POST /api/sales/paid-ads/:id/book-call` — create the intro-call appointment + fire
  the confirmation SMS (moves the opp to "Intro Call Waiting Confirmation").
- ❌ `POST /api/sales/paid-ads/:id/confirm` — mark intro call confirmed → move into the
  Sales Pipeline @ Intro Call Confirmed (hands off to the Intro Calls page).
- ❌ `POST /api/sales/paid-ads/:id/stage` — off-ramp moves (No answer / Not qualified /
  No confirmation / Follow up - not ready).

## Auth / identity
- ⚠️ Session mode (live vs test) + the per-tenant GHL location token, injected server-side
  (same pattern as the rest of the client app). Not specific to this page.

## Secrets / env vars
- GHL location API token / PIT (exists for Willis) — reused.
- Meta system-user token + `meta_ad_account_id` (exists in the marketing Ads area) — only
  needed for the "which ad" badge.

## Webhooks
- ❌ Meta Lead-Ads → GHL (stamps the source ad).
- ❌ GHL appointment-confirmation webhook → flips "awaiting confirm" to "confirmed" (the
  existing call-confirmation workflow pattern).

## Persistence
- None beyond GHL (the pipeline is the source of truth).

## Per-action gating (what turns each on)
- **Call now** → click-to-call / Call Console (the telephony Route 1 work).
- **Book intro call** → `book-call` endpoint + GHL calendar + confirm SMS.
- **Confirm call** → `confirm` endpoint (pipeline move + Intro Calls handoff).
- **Other (off-ramps)** → `stage` endpoint.
- **Send (composer)** → GHL conversations send.
