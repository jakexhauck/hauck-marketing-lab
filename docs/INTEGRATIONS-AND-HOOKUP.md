# Hauck Marketing Lab — Master Hook-Up Guide

Every integration, login, secret, and data feed across the whole repo, in one place, with step-by-step checklists for each. Updated 2026-07-01.

## How to read this

- **Status legend:** ✅ live · ⚠️ partial · ❌ not wired · 🔜 planned.
- Each item lists: what it is, where it lives in code, what value you need, where that value comes from, and a checklist to wire it.
- The repo holds **eight separate apps**. Most of the "software" is the Command Center (the client app). Start there.
- Every secret file is gitignored and lives only on your machine. Placing them is in Part 6.

## The apps at a glance

| App | Folder | Hosted on | Live URL | Purpose |
|---|---|---|---|---|
| Command Center (clients) | `command-center/app` | Cloudflare Pages `hauck-command-center` | app.hauckmarketing.com | The client-facing product |
| Internal hub | `intranet` | Cloudflare Pages `hauck-internal` | internal.hauckmarketing.com | Agency SOPs / ops |
| Blueprint | `blueprint` | Cloudflare Pages | blueprint.hauckmarketing.com | Architecture map (password-gated) |
| Marketing site | `Hauck Marketing Website` | Vercel | hauckmarketing.com | Public website |
| Desktop app | `app` (Tauri/Rust) | Local install | n/a | Your own marketing lab / creative studio |
| GHL CLI | `gohighlevel-cli` | Local (Python) | n/a | Scripting GoHighLevel |
| Lead scraper | `lead-scraper` | Local (Python) | n/a | Prospecting |
| Media buying config | `media-buying` | Local files | n/a | Per-client ad config |

---

# Part 0 — Master accounts (everything depends on these)

Before wiring anything, confirm you can log into each console. These are the sources of every credential below.

- [ ] **Cloudflare** (hosts 3 of the 4 web apps + all secrets). dash.cloudflare.com
- [ ] **Supabase** (the one shared database). Project ref `aroapsjifblscheshmst` at supabase.com
- [ ] **GoHighLevel** (the CRM backend behind the whole client product). app.gohighlevel.com
- [ ] **Google Cloud Console** (OAuth clients, Drive/Calendar/Places APIs). console.cloud.google.com
- [ ] **Meta Business** (ad insights + attribution). business.facebook.com
- [ ] **GitHub** (`jakexhauck/hauck-marketing-lab`, the Windows↔Mac sync + Build Lab source). github.com
- [ ] **Vercel** (marketing site only). vercel.com
- [ ] **Namecheap** (DNS for hauckmarketing.com — NOT Cloudflare DNS). namecheap.com
- [ ] **Anthropic** (Claude API key, for the planned AI features). console.anthropic.com
- [ ] **Replicate** and **Google AI Studio** (image generation in the desktop app only).

---

# Part 1 — Command Center (the main client app)

Cloudflare Pages project `hauck-command-center`, served at **app.hauckmarketing.com**. React/Vite front end + Cloudflare Pages Functions (`/api/*`) + Supabase + GoHighLevel.

## 1.1 All environment variables

Set these in **Cloudflare → Pages → hauck-command-center → Settings → Variables and Secrets**. Local copies go in `command-center/app/.env.local` (gitignored). Template is `.env.example`.

### Front-end (safe to expose, prefixed `VITE_`)

| Var | Status | What / where from |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API → anon public key |

### Server-side (secrets, never exposed)

| Var | Status | What / where from |
|---|---|---|
| `APP_PASSWORD` | ✅ | Owner login password. You choose it. |
| `TEST_APP_PASSWORD` | ✅ | Test-account password. You choose it. |
| `SESSION_SECRET` | ✅ | 32+ char random string, signs session cookies. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API → service_role (admin, bypasses RLS) |
| `SUPABASE_JWKS_URL` | ✅ | `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `WEBHOOK_SECRET` | ✅ | 32-char random string. Same value you paste into GHL webhook URLs. |
| `GHL_LOCATION_ID` | ✅ | Willis sub-account ID (`OznT3yyuwK3dqVXDsCaD`). GHL → Settings → Business Profile. |
| `GHL_TOKEN` | ✅ | Willis Private Integration Token (`pit-...`). GHL → Settings → Private Integrations. |
| `TEST_GHL_LOCATION_ID` | ⚠️ | Was the test sub-account (`r0WfsA12qpBv7M185V3v`). **That location became Made Better Landscaping Co's own sub-account on 2026-08-09**, so this env var now points at a live client. Only the `TEST_APP_PASSWORD` login reads it. |
| `TEST_GHL_TOKEN` | ⚠️ | Same location, same caveat. |
| `GHL_COMPANY_ID` | ⚠️ | Agency company ID, only for auto-provisioning staff. GHL company settings. |
| `VAPID_PUBLIC_KEY` | ✅ | Web-push public key. Generate: `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | ✅ | Web-push private key (same command). |
| `GITHUB_TOKEN` | ✅ | GitHub PAT, `contents:read` on the repo. Powers the admin Build Lab. |
| `GITHUB_REPO` | ✅ | Default `jakexhauck/hauck-marketing-lab`. |
| `GOOGLE_OAUTH_CLIENT_ID` | ❌ | Web OAuth client for the Assets/Drive feature. Google Cloud Console. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ❌ | Same client's secret. |
| `GOOGLE_OAUTH_REDIRECT` | ❌ | `https://app.hauckmarketing.com/api/admin/assets/oauth/callback` |
| `ANTHROPIC_API_KEY` | 🔜 | For AI copy/caption drafting (Campaigns + Social). Not added yet. console.anthropic.com. |
| `TENANT_SLUG` / `TEST_TENANT_SLUG` | ✅ | Tenant routing. Defaults `live-client` / `test-account`. |
| `TENANT_TIMEZONE` | ✅ | IANA zone. Default `America/Chicago`. |

Local-only (keep in `.env.local`, never deployed):

| Var | What / where from |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens. Powers `npm run db:migrate`. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → permission "Account: Cloudflare Pages: Edit". Powers `npm run cf`. |
| `CLOUDFLARE_ACCOUNT_ID` | Only if your token sees more than one account. |
| `PAGES_HOSTNAME` | Default `hauck-dashboard.pages.dev`. |

## 1.2 First-time deploy checklist

1. [ ] Create the Supabase project (or confirm access to `aroapsjifblscheshmst`).
2. [ ] Copy `command-center/app/.env.example` → `.env.local`, fill `SUPABASE_ACCESS_TOKEN` + `CLOUDFLARE_API_TOKEN`.
3. [ ] Run the database migrations: from `command-center/app`, `npm run db:migrate`. This applies migrations 0001–0021 in order (never use the Supabase SQL editor).
4. [ ] In Cloudflare, create/confirm the `hauck-command-center` Pages project pointed at this repo, build dir `dist`, build command `pnpm build`, `NODE_VERSION=20`, `PNPM_VERSION=10`.
5. [ ] Set every server-side var from the table above (use `npm run cf env:set KEY value --secret` or the dashboard).
6. [ ] Confirm the custom domain `app.hauckmarketing.com` is attached (DNS CNAME at Namecheap → the pages.dev target).
7. [ ] Deploy (push to main triggers it) and watch: `npm run cf deploy:watch`.
8. [ ] Smoke-test the live URL: owner login with `APP_PASSWORD`, then a page that reads GHL (e.g. Inbox) to confirm the token works.

## 1.3 GoHighLevel — the CRM behind everything

Most of the client app reads live from GHL on each page load (5-min cache). Pipelines, stages, leads, contacts, conversations, appointments, and invoices all sync automatically with no webhook. The token scope must cover: `opportunities.read/write`, `contacts.read/write`, `conversations.read/write`, `appointments.read`, `invoices.read`.

### Real-time webhooks (makes events instant + fires phone push)

Without these, per-record events arrive on next refresh instead of instantly. Set up **one GHL workflow per event** inside the client's sub-account. Full detail in `command-center/app/docs/connections/ghl-instant-sync.md`.

Webhook URL (same for all): `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`

- [ ] New Workflow → trigger **Opportunity Created** → Webhook action (POST), custom data `type=OpportunityCreate`, `locationId={{location.id}}`, `opportunityId={{opportunity.id}}`, `contactId={{contact.id}}`, `assignedTo={{opportunity.assigned_to}}`.
- [ ] **Pipeline Stage Changed** → `type=OpportunityStageUpdate` (same four fields).
- [ ] **Opportunity Status Changed** → `type=OpportunityStatusUpdate` (+ `status={{opportunity.status}}`).
- [ ] **Customer Booked Appointment** → `type=AppointmentCreate`, `locationId`, `contactId`.
- [ ] **Customer Replied** → `type=InboundMessage`, `locationId`, `contactId`.
- [ ] **Invoice Paid** (optional) → `type=InvoicePaid`, `locationId`, `contactId`.

Rules: `locationId` is mandatory on every payload (routing is by location, never hardcoded); `type` strings are case-sensitive; leave `id` out.

- [ ] **Verify:** move a test opportunity's stage in GHL → a "Stage changed" row appears in the app activity feed within ~2s. Watch raw hits in Cloudflare → hauck-command-center → latest deployment → real-time logs (`[webhook] ...`).

## 1.4 Web push (phone notifications) ✅

- [ ] Keys generated (`npx web-push generate-vapid-keys`) and both `VAPID_*` vars set in Cloudflare.
- [ ] Test: create a lead in the client's GHL → phone push arrives in 1–2s and deep-links to the lead.

## 1.5 Client Assets / Google Drive ❌ (endpoints exist, OAuth not wired)

The Assets page (`/company/documents`) shows a "Connect your Google Drive" state in real sessions. Scope is `drive.file` (non-sensitive, no Google verification needed). Detail in `docs/connections/assets.md`.

- [ ] Google Cloud Console → enable **Drive API** + **Picker API**.
- [ ] Configure the OAuth consent screen with the `drive.file` scope.
- [ ] Create a **Web** OAuth 2.0 client. Authorized redirect URI: `https://app.hauckmarketing.com/api/admin/assets/oauth/callback`. Add the JS origin.
- [ ] Create an API key for the Picker (`GOOGLE_PICKER_API_KEY`).
- [ ] Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT` in Cloudflare.
- [ ] Build the remaining file endpoints (`/api/assets/files|upload|folder|download`) — start/callback already exist.
- [ ] Confirm the `drive_connection` + `client_folders` tables (migration 0015) are present.

## 1.6 Admin Build Lab / GitHub ✅

Pulls `.md` plans from `vault/Plans/Builds/` in the repo.

- [ ] `GITHUB_TOKEN` (PAT, `contents:read`) and `GITHUB_REPO` set in Cloudflare. Nothing else to do.

## 1.7 AI features (Anthropic Claude) 🔜

Planned for Campaigns ("Write it for me"), Social (caption/idea generation), and v2 suggested replies. Server-side only, never in the browser bundle.

- [ ] Get an API key from console.anthropic.com.
- [ ] Add `ANTHROPIC_API_KEY` to Cloudflare.
- [ ] Build the generate endpoints (`/api/campaigns/generate`, `/api/social/generate`). Voice profile = vault `Profile.md`/`Memory.md` + copywriter skill rules; prompt-cache the profile. Default model Opus 4.8 (single) / Sonnet 5 (batch).

## 1.8 Demo/sample surfaces still to connect to real data

Every one of these shows sample data in `?demo=1` and an empty/not-connected state (never fabricated data) in a real session. Each per-feature spec lives in `command-center/app/docs/connections/`.

| Feature | Route | Status | Real data source to wire | Spec |
|---|---|---|---|---|
| **Revenue / Ledger** | `/billing` | ⚠️ 5 sections sample | Backend aggregates: 12-mo trend, MoM %, YTD, avg invoice, top customers. Set `SHOW_UNWIRED_SECTIONS=false` after. | — |
| **Calendar: Appointments** | `/calendar` | ✅ live | GHL calendar (only live stream). | calendar.md |
| **Calendar: Jobs** | `/calendar` | ⚠️ | GHL Sales Pipeline (`6o9Gx6e0TXRFJdln5d01`) at Job Booked + Completed. | jobs.md |
| **Calendar: Social + Campaigns** | `/calendar` | ❌ | Turn on with the Social + Campaigns backends below. | calendar.md |
| **Paid Ads (marketing)** | `/marketing/paid-ads` | ❌ | Meta Ads API insights + GHL Paid Ad's Pipeline. | — |
| **Leads** (Paid Ads + Forms + Chat, merged) | `/sales/leads` | ❌ | GHL Paid Ad's + Organic pipelines + conversations + follow-up automation state. One page now; see 1.9. Supersedes the 3 rows below. | leads.md |
| ↳ Paid Ads (sales worklist) | `/sales/paid-ads` | ❌ | GHL Paid Ad's Pipeline (`uz0fFxCgiwdXbg4Zmwkc`) + conversations + Meta attribution. Now the Paid Ads tab of Leads (route still resolves). | paid-ads-sales.md |
| ↳ Estimate Forms | `/sales/forms` | ❌ | GHL Organic Pipeline, `source="Website Form"` + conversations + stage writes. Now the Estimate Forms tab of Leads. | estimate-forms.md |
| ↳ Chat Widget | `/sales/chat` | ❌ | Same as Forms, `source="chat widget"`. Now the Chat Widget tab of Leads. | chat-widget.md |
| **Jobs** | `/sales/jobs` | ❌ | GHL Sales Pipeline at Job Booked/Completed + appointment join + payment status. | jobs.md |
| **Unified Inbox** | `/conversations` | ✅/⚠️ | Live over GHL; origin is heuristic (`functions/lib/origin.ts`) until UTM attribution wired. | unified-inbox.md |
| **Social Media** | `/marketing/social` | ❌ | GHL Social Planner (connect FB/IG/GBP) + posts + analytics + AI captions. | social.md |
| **Campaigns (SMS/email)** | `/marketing/campaigns` | ❌ | GHL contacts + bulk SMS (A2P 10DLC) + email (verified domain) + stats + AI drafting. | campaigns.md |
| **Reviews** | `/marketing/reviews` | ⚠️ | Live review candidates over GHL; ratings/trend/list need Google Business Profile. | — |
| **Website** | `/marketing/website` | ❌ | Google Analytics + site CMS. | — |
| **Automations** | `/automations` | ❌ | GHL automations/sequences API (read-only sample banner today). | — |
| **Contacts** | `/contacts` | ✅ | Live over GHL; lifecycle stage chips deferred (needs a Willis tag→stage map). | — |

Two cross-cutting dependencies these share:
- [ ] **A2P 10DLC** texting number registered in GHL (needed before any SMS send: Campaigns, Forms, Chat).
- [ ] **Verified email sending domain** in GHL (needed before any email send).

## 1.9 Leads (the merged Sales worklist) — finish checklist ❌

The live page is **shipped** at `/sales/leads` (Paid Ads + Estimate Forms + Chat Widget as three in-line tabs; Paid Ads + Estimate Forms show a per-lead follow-up tracker). It is demo-complete: a real client sees the empty/not-connected state and every action is gated. Everything below is what turns it into real, populated data for Willis. Full per-item spec: `command-center/app/docs/connections/leads.md`.

Reads through `useLeadsHub()` → `buildLeadsHub()` in `src/lib/leadsHub.ts`. Keep that return shape when wiring; nothing downstream changes.

### A. Confirm the real follow-up sequences (do this first — it's the only truly missing info)

The tracker steps in `src/lib/leadsHub.ts` (`SEQ.ad`, `SEQ.form`) are **PLACEHOLDERS**. Pull the real steps from the live GHL workflows and update `SEQ`:

- [ ] **Paid Ads** sequence — the SMS nurture on lead-form leads (channel + label + delay per step).
- [ ] **Estimate Forms** sequence — the auto email + SMS on form submit (channel + label + delay per step).
- [ ] **Chat Widget** — confirm whether it has its own sequence; if so add `SEQ.chat`, else it stays a plain bucket.
- [ ] Fast way to read them: `ghl.ps1 opportunities pipelines` (stages) + the workflow list in GHL (steps). CLI creds go in `gohighlevel-cli/.env` (Part 3.6).

### B. Data sources to wire (GoHighLevel)

- [ ] **Paid Ad's Pipeline** (`uz0fFxCgiwdXbg4Zmwkc`) → the Paid Ads tab (map `pipelineStageId` → status via `paidAdsPipeline.ts`).
- [ ] **Organic Pipeline** (`source="Website Form"` / `"chat widget"`) → the Estimate Forms + Chat tabs.
- [ ] **Conversations** (SMS + Email per contact) → the SMS/Email toggle + composer (same thread the Unified Inbox reads; never a copy).
- [ ] **Follow-up automation state** (workflow enrolment + step history per contact) → the follow-up tracker's "sent / replied / outcome". This is the piece with no clean GHL source today; until it lands the tracker runs on the demo `fu` field.

### C. Backend endpoints to build (Pages Functions)

- [ ] `GET /api/sales/leads` — merged leads across both pipelines + source + status + latest-message preview + follow-up state.
- [ ] `GET /api/sales/leads/:contactId/conversation` — SMS + Email threads.
- [ ] `POST /api/sales/leads/:id/send` — send an SMS/Email reply into the GHL conversation.
- [ ] `POST /api/sales/leads/:id/book-call` — book the intro call, **pause the nurture workflow**, fire the confirm text (Paid Ads).
- [ ] `POST /api/sales/leads/:id/schedule` — schedule a callback (Forms/Chat), pause follow-ups until the callback time.
- [ ] `POST /api/sales/leads/:id/outcome` — Not-a-fit / off-ramp stage writes.

### D. Automations to honour (the UI already promises these)

- [ ] A **reply pauses** the auto follow-ups (lead → "Needs a human").
- [ ] **Booking pauses** the nurture so the two automations never collide, then fires the confirm text.
- [ ] **Confirmation is automatic** — the confirm link logs it + flips the Google Calendar title (existing webhook, see `gohighlevel-cli/docs/duplicate-intro-call-funnel.md`). It's a status in the tracker, not a button.

### E. Secrets / webhooks (mostly reuse what exists)

- [ ] `GHL_TOKEN` scope must cover Conversations (send) + Opportunities (stage write) + **Workflows** (pause/enrol) — the workflow scope is the new one to confirm.
- [ ] Reuse the Part 1.3 webhooks: **Customer Replied** (`InboundMessage`) refreshes a thread; **Pipeline Stage Changed** moves a lead; the appointment-confirmation webhook flips awaiting→confirmed.
- [ ] Meta Lead-Ads → GHL webhook stamps the source ad on Paid Ads leads (shared with the marketing Paid Ads area).

### F. Flip the gates

- [ ] Lead list + threads → the leads + conversations feeds.
- [ ] Send reply, Call now, Book intro call, Schedule, Book visit, Not a fit → their endpoints above. Until then each shows the gated toast.

---

# Part 2 — GoHighLevel per-client go-live (Willis Windows)

The snapshot is loaded but nothing runs yet. Full task sheet: `docs/build-plans/willis-windows-ghl-setup.md`. Ordered by "will the funnel fire at all."

### A. Blockers

- [ ] **Publish the workflows.** 32 of 38 are draft. Publish each Intro Call / 2nd Chance / Review / Lead Form / Chat Widget / Missed-Call Text-Back / Conversions API / DR workflow you intend to use.
- [ ] **Dedupe first.** The snapshot copied duplicates (Intro Call x4, 2nd Chance x3, Lead Form/Website Form/Chat Widget/OPT OUT x2 each). Delete extras before publishing or contacts get double-messaged.
- [ ] **Set `Location API Token` custom value** (blank now). Both "flip Google title to Confirmed" webhooks read `Bearer {{custom_values.location_api_token}}`. Create an all-scopes Willis PIT (Settings → Private Integrations) and paste it in.

### B. Fill blank custom values (Settings → Custom Values)

- [ ] From Name, From Email, User First Name (Joshua), User Personal Phone Number, Internal Notification From Name/Email/SMS, To Custom Email, To Custom Number, Intro Call (+ 2nd Chance) Confirmation Website, Calendar Link, FB Calendar Link, review request link, Review Funnel Link, GMB Google Reviews Link, Database Reactivation Offer + Relevance, Custom Contest Prize.

### C. Assign a user

- [ ] The Intro Call and Intro Call 2nd Chance calendars are round-robin with nobody assigned. Add Josh (and any setter) as a GHL user and assign to both calendars, or bookings can't route.

### D. Connect integrations (not in any snapshot)

- [ ] **Google Calendar OAuth** (two-way sync — pushes the "Confirmed" title flip to the real event).
- [ ] **Phone / LC Phone** — confirm 313-766-2171 is provisioned in this sub and A2P/10DLC registered, or no SMS sends.
- [ ] **Email sending domain / from-address** verified.
- [ ] **Google Business Profile** connected (review link + GMB flow).
- [ ] **Meta / Conversions API** dataset/pixel wired before publishing the Conversions API workflows.

### E. Verify (one live pass)

- [ ] Book a test Intro Call → confirm via link → watch the Google title flip to Confirmed.
- [ ] Submit a test Lead Form + Chat Widget lead → notification + follow-up fires once (proves dedupe).
- [ ] Re-run `python tools/intro_call_funnel.py audit --location OznT3yyuwK3dqVXDsCaD --pit <PIT>` → 0 issues.

---

# Part 3 — Satellite apps

## 3.1 Desktop app (`app/`, Tauri + Rust)

Your own marketing lab. All secrets are gitignored Rust files; `build.rs` writes blank stubs on a fresh checkout so it compiles. Runtime API keys (Replicate/Gemini/GHL) are set in-app on the Settings page, stored in the OS config dir.

Secret files to place per machine:

- [ ] `app/src-tauri/src/google_oauth_secrets.rs` — Google **Desktop** OAuth client ID + secret (Calendar + Drive + Sheets via PKCE). Google Cloud Console → Credentials → Desktop client.
- [ ] `app/src-tauri/src/meta_oauth_secrets.rs` — Meta App ID, App Secret, System User token (ad insights). Meta Business → Settings → System Users.
- [ ] `app/src-tauri/src/supabase_secrets.rs` — Supabase URL + service role key (mobile-app tenant provisioning). Currently blank; needed only for provisioning.
- [ ] **Claude CLI** installed and logged in on PATH (chat streams via `claude -p`). claude.ai/code.

In-app runtime keys (Settings page, not files):

- [ ] Replicate API token (replicate.com) — image gen.
- [ ] Gemini API key (aistudio.google.com) — legacy creative path.
- [ ] GHL PIT + location (Settings → Private Integrations) — contacts/opportunities/calendars.
- [ ] Per-client Meta creds in `data/<slug>/credentials.yaml` (access_token, ad_account_id, optional pixel/business id).

## 3.2 Internal hub (`intranet/`)

Cloudflare Pages `hauck-internal` → internal.hauckmarketing.com. Reuses the Command Center Supabase + login. Local secrets in `intranet/.dev.vars` (gitignored; template `.dev.vars.example`).

- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same project as Command Center).
- [ ] `SESSION_SECRET` — **must match** Command Center's value so the shared admin login works.
- [ ] `GOOGLE_OAUTH_CLIENT_ID/SECRET` (a separate **Web** client; redirect `https://internal.hauckmarketing.com/api/drive/oauth/callback`) — only for the Drive feature.
- [ ] Set all of the above as Cloudflare Pages secrets on `hauck-internal`.
- [ ] Deploy: `cd intranet && npm run deploy`.

## 3.3 Blueprint (`blueprint/`)

Cloudflare Pages → blueprint.hauckmarketing.com. Static site + a password middleware.

- [ ] Set `BLUEPRINT_PASSWORD` as a Cloudflare Pages secret (fail-closed: returns 503 if unset). Any username works; only the password is checked.

## 3.4 Marketing website (`Hauck Marketing Website/`)

Vercel, deploys from main. No secrets.

- [ ] Confirm `vercel.json` rewrites keep `/privacy` and `/terms` working (the Google Limited Use disclosure lives on `/privacy`).

## 3.5 Lead scraper (`lead-scraper/`, Python)

- [ ] `credentials.json` — Google **service account** JSON key (Sheets export). Google Cloud → Service Accounts → JSON key. Gitignored; place per machine. Share the target Sheet with the service account email.
- [ ] **Rotate + move the Google Places API key.** It is currently hardcoded in the tracked file `scrape.py` (CONFIG dict). Move it to an env var / gitignored config and issue a new key. (See Part 7.)
- [ ] Meta Ad Library detection is a broken placeholder — needs the official API swap before relying on it.

## 3.6 GoHighLevel CLI (`gohighlevel-cli/`, Python)

Local secrets in `gohighlevel-cli/.env` (gitignored; template `.env.example`). Run via `ghl.ps1` with `PYTHONUTF8=1`.

- [ ] `GHL_API_KEY` — Willis PIT (`pit-...`), sub-scoped. GHL → Private Integrations.
- [ ] `GHL_LOCATION_ID` — `OznT3yyuwK3dqVXDsCaD` (Willis). `r0WfsA12qpBv7M185V3v` is Made Better Landscaping Co's, not a test account, since 2026-08-09.
- [ ] `GHL_FIREBASE_TOKEN` — agency-wide internal-API refresh token (needed for workflow create/update; the public API is read-only). Get via the DevTools IndexedDB snippet in `gohighlevel-cli/README.md`.

## 3.7 Media buying (`media-buying/`)

- [ ] `data/clients.yaml` — per-client registry (Meta ad account ids like `act_4396590353913166`, Drive/Sheet URLs, folder maps). Edit to add clients; consumed by the desktop app.

---

# Part 4 — Infrastructure / deploy / DNS map

- **Cloudflare Pages projects:** `hauck-command-center` (app.hauckmarketing.com), `hauck-internal` (internal.hauckmarketing.com), blueprint (blueprint.hauckmarketing.com). All `compatibility_date = 2026-05-18`, `nodejs_compat`, build dir `dist`.
- **DNS:** hauckmarketing.com is at **Namecheap**, not Cloudflare. Custom subdomains for CF Pages via Namecheap CNAME → the pages.dev target (no nameserver move).
- **Supabase:** one project (`aroapsjifblscheshmst`) shared by Command Center + intranet. Migrations apply only via `npm run db:migrate` (Management API + ledger); never the SQL editor.
- **GitHub:** `jakexhauck/hauck-marketing-lab` (private) is the Windows↔Mac sync backbone and the Build Lab source. No GitHub Actions; web apps deploy via Cloudflare's Pages↔GitHub integration or manual `wrangler pages deploy`.
- **Vercel:** marketing site only.
- **Cron / background jobs / trigger.dev:** none wired yet. Noted as future for bulk sends and scheduled reports.
- **CF Pages login-503 gotcha:** if admin/staff login returns 503, CF Pages lost its Supabase server secrets — fix with `cf.mjs env:set` on both projects + redeploy, then verify a 401 (not 503).

Deploy commands:

- [ ] Command Center: push to main (auto), or `npm run cf deploy:watch` to follow.
- [ ] Intranet: `cd intranet && npm run deploy`.
- [ ] Blueprint: deploy via Cloudflare Pages (static).
- [ ] Website: push to main (Vercel auto).

---

# Part 5 — New machine setup (Mac ↔ Windows sync)

From `docs/NEW-MACHINE-SETUP.md`. `git pull` brings all app code, CLAUDE.md files, `.claude/settings.json`, and vendored skills. You install by hand:

- [ ] Plugins via Claude Code `/plugin` (marketplace `anthropics/claude-plugins-official`): `superpowers`, `rust-analyzer-lsp`. These live in global `~/.claude/plugins/` and do not travel with the repo.
- [ ] Place every gitignored secret file (Part 6).
- [ ] `.claude/settings.local.json` and `.claude/worktrees/` are intentionally not synced.

---

# Part 6 — Gitignored secret files to place per machine

None of these are in git. On a fresh checkout you must create each one, or that app runs in a stub/blank state.

| File | Holds | Get it from |
|---|---|---|
| `command-center/app/.env.local` | Command Center local env (Supabase + CF tokens) | Copy `.env.example`, fill values |
| `intranet/.dev.vars` | Supabase + SESSION_SECRET + Google OAuth | Copy `.dev.vars.example` |
| `gohighlevel-cli/.env` | GHL PIT + location + Firebase token | Copy `.env.example` |
| `lead-scraper/credentials.json` | Google service account key | Google Cloud → Service Accounts |
| `app/src-tauri/src/google_oauth_secrets.rs` | Google desktop OAuth client | Google Cloud → Desktop client |
| `app/src-tauri/src/meta_oauth_secrets.rs` | Meta app id/secret + system-user token | Meta Business → System Users |
| `app/src-tauri/src/supabase_secrets.rs` | Supabase URL + service role | Supabase → Settings → API |

Checklist:

- [ ] Every file above exists on this machine with real values.
- [ ] Cloudflare Pages secrets are set on all three CF projects (they are the production equivalent of `.env.local` / `.dev.vars`).

---

# Part 7 — Security follow-ups (do these)

Verified against git: the `*_secrets.rs`, `.env`, `.dev.vars`, `credentials.json`, and `.env.local` files are all **gitignored and not committed**. Good. The real exposures:

- [ ] **Rotate the Google Places API key** and remove it from `lead-scraper/scrape.py` — it is hardcoded in a **tracked** file (committed to git history). Move it to `credentials.json` or an env var and restrict the key to the Places API + your IP.
- [ ] **Rotate the lead-scraper service account key** as a precaution — an earlier note flags it was briefly in local git history.
- [ ] Confirm `GHL_TOKEN` scopes are the minimum needed (avoid all-scopes PITs where a read scope suffices), except the Willis `Location API Token` custom value which is intentionally all-scopes.
- [ ] Rotate `SESSION_SECRET` for production if it has ever been shared, and re-set it identically on both `hauck-command-center` and `hauck-internal`.

---

# Part 8 — Priority order (what to do first)

1. [ ] **Part 0** — confirm you can log into all master consoles.
2. [ ] **Part 7** — rotate the exposed Places key (fast, real risk).
3. [ ] **Part 2** — finish the Willis GHL go-live so the funnel actually fires (this is what makes the client product real, not demo).
4. [ ] **Part 1.3** — confirm the 6 GHL webhooks so events are instant.
5. [ ] **A2P 10DLC + email domain** in GHL — unblocks Campaigns, Forms, Chat sends.
6. [ ] **Part 1.5** — Google OAuth so Assets works (waiting on your Google Cloud setup).
7. [ ] **Part 1.9 (Leads)** — the highest-value sales surface: confirm the two follow-up sequences (1.9.A) then wire its feeds. Then **Part 1.8** — the rest of the demo surfaces, feature by feature (each has a spec in `docs/connections/`).
8. [ ] **Part 1.7** — add `ANTHROPIC_API_KEY` + build the AI generate endpoints when you want in-app copywriting.

---

*Sources: `command-center/app/docs/connections/*.md`, `docs/build-plans/willis-windows-ghl-setup.md`, `docs/NEW-MACHINE-SETUP.md`, `.env.example` / `.dev.vars.example` / `.env.example` templates, and a full code audit of every sub-project. Keep this file updated as feeds get wired.*
