# Campaigns — connections backlog

**Repurposed 2026-07-03 to a read-only "done-for-you" model.** Campaigns is no longer a tool the client operates. The agency runs every send; the client only views what we send and how it performs. All create/send affordances (the New campaign wizard, "Write it for me" AI, New list / New template buttons) and the Templates tab were removed. See `docs/build-plans/campaigns-read-only-repurpose.md`.

Status: ❌ not wired · ⚠️ partial · ✅ live.

## Phase A — SHIPPED (read-only repurpose + real Audiences)
- ✅ **Read-only UI** — no client-side create/send anywhere; Templates tab cut; empty states reworded to done-for-you ("We run your campaigns for you").
- ✅ **Audiences** — `GET /api/campaigns/audiences` (new) derives live segment counts from the client's own GHL contacts + opportunity history: All customers, New (added ≤60d), Repeat/VIP (3+ won jobs), Past (no activity in 12mo). By-tenant 15-min cache; `configError: "not_connected"` on an empty list. The two trade-specific demo segments (5-star jobs, "No A/C in 12mo") are demo-only (need review/service data we don't reliably have). Client shape in `src/lib/campaignsAudiences.ts`; hook `useCampaignsAudiences`.
- ✅ **Reactivation** — already live (`/api/campaigns/reactivation`, by-name).

## Phase B — TODO (agency campaign log → real Overview/List/Insights)
Overview, Campaigns list, and What's working still read demo constants (populated only under `?demo=1`; honest empty in a real session). Turn real via an agency-owned Supabase log:
- ❌ `client_campaigns` table (migration) — one row per send we run: channel, title/subject/body, audience label+size, status, scheduled/sent dates, result stats. RLS: client reads own tenant; agency (service role) writes.
- ❌ `GET /api/campaigns` — tenant-scoped list shaped for the surfaces (KPIs, Up next = scheduled, Recently sent = sent).
- ❌ Minimal admin form to log a send (we run the actual bulk send in the backend, then record it here). One form, not a CRUD suite.
- ❌ Wire `CampaignsOverview` / `CampaignsList` / `CampaignsInsights` to `/api/campaigns`.

## Out of scope (separate infrastructure track)
- Actual bulk SMS/email sending — needs a registered A2P 10DLC number + a verified email sending domain. We send in the backend; this section never sends.
- GHL live delivery/open/reply stats as a later enrichment layer, only if the API proves reachable.

---

## Original backlog (superseded by the read-only model above; kept for reference)

What the Campaigns section (SMS + email the client sends to their own customers) needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

## Data source — GoHighLevel (contacts + conversations + bulk send)
- ❌ **Customer list / contacts** — read GHL contacts; powers Audiences (sizes + membership) and who a campaign sends to.
- ❌ **Smart segments** — derive the demo audiences from real fields: All customers, Past customers (no job in 12mo), Repeat/VIP (3+ jobs), New customers (first job ≤60d), Recent 5★ jobs, "No A/C service in 12mo". Built from opportunity history + custom fields; resolve once GHL data is wired.
- ❌ **Send SMS** — GHL conversations / bulk-SMS; powers SMS campaigns. Requires a registered texting number (A2P 10DLC).
- ❌ **Send email** — GHL email campaigns / bulk-email; powers email campaigns. Requires a verified sending domain/address.
- ❌ **List campaigns** (sent / scheduled / draft) — powers the Campaigns list, Overview "Up next" / "Recently sent".
- ❌ **Delivery + engagement stats** (delivered, opens, clicks, replies; jobs booked via attribution) — powers What's working, the report dialog, and Overview KPIs.

## AI — Claude (server-side only, never client-side)
- ❌ **Message drafting in the client's voice** — the wizard "Write it for me" (SMS + email body, email subject). Suggested model: Opus 4.8 (single) / Sonnet 4.6 (batch). Voice = vault `Profile.md`/`Memory.md` + the `copywriter` skill rules; prompt-cache the voice profile.
- ❌ **Campaign ideas** — the Overview "Ideas for you" cards (seasonal / win-back / review), grounded in the audience + season.

## Backend endpoints to build (Pages Functions, the bridge)
- ❌ `/api/campaigns` — list campaigns (sent/scheduled/draft) + their stats.
- ❌ `/api/campaigns/audiences` — list segments + counts (+ a sample of members for the detail dialog).
- ❌ `/api/campaigns/send` — create + schedule/send a campaign (SMS or email) via GHL.
- ❌ `/api/campaigns/templates` — list/save reusable templates (see Persistence).
- ❌ `/api/campaigns/generate` — AI draft + ideas via Claude.

## Auth / identity
- ✅ Session model exists (live/test cookie). The Worker injects the active mode's GHL location + token per request — extend the same pattern to the campaigns endpoints.

## Secrets / env vars (Cloudflare Pages)
- ❌ `ANTHROPIC_API_KEY` — new, for AI (shared with the other sections once added).
- ✅ `GHL_LOCATION_ID` / `GHL_TOKEN` (+ `TEST_*`) — exist; confirm the token scope covers conversations / bulk SMS + email.
- ❌ Registered SMS sender (A2P 10DLC) + verified email sending domain — through GHL.

## Webhooks
- ⚠️ Optional: delivery / reply / opt-out callbacks to refresh stats without polling, and to honour STOP/unsubscribe.

## Persistence
- ❌ **Templates store** — reusable SMS/email templates (the Templates page). Decide: store in GHL vs our own Supabase table.
- ⚠️ Draft campaigns — only if drafts must persist before being pushed to GHL.

## Per-action gating (flip on when its connection lands)
- New campaign → Send → `/api/campaigns/send` + a registered sender (SMS) / verified domain (email). **Send stays disabled until then** (currently gated with the "turns on once connected" note).
- Write it for me → `/api/campaigns/generate` (AI).
- New list / New template → audiences + templates endpoints.
- Real numbers everywhere (KPIs, report, What's working) → list + stats endpoints.

## Also brings
- **Connect messaging onboarding** (register a texting number + verify an email sender, link the customer list) — build with this work; it's the front door, dead without the connections above. Do not ship a standalone dead "connect" button.
