# Hauck Marketing Lab — Hook-Up Runbook (in-depth, step by step)

The do-it version of `INTEGRATIONS-AND-HOOKUP.md`. Every step lists: **Goal**, **Do this** (exact clicks), **Value + source** where a secret is involved, and **Verify**. Work top to bottom. Phases 0–5 make the client product actually work; 6+ turn demo surfaces into live data.

Key IDs you will reuse:
- Supabase project ref: `aroapsjifblscheshmst`
- Willis (live) GHL location: `OznT3yyuwK3dqVXDsCaD`
- Test GHL location: `r0WfsA12qpBv7M185V3v`
- Paid Ad's Pipeline: `uz0fFxCgiwdXbg4Zmwkc`
- Sales Pipeline (jobs): `6o9Gx6e0TXRFJdln5d01`
- Webhook URL (all events): `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`
- Willis phone: 313-766-2171

---

## Phase 0 — Accounts and access

Goal: confirm you personally hold the keys to every console before wiring anything. If you can't log in, you can't finish a later step.

1. **Cloudflare.** Go to dash.cloudflare.com, sign in, confirm you can see the `hauck-command-center`, `hauck-internal`, and blueprint Pages projects. This hosts 3 of 4 web apps and every production secret.
2. **Supabase.** Go to supabase.com, open project `aroapsjifblscheshmst`. Confirm Settings → API loads. This is the one shared database.
3. **GoHighLevel.** Go to app.gohighlevel.com. Confirm you can open the Willis sub-account (`OznT3yyuwK3dqVXDsCaD`) and the agency view.
4. **Google Cloud Console.** Go to console.cloud.google.com. Confirm you can reach APIs & Services → Credentials (you'll create OAuth clients here).
5. **Meta Business.** Go to business.facebook.com. Confirm Settings → System Users loads (ad insights + attribution).
6. **GitHub.** Confirm access to `jakexhauck/hauck-marketing-lab` (private). This is the Windows↔Mac sync and the Build Lab source.
7. **Vercel + Namecheap.** Vercel hosts the marketing site only. Namecheap holds DNS for hauckmarketing.com (NOT Cloudflare DNS). Confirm both logins.
8. **Anthropic.** Go to console.anthropic.com, confirm you can create an API key (needed later in Phase 10).

Verify: you reached the credential/settings screen on each. Stop and fix any login now.

---

## Phase 1 — Security (fast, real risk)

Goal: close the two real exposures and tighten tokens before they leak further.

9. **Rotate the Google Places API key.**
   - It is hardcoded in the CONFIG dict of `lead-scraper/scrape.py`, which is tracked in git history.
   - Google Cloud → APIs & Services → Credentials → find the Places key → **Regenerate/Create new**, then delete the old one.
   - Restrict the new key: Application restrictions → your IP; API restrictions → Places API only.
   - Move the value out of `scrape.py` into `lead-scraper/credentials.json` or an env var, and read it from there.
   - Verify: `git grep` the old key returns nothing in working tree; scraper still runs with the new key.
10. **Rotate the lead-scraper service account key.** An earlier note flags it was briefly in local git history. Google Cloud → IAM & Admin → Service Accounts → the scraper account → Keys → add a new JSON key, download it, delete the old key. Re-share the target Google Sheet with the service account email.
11. **Confirm `GHL_TOKEN` scopes are minimal.** In GHL → Settings → Private Integrations, ensure the app's PIT carries only what it needs (`opportunities`, `contacts`, `conversations`, `appointments.read`, `invoices.read`). The one intentional all-scopes token is the Willis `Location API Token` custom value (Phase 4).
12. **Rotate `SESSION_SECRET` if it was ever shared.** Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Set the SAME value on both Cloudflare Pages projects (`hauck-command-center` and `hauck-internal`), or the shared admin login breaks. Redeploy both.

---

## Phase 2 — Place secret files on this machine

Goal: every gitignored secret file exists with real values, or that app runs blank/stub.

13. **`command-center/app/.env.local`.** Copy `command-center/app/.env.example` → `.env.local`. Fill at minimum `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens, powers `npm run db:migrate`) and `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile → API Tokens → permission "Account: Cloudflare Pages: Edit", powers `npm run cf`).
14. **`intranet/.dev.vars`.** Copy `intranet/.dev.vars.example`. Fill `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same project), and `SESSION_SECRET` matching Command Center's.
15. **`gohighlevel-cli/.env`.** Copy `gohighlevel-cli/.env.example`. Fill `GHL_API_KEY` (Willis PIT), `GHL_LOCATION_ID`, and `GHL_FIREBASE_TOKEN` (get via the DevTools IndexedDB snippet in `gohighlevel-cli/README.md`).
16. **`lead-scraper/credentials.json`.** The Google service account JSON key from step 10. Gitignored; place per machine.
17. **`app/src-tauri/src/google_oauth_secrets.rs`.** Google Cloud → Credentials → Desktop OAuth client ID + secret (Calendar/Drive/Sheets via PKCE).
18. **`app/src-tauri/src/meta_oauth_secrets.rs`.** Meta Business → Settings → System Users: App ID, App Secret, System User token.
19. **`app/src-tauri/src/supabase_secrets.rs`.** Supabase → Settings → API: URL + service role key (only needed for mobile-app tenant provisioning; can stay blank otherwise).

Verify: each file above exists with real values. `build.rs` writes blank stubs for the `.rs` files so the desktop app still compiles if you skip them.

---

## Phase 3 — Command Center deploy (the main app)

Goal: the client product builds, deploys, and reads live GHL data at app.hauckmarketing.com.

20. **Run database migrations.** From `command-center/app`, run `npm run db:migrate`. This applies migrations 0001–0021 in order via the Management API + ledger. Never use the Supabase SQL editor. Verify: command reports all migrations applied, no errors.
21. **Confirm the Pages project.** Cloudflare → Pages → `hauck-command-center` → Settings → Build: build command `pnpm build`, output dir `dist`, `NODE_VERSION=20`, `PNPM_VERSION=10`, pointed at this repo.
22. **Set every server-side var.** Cloudflare → Pages → hauck-command-center → Settings → Variables and Secrets (or `npm run cf env:set KEY value --secret`). Required set:
    - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Settings → API).
    - `APP_PASSWORD`, `TEST_APP_PASSWORD` (you choose).
    - `SESSION_SECRET` (32+ char, from Phase 1 step 12).
    - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL` (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`).
    - `WEBHOOK_SECRET` (32-char random; the SAME value goes in the GHL webhook URLs in Phase 5).
    - `GHL_LOCATION_ID` = `OznT3yyuwK3dqVXDsCaD`, `GHL_TOKEN` = Willis PIT (`pit-...`).
    - `TEST_GHL_LOCATION_ID` = `r0WfsA12qpBv7M185V3v`, `TEST_GHL_TOKEN` = test PIT.
    - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`).
    - `GITHUB_TOKEN` (PAT, `contents:read`), `GITHUB_REPO` = `jakexhauck/hauck-marketing-lab`.
    - `TENANT_SLUG`/`TEST_TENANT_SLUG` (`live-client`/`test-account`), `TENANT_TIMEZONE` = `America/Chicago`.
23. **Confirm the custom domain.** Cloudflare Pages → Custom domains shows `app.hauckmarketing.com` attached. In Namecheap, a CNAME points that host to the `pages.dev` target (no nameserver move needed).
24. **Deploy and watch.** Push to main (auto-deploys), then `npm run cf deploy:watch` to follow the build.
25. **Smoke-test live.** Open app.hauckmarketing.com, log in with `APP_PASSWORD`, then open Inbox (a page that reads GHL). If Inbox loads real conversations, the token works. If login returns 503, CF Pages lost its Supabase secrets: re-set them with `cf.mjs env:set` on both projects + redeploy, then confirm you get 401 (not 503) on a bad login.

---

## Phase 4 — Willis GHL go-live

Goal: the funnel actually fires for the live client, not just demo. Order is "will it fire at all" first. Full sheet: `docs/build-plans/willis-windows-ghl-setup.md`.

**Blockers:**

26. **Dedupe the snapshot first.** The import copied duplicates: Intro Call x4, 2nd Chance x3, Lead Form/Website Form/Chat Widget/OPT OUT x2 each. In GHL → Automation, delete the extra copies BEFORE publishing, or contacts get double-messaged.
27. **Publish the workflows.** 32 of 38 are draft. Open each Intro Call / 2nd Chance / Review / Lead Form / Chat Widget / Missed-Call Text-Back / Conversions API / DR workflow you intend to use and toggle Draft → Publish.
28. **Set the `Location API Token` custom value.** It is blank; both "flip Google title to Confirmed" webhooks read `Bearer {{custom_values.location_api_token}}`. GHL → Settings → Private Integrations → create an all-scopes Willis PIT → copy it → GHL → Settings → Custom Values → paste into `Location API Token`.

**Fill config:**

29. **Fill blank custom values.** GHL → Settings → Custom Values, complete: From Name, From Email, User First Name (Joshua), User Personal Phone Number, Internal Notification From Name/Email/SMS, To Custom Email, To Custom Number, Intro Call + 2nd Chance Confirmation Website, Calendar Link, FB Calendar Link, review request link, Review Funnel Link, GMB Google Reviews Link, Database Reactivation Offer + Relevance, Custom Contest Prize.
30. **Assign a user to the calendars.** The Intro Call and Intro Call 2nd Chance calendars are round-robin with nobody assigned. GHL → Settings → Team → add Josh (and any setter) as a user, then GHL → Calendars → each calendar → assign them, or bookings can't route.

**Connect integrations (none are in the snapshot):**

31. **Google Calendar OAuth.** GHL → Settings → Integrations → connect Google, enable two-way sync so the "Confirmed" title flip lands on the real event.
32. **Phone / LC Phone.** Confirm 313-766-2171 is provisioned in this sub and A2P/10DLC registration is approved, or no SMS sends.
33. **Email sending.** Verify the sending domain / from-address in GHL → Settings → Email Services.
34. **Google Business Profile.** Connect it (needed for the review link + GMB flow).
35. **Meta / Conversions API.** Wire the dataset/pixel BEFORE publishing the Conversions API workflows.

**Verify (one live pass):**

36. **Intro Call flow.** Book a test Intro Call → click the confirm link → watch the Google Calendar title flip to "Confirmed".
37. **Lead once, not twice.** Submit a test Lead Form and a test Chat Widget lead → internal notification + follow-up fires exactly once (proves the dedupe in step 26).
38. **Audit clean.** Run `python tools/intro_call_funnel.py audit --location OznT3yyuwK3dqVXDsCaD --pit <PIT>` → expect 0 issues.

---

## Phase 5 — Real-time webhooks (instant events + phone push)

Goal: per-record events arrive in ~2s and fire phone push, instead of on next refresh. Set up one GHL workflow per event in the Willis sub. Detail: `command-center/app/docs/connections/ghl-instant-sync.md`.

Rules for every one: use Webhook action (POST) to `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`; `locationId={{location.id}}` is mandatory on every payload; `type` strings are case-sensitive; leave `id` out.

39. Create the six workflows, each: New Workflow → trigger → Webhook action with the custom data below.
    - [ ] **Opportunity Created** → `type=OpportunityCreate`, `locationId`, `opportunityId={{opportunity.id}}`, `contactId={{contact.id}}`, `assignedTo={{opportunity.assigned_to}}`.
    - [ ] **Pipeline Stage Changed** → `type=OpportunityStageUpdate` (same four fields).
    - [ ] **Opportunity Status Changed** → `type=OpportunityStatusUpdate` + `status={{opportunity.status}}`.
    - [ ] **Customer Booked Appointment** → `type=AppointmentCreate`, `locationId`, `contactId`.
    - [ ] **Customer Replied** → `type=InboundMessage`, `locationId`, `contactId`.
    - [ ] **Invoice Paid** (optional) → `type=InvoicePaid`, `locationId`, `contactId`.
40. **Verify webhooks.** Move a test opportunity's stage in GHL → a "Stage changed" row appears in the app activity feed within ~2s. Watch raw hits in Cloudflare → hauck-command-center → latest deployment → real-time logs (`[webhook] ...`).
41. **Verify web push.** Both `VAPID_*` vars set (step 22). Create a lead in the client's GHL → phone push arrives in 1–2s and deep-links to the lead.

---

## Phase 6 — Sending infrastructure (unblocks Campaigns / Forms / Chat)

Goal: no SMS or email surface can send until these two exist. Both are cross-cutting dependencies.

42. **A2P 10DLC number.** Register the texting number in GHL and wait for carrier approval. Blocks all SMS: Campaigns, Estimate Forms, Chat Widget.
43. **Verified email domain.** Add and verify the sending domain in GHL. Blocks all email sends.

---

## Phase 7 — Google Drive / Assets

Goal: the Assets page (`/company/documents`) moves from "Connect your Google Drive" to working. Scope `drive.file` is non-sensitive (no Google verification). Detail: `docs/connections/assets.md`.

44. **Enable APIs.** Google Cloud → APIs & Services → Library → enable **Drive API** and **Picker API**.
45. **Consent screen.** APIs & Services → OAuth consent screen → add the `drive.file` scope.
46. **Web OAuth client.** Credentials → Create → OAuth client ID → Web application. Authorized redirect URI: `https://app.hauckmarketing.com/api/admin/assets/oauth/callback`. Add the JS origin (`https://app.hauckmarketing.com`).
47. **Picker API key.** Credentials → Create → API key → save as `GOOGLE_PICKER_API_KEY`.
48. **Set Cloudflare vars.** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT` (= the redirect URI above) on hauck-command-center.
49. **Build the file endpoints.** `/api/assets/files`, `/upload`, `/folder`, `/download`. The start/callback endpoints already exist.
50. **Confirm tables.** `drive_connection` + `client_folders` (migration 0015) are present. Verify: in a real session the Assets page completes a Google connect and lists files.

---

## Phase 8 — Leads (highest-value sales surface)

Goal: turn the shipped `/sales/leads` page from demo-complete into real Willis data. Reads through `useLeadsHub()` → `buildLeadsHub()` in `src/lib/leadsHub.ts`; keep that return shape. Detail: `command-center/app/docs/connections/leads.md`.

51. **Confirm the real follow-up sequences (do first, only truly missing info).** `SEQ.ad` and `SEQ.form` in `src/lib/leadsHub.ts` are PLACEHOLDERS. Read the real steps from live GHL (`ghl.ps1 opportunities pipelines` for stages + the workflow list for steps) and update:
    - [ ] Paid Ads SMS nurture (channel + label + delay per step).
    - [ ] Estimate Forms auto email + SMS (channel + label + delay per step).
    - [ ] Chat Widget: confirm if it has its own sequence; if yes add `SEQ.chat`, else leave it a plain bucket.
52. **Wire data sources (GHL).**
    - [ ] Paid Ad's Pipeline (`uz0fFxCgiwdXbg4Zmwkc`) → Paid Ads tab (map `pipelineStageId` → status via `paidAdsPipeline.ts`).
    - [ ] Organic Pipeline (`source="Website Form"` / `"chat widget"`) → Estimate Forms + Chat tabs.
    - [ ] Conversations (SMS + Email per contact) → the SMS/Email toggle + composer (same thread the Unified Inbox reads, never a copy).
    - [ ] Follow-up automation state (enrolment + step history per contact) → the tracker's sent/replied/outcome. No clean GHL source today; until it lands the tracker runs on the demo `fu` field.
53. **Build the backend endpoints (Pages Functions).**
    - [ ] `GET /api/sales/leads` — merged leads across both pipelines + source + status + latest-message preview + follow-up state.
    - [ ] `GET /api/sales/leads/:contactId/conversation` — SMS + Email threads.
    - [ ] `POST /api/sales/leads/:id/send` — send SMS/Email reply into the GHL conversation.
    - [ ] `POST /api/sales/leads/:id/book-call` — book intro call, pause the nurture, fire the confirm text.
    - [ ] `POST /api/sales/leads/:id/schedule` — schedule a callback, pause follow-ups until then.
    - [ ] `POST /api/sales/leads/:id/outcome` — Not-a-fit / off-ramp stage writes.
54. **Honour the automations (UI already promises them).**
    - [ ] A reply pauses the auto follow-ups (lead → "Needs a human").
    - [ ] Booking pauses the nurture so the two automations never collide, then fires the confirm text.
    - [ ] Confirmation is automatic: the confirm link logs it + flips the Google Calendar title (existing webhook, `gohighlevel-cli/docs/duplicate-intro-call-funnel.md`). It's a tracker status, not a button.
55. **Confirm token scope.** `GHL_TOKEN` must cover Conversations (send) + Opportunities (stage write) + **Workflows** (pause/enrol). The Workflows scope is the new one.
56. **Flip the gates.** Point lead list + threads at the live feeds; wire Send reply / Call now / Book intro call / Schedule / Book visit / Not a fit to their endpoints. Until wired, each shows the gated toast.

---

## Phase 9 — Remaining demo surfaces (feature by feature)

Goal: each surface shows sample data in `?demo=1` and an empty/not-connected state in real sessions today. Wire one at a time; each has a spec in `command-center/app/docs/connections/`.

57. **Revenue / Ledger** (`/billing`): wire the 5 sample sections (12-mo trend, MoM %, YTD, avg invoice, top customers) to backend aggregates, then set `SHOW_UNWIRED_SECTIONS=false` and drop the sample banner.
58. **Calendar streams** (`/calendar`): Jobs (GHL Sales Pipeline `6o9Gx6e0TXRFJdln5d01` at Job Booked + Completed), plus Social + Campaigns once those backends exist. Appointments already live. Specs: `jobs.md`, `calendar.md`.
59. **Paid Ads (marketing)** (`/marketing/paid-ads`): Meta Ads API insights + GHL Paid Ad's Pipeline.
60. **The rest:** Jobs (`/sales/jobs`), Social Media (`/marketing/social`, GHL Social Planner + AI captions), Campaigns (`/marketing/campaigns`, needs Phase 6), Reviews (Google Business Profile), Website (GA + CMS), Automations (GHL sequences API), Contacts lifecycle chips (needs a Willis tag→stage map). Wire each against its `docs/connections/` spec.

---

## Phase 10 — AI features (Anthropic)

Goal: in-app copy/caption drafting for Campaigns and Social. Server-side only, never in the browser bundle.

61. **Get the key.** console.anthropic.com → create an API key.
62. **Set it.** Add `ANTHROPIC_API_KEY` to Cloudflare on hauck-command-center.
63. **Build the endpoints.** `/api/campaigns/generate` and `/api/social/generate`. Voice profile = vault `Profile.md`/`Memory.md` + copywriter skill rules; prompt-cache the profile. Default model Opus 4.8 (single) / Sonnet 5 (batch).

---

## Phase 11 — Satellite apps (as needed)

64. **Desktop app** (`app/`, Tauri): place the three `*_secrets.rs` (Phase 2), install Claude CLI on PATH and log in (chat streams via `claude -p`), then set runtime keys in-app on the Settings page: Replicate token, Gemini key, GHL PIT + location. Per-client Meta creds go in `data/<slug>/credentials.yaml`.
65. **Internal hub** (`intranet/`): set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` matching Command Center, and a separate Web Google OAuth client (redirect `https://internal.hauckmarketing.com/api/drive/oauth/callback`) as Cloudflare secrets on hauck-internal. Deploy: `cd intranet && npm run deploy`.
66. **Blueprint** (`blueprint/`): set `BLUEPRINT_PASSWORD` as a Cloudflare Pages secret (fail-closed: 503 if unset). Any username, only the password is checked.
67. **Marketing website** (`Hauck Marketing Website/`): confirm `vercel.json` rewrites keep `/privacy` and `/terms` working (Google Limited Use disclosure lives on `/privacy`). Deploys from main automatically.
68. **Media buying** (`media-buying/`): maintain `data/clients.yaml` (Meta ad account ids like `act_4396590353913166`, Drive/Sheet URLs, folder maps). Consumed by the desktop app.

---

## New machine (Mac ↔ Windows) reminder

`git pull` brings all app code, CLAUDE.md files, `.claude/settings.json`, and vendored skills. Install by hand: plugins via `/plugin` (marketplace `anthropics/claude-plugins-official`): `superpowers`, `rust-analyzer-lsp`. Then place every Phase 2 secret file. `.claude/settings.local.json` and `.claude/worktrees/` are intentionally not synced.

*Companion to `docs/INTEGRATIONS-AND-HOOKUP.md`. Keep both updated as feeds get wired.*
