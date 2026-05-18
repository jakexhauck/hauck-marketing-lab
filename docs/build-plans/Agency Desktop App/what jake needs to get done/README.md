# What Jake needs to get done

Action items for shipped build-plan updates. Each section maps to a feature that's already in the app — your turn to test, configure, or wire up the missing external piece.

---

## 01 · Meta Ads reports (shipped 2026-05-18)

### What's in the app now
- 8 new report forms under the **Reports** category in the sidebar:
  - Daily Pulse, Friday Client Report, Andromeda Cleanup Audit, Catalog Health Check, Anomaly Slack Alert, Auction Edge Report, Pre-Pitch Account Audit, Bloomberg-Style Live Dashboard
- **Pull last N days from Meta** button on the Weekly + Monthly report forms (auto-fills spend, leads, CPL, ROAS, revenue, best-ad name + CPL from `meta_list_ads_insights`)

### Your action items
1. **Register the Meta Ads MCP** so the 8 report prompts can actually query Meta:
   ```
   claude mcp add --transport http meta-ads https://mcp.facebook.com/ads
   ```
   First call triggers Meta OAuth in the browser. Verify with `claude mcp list`. Without this, the prompts still run but Claude composes from your pasted data only (no live pulls).
2. **Smoke-test the auto-fill button** on the Weekly Report form for client #1:
   - Open Weekly Report → click "Pull last 7 days from Meta"
   - Confirm spend / leads / CPL / best-ad fields populate
   - Confirm your manual edits to qualitative fields (TRENDS, TOP AD WHY, NEXT WEEK PLAN) survive after the pull
3. **Confirm `meta_ad_account_id` is set** in `media-buying/clients.yaml` for every active client. The auto-fill button errors out cleanly if it's missing, but it's worth a one-time audit.
4. **Find your catalog ID** (only needed if you use the Catalog Health Check form):
   - Meta Commerce Manager → Catalogs → click your catalog → ID is in the URL or the header
   - Save it in your password manager or paste into the form each time
5. **Test one prospect audit** with the Pre-Pitch Account Audit form before your next cold pitch (this is the highest-leverage one for new client acquisition)

### Still parked
- Activity log entries on every Meta pull (`vault/ops/activity.jsonl`) wired separately — extend `meta_list_ads_insights` to drop a `scheduled.run` event when called from a schedule (deferred to scheduled-jobs build)
- Per-account picker UI cached to `vault/About/Meta Accounts.md` — current flow uses clients.yaml directly, which is fine

---

## 02 · Ad Creatives (V3 HTML composites shipped 2026-05-18)

### What's in the app now
- 6 niche-specific HTML composite ad forms under **Misc**:
  - HTML Ad · Family Dentist (1080×1080)
  - HTML Ad · Local Gym (1080×1350)
  - HTML Ad · Italian Restaurant (1080×1080)
  - HTML Ad · Real Estate (1080×1350)
  - HTML Ad · Hair Salon (1080×1920)
  - HTML Ad · Local Plumber (1080×1080)
- Each form takes City (+ Neighborhood for real estate), optional Headline + CTA overrides. Defaults are the verbatim copy from the spec doc.
- Output: a single fenced ```html block in the saved brief. Self-contained HTML with inline CSS at the niche's target dimensions.

### Your action items
1. **Generate one composite per niche** as a smoke test. Confirm the HTML renders the niche colors/fonts/layout as expected.
2. **Manual screenshot workflow** (until the Playwright sidecar lands):
   - Copy the HTML block from the saved brief
   - Save it as `ad.html` somewhere local
   - Open in Chrome at the niche dimensions (use DevTools device mode set to 1080×1080 / 1080×1350 / 1080×1920)
   - Screenshot with Snipping Tool or DevTools "Capture node screenshot"
   - Drop into the client's vault assets folder
3. **Add your Google AI Studio API key** when you get it back (unblocks V1 Nano Banana photorealistic stills):
   - Open `https://aistudio.google.com/apikey`, create a key
   - Settings page in the app → Google AI Studio panel → paste + save
   - Smoke test the existing **Static Ad Creative Builder** form (1 ad × 1 dimension first)
4. **Decide on Freepik** (V2 Seedance video, ~$0.10/sec of video):
   - If you want 5-second image-to-video animation, sign up at freepik.com/api and get an API key
   - Tell me and I'll wire `visuals.rs` + the "Animate this" button

### Still parked
- V1 Nano Banana smoke test (blocked: Google AI Studio key)
- V2 Freepik Seedance video (blocked: Freepik key + decision to spend)
- V3 PNG screenshot pipeline (Playwright sidecar bundle, ~1 day of work)
- Reference-image attachment plumbing for `claude -p --image`

---

## 03 · Activity log + memory write-back (shipped 2026-05-18)

### What's in the app now
- Append-only event log at `vault/ops/activity.jsonl`. Every form save, lead-scraper run, and web-designer mockup writes a line.
- Dashboard surface: new "Recent activity" panel below the Daily routine + Today calendar row. Tails the last 20 events. Click a row to open the referenced file.
- Header bell: shows an amber badge for unread events (or `hot: true` entries on first install before any bell click). Popover lists the 10 most recent. Closing the popover marks everything seen.
- Memory write-back: after every form save with a known client, a background `claude -p` call extracts up to 3 durable facts and appends them to `vault/Clients/<Name>/Memory.md` under a dated bullet. A `memory.updated` event lands in the feed when facts get appended.

### Your action items
1. **Smoke test** the end-to-end loop:
   - Open Hauck Marketing Lab. Run any form on Willis Windows (Ad Copy is fastest).
   - Within ~30 sec, the Recent activity panel should show `form.run`.
   - Within another ~15 sec, a `memory.updated` event should appear, and `vault/Clients/Willis Windows/Memory.md` should have a new dated bullet at the top of the Facts section.
2. **Tune memory output if it's noisy.** The extraction prompt lives in `app/src/lib/memoryWriteback.ts` (`EXTRACTION_PROMPT`). Tighten the "Do NOT extract" list if you find junk facts landing in Memory.md. Bullets that include the literal word `NONE` are already filtered.
3. **Optional: hide the bell badge for low-value events.** Set `hot: true` only on `outreach.reply` (default) or expand to other types via the Rust appender. The badge currently pings on any `ts > lastSeenAt` once you've clicked the bell once.

### Still parked
- Part 2 "Today" briefing page — separate session. Activity log is the substrate it reads from.
- Outreach + scheduled-jobs events (`outreach.drafted`, `outreach.sent`, `outreach.reply`, `scheduled.run`) — wired schema-side, no producers yet.
- Log rotation. Single file grows ~50 events / heavy day. ~10MB / ~50k entries before performance degrades. Revisit then.

---

## 04 · Stage 1 booking page + intake (built, awaiting Jake's setup)

### What's built
A custom Hauck-branded booking page wired through Apps Script to GHL (calendar = `NK53JD0np0dfOaRpmUWh`, "Onboarding Call"). Two-way Google Calendar sync via GHL means anything on Jake's calendar blocks bookings and confirmed bookings land back on Google instantly. Files: `mockups/forms/onboarding-calendar/variant-a-stepped.html`, `mockups/forms/client-intake/apps-script.gs`, `mockups/forms/client-intake/variant-a-stepped-wizard.html`.

### Your action items (~25 min, one-time)
1. **GHL two-way Google sync (~5 min).** Settings → My Profile → Calendar Settings → Calendar Integrations. Connect Google, pick which calendars block, enable two-way sync on the primary. Confirm Onboarding Call calendar availability hours, 30-min duration, 15-min buffer, 4 max bookings/day.
2. **GHL Private Integration Token (~3 min).** Settings → Private Integrations → + Create New. Scopes: `calendars.readonly`, `calendars/events.write`, `contacts.readonly`, `contacts.write`. Existing token in `ghl_config.json` may already have them, check first.
3. **Apps Script setup (~7 min).** Open the **Hauck Client Intake Submissions** sheet → Extensions → Apps Script → replace contents with `mockups/forms/client-intake/apps-script.gs`. Save as **Hauck Intake + Booking Handler**. Project Settings → Script Properties → add `FOLDER_ID`, `GHL_TOKEN`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID=NK53JD0np0dfOaRpmUWh`.
4. **Apps Script deploy (~3 min).** Deploy → New deployment → Web app → Execute as Me, Anyone access → authorize. Copy the Web App URL.
5. **Wire URLs (~2 min).** Edit `variant-a-stepped.html` → `const APPS_SCRIPT_URL = '<URL>';`. Edit `variant-a-stepped-wizard.html` → `const ONBOARDING_CALENDAR_URL = '<public calendar page URL>';`.
6. **Cloudflare Pages hosting (~5 min).** Workers & Pages → Create application → Pages → upload `mockups/forms/` contents. Custom domain `intake.hauckmarketing.com`. Add CNAME at Namecheap.
7. **Smoke test (~5 min).** Open the deployed calendar page in incognito → pick a date, confirm slots load → book → verify GHL contact + appointment + Google Calendar event with Zoom link.

### Welcome-email Apps Script tweak (deferred, ~25 min)
Not blocking. When ready: add the `UrlFetchApp.fetch` block in `doPost()` per the original spec to create GHL contacts on intake submission, add the corresponding GHL workflow (trigger = tag `intake-submitted`, action = send welcome email + add to Onboarding pipeline), and create the 12 contact custom fields in GHL.

### Still parked
- Timezone localization (v1 is hardcoded `America/New_York`).
- Multi-calendar support (calendar ID becomes URL param later).
- Custom reschedule UI (clients use the GHL-generated link in the confirmation email for now).
- Payment-gated forms (open to anyone in v1).

---

## 05 · New-client cascade + sequence wizard (shipped 2026-05-18)

### What's in the app now
- **Day-0 cascade modal.** New **Mark client Won** button on the Client Hub header (pre-launch clients only). Opens `Phase1CascadeModal` which kicks off five draft generations in parallel:
  - Welcome email (Vortex) → Gmail draft via the `claude.ai Gmail` MCP
  - Expectations email (Vortex) → Gmail draft
  - Contract (Vortex) → markdown for manual countersign
  - Kickoff calendar invite → Google Calendar event 3 days out, 10:00 local, 30 min
  - Intake form link → copies `https://intake.hauckmarketing.com/` to clipboard
  - Each card: status (pending → drafting → ready → approved → sending → sent), preview, approve/skip/retry. Footer "Approve all ready". Activity log line per send (`outreach.sent` with cascade + step meta). Calendar step auto-ticks `02-call` on the onboarding checklist.
- **Onboarding Sequence Wizard tab** on the Client Hub for pre-launch clients. Five steps (calendar booked → audience research → ad copy → landing page → pre-launch QA). The form-backed steps (`audience-research`, `ad-copy`) chain: ad-copy auto-prefills `audience_summary` + `audience_headline` from the audience-research output (Profile.md remains the fallback). State persists in `vault/Clients/<name>/onboarding.json` under the `sequence` key. Stepper at top with done / current / pending / skipped badges. Footer: Save & continue (after a form save), Skip step, Back, and Mark launched on step 5 (disabled until step 5 has an output). Mark launched flips `sequenceComplete: true`, sets `adsLaunchedAt` on ops/clients.json, hides the Sequence tab.

### Files
- `app/src/lib/cascades.ts` — Phase 1 cascade declarative spec
- `app/src/components/Phase1CascadeModal.tsx` — bulk runner + review UI
- `app/src/lib/onboardingSequence.ts` — 5-step sequence spec + load/save/chain helpers
- `app/src/components/MainDashboard/pages/ClientSequence.tsx` — Sequence tab UI
- `app/src/lib/navigation.ts` — added `"sequence"` to `ClientSection`, pre-launch landing tab
- `app/src/components/MainDashboard/ClientDashboard.tsx` — Mark Won button, Sequence tab gating, cascade modal mount

### Your action items
1. **Smoke test on a fresh pre-launch client.** Add a test client to `media-buying/clients.yaml` with `status: pre-launch`. Open Client Hub → Mark client Won → confirm all 5 drafts land within ~30 sec → expand each, approve a couple to verify Gmail draft + calendar event land. The remaining cards can be Skipped.
2. **Verify the Gmail MCP can write drafts.** The cascade sends `create_draft` via `claude.ai Gmail` MCP. If you haven't run a Gmail MCP draft from this app yet, do one manual `claude -p` call from a terminal to authorize. Drafts land under `[Gmail] Drafts` for review before send.
3. **Verify Google Calendar OAuth is connected.** Settings → Google Calendar → Connect, if not already done. The kickoff invite step depends on this.
4. **Walk a client through the full sequence end to end.** Audience step → review prefill into ad-copy step → confirm landing-page + QA confirmation cards advance → click Mark launched → confirm Sequence tab disappears and `vault/Clients/<name>/onboarding.json` shows `sequence.sequenceComplete: true` + `adsLaunchedAt` on ops/clients.json. Onboarding checklist tab should still be reachable post-launch.
5. **Decide if intake URL needs to be per-client.** Today the cascade copies `https://intake.hauckmarketing.com/`. If you want a token per client, wire an `intake_url` field on ClientEntry and read it from `Phase1CascadeModal`.

### Still parked
- **Phase 2-6 cascades.** Only Phase 1 is wired. The `CascadeSpec` abstraction is reusable: add a new spec + trigger when those phases get the same parallel-draft treatment.
- **Auto-send Gmail (vs. draft).** Always human-in-the-loop in v1. The MCP only ships `create_draft`; auto-send would need a different tool.
- **Instantly send wiring.** Not built — the Outreach send doc hasn't shipped.
- **E-signature on contract.** Manual countersign + PDF for v1. DocuSign/PandaDoc later.
- **Sequence forms for `onboarding-calendar`, `web-designer`, `pre-launch-qa`.** Spec called these out but no FormConfig exists; they render as confirmation cards (mark complete + continue). Promote any to a real form by adding a config and flipping `formId` in `onboardingSequence.ts`.
- **Re-running a completed step warning.** Spec mentions a "downstream prefills need review" banner; today the prior-output banner just notes the overwrite. Sufficient for v1.

---

## 06 · Today briefing (shipped 2026-05-18)

### What's in the app now
- New **Today** tab as the first item under Workspace in the sidebar. Lands on a single page that aggregates across every active client.
- Five collapsed sections, each with a count badge:
  1. **Inbox needing reply** (placeholder; Gmail MCP wiring still parked)
  2. **CPL drift alerts** (live, when Profile.md frontmatter declares a CPL target)
  3. **Creative awaiting approval > 48h** (reads creative-flavoured `form.run` events older than 48h)
  4. **Onboarding slippage** (pre-launch clients whose phase-day has passed without a checked-off task)
  5. **Yesterday's wins** (counter pulled from activity.jsonl: leads, form runs, creatives, outreach sent, replies)
- Pure aggregator at `app/src/lib/briefing.ts`. Takes clients + activity tail + profile meta + KPI snapshots + onboarding state, returns a typed `BriefingPayload`. No I/O inside — page loads the data, function pivots it.
- Refresh button + auto-refresh on window focus. Empty sections collapse to `▸ all clear` (or `quiet day` for Yesterday's wins).

### Your action items
1. **Open the Today tab** (first item under Workspace) and confirm every section renders. With no CPL targets set yet, the CPL drift section should read "all clear". Same for awaiting-approval until 48h has passed on a creative form run.
2. **Add CPL targets** to each live client's `Profile.md` frontmatter so the drift section can flag breaches. Accepted keys: `cplTarget` (preferred), `cpl_target`, `cpl`, or `target_cpl`. Optional per-client override: `cplDriftPct` (defaults to 20% above target). Example:
   ```yaml
   ---
   type: profile
   client: willis-windows
   cplTarget: 35
   aov: 280
   ---
   ```
3. **Smoke-test the deep links**: click a CPL drift row or an onboarding slip row, confirm it jumps to the right client's surface.
4. **Decide whether to push notifications** later. Tauri notification plugin is out of scope for v1; revisit when you want OS-level pings on green → red transitions.

### Still parked
- Gmail MCP inbox count (currently hardcoded to 0 with a TODO in `MorningBriefing.tsx`). Wire via `claude -p` once the outreach + scheduled-jobs build lands.
- Explicit `creative.approved` activity event so the awaiting-approval section can flip rows to "done" instead of relying on the 48h timer. Out of scope for v1.
- System notifications on state transitions (Tauri notification plugin). Phase 2.
- Historical trend / weekly digest view. Today only by design.

---

## Quick reference: where things live

- **Form configs**: `app/src/lib/formConfigs.ts`
- **Auto-fill mapper**: `app/src/lib/metaAutoFill.ts`
- **Niche HTML templates**: `app/src/lib/adTemplates.ts`
- **Meta Marketing API client**: `app/src-tauri/src/meta_ads.rs`
- **Gemini image gen**: `app/src-tauri/src/gemini_image.rs`
- **Activity log (Rust)**: `app/src-tauri/src/ops_activity.rs`
- **Activity helpers + types (TS)**: `app/src/lib/activity.ts`
- **Memory write-back (TS)**: `app/src/lib/memoryWriteback.ts`
- **Activity feed panel**: `app/src/components/MainDashboard/ActivityFeedPanel.tsx`
- **Notifications bell**: `app/src/components/MainDashboard/NotificationsBell.tsx`
- **Today briefing aggregator**: `app/src/lib/briefing.ts`
- **Today briefing page**: `app/src/components/MainDashboard/MorningBriefing.tsx`
- **Phase 1 cascade**: `app/src/lib/cascades.ts`, `app/src/components/Phase1CascadeModal.tsx`
- **Onboarding sequence**: `app/src/lib/onboardingSequence.ts`, `app/src/components/MainDashboard/pages/ClientSequence.tsx`
- **Saved briefs**: `media-buying/data/<client>/briefs/`
- **Vault client assets**: `vault/Clients/<Name>/Assets/`
- **Activity log file**: `vault/ops/activity.jsonl`
- **Bell unread state**: `vault/ops/activity_state.json`
