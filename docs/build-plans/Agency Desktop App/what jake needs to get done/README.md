# What Jake needs to get done

Action items for shipped build-plan updates. Each section maps to a feature that's already in the app, your turn to test, configure, or wire up the missing external piece.

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

## 07 · Pitch Deck Generator (shipped 2026-05-18)

### What's in the app now
- New **Pitch Deck Builder** form under phase 1 ("Close the Deal") on the Client Hub.
- Single-prompt, single-HTML output. Twelve fullscreen snap-scroll slides: cover, opportunity, where they are now, 90-day outcomes, strategy funnel, Month 1/2/3, sample creative (placeholders for v1), team, tiered investment, guarantee + sign-here CTA.
- Form fields: client name (prefills from Profile.md `business`), agency name (defaults to "Hauck Marketing"), niche, city (prefills from Profile.md `geography`), opportunity, 3 observations, 3 outcomes, pricing tiers (mark recommended with `*`), guarantee line, accent hex, vibe (Editorial / Tech / Luxe / Gritty).
- Output saves to `media-buying/data/<client>/decks/<timestamp>-pitch.html` and opens in your default browser automatically. The saved card also has an **Open in browser** button.
- Past decks for a client list under PAST RESULTS like every other form. Click a row, then **Open in browser** to relaunch.

### Files
- `app/src/lib/pitchDeckPrompt.ts` — verbatim master prompt + appended context block.
- `app/src/lib/formConfigs.ts` — `PITCH_DECK` config, registered in `ALL_FORM_CONFIGS`.
- `app/src-tauri/src/pitch_decks.rs` — `save_pitch_deck`, `list_pitch_decks`, `open_pitch_deck` commands.
- `app/src/components/GenericFormGenerator.tsx` — branches on `config.kind === "html"` to skip JSON extraction and route through the new save/open path.
- `app/src/components/generators/PastResults.tsx` — uses `list_pitch_decks` when the kind is HTML.

### Your action items
1. **Smoke-test one deck end-to-end.** Open Willis Windows → Pitch Deck Builder → fill the three required fields (client name, niche, pricing tiers) → Generate. Watch for the deck to pop in your default browser within ~60 sec. Scroll through all 12 slides. Confirm snap-scroll works.
2. **Drop in a real accent hex** for at least one of your typical niches. Defaults to `#4d8eff`; brand-match it once and it ships to every deck.
3. **Pick a vibe** that lands for your usual pitch. Editorial is the default; flip to Tech / Luxe / Gritty if your prospects skew differently.
4. **If a deck looks wrong**, regenerate. There's no slide editor; cheaper to rerun the prompt with tighter inputs (sharper observations, real outcome numbers) than to manually edit.
5. **Manually screenshot or PDF-print** a deck if you want to leave one behind. Browser → print → save as PDF until the export pipeline ships.

### Still parked
- **PDF export.** Out of scope for v1. Screen-shared pitches + browser print-to-PDF cover the use case.
- **Editable slides post-generation.** No slide editor. Regenerate instead.
- **Auto-fill observations + opportunity from pre-pitch audit.** Hooks for the Meta Ads pre-pitch audit are not wired into the deck form yet; today it's all manual entry.
- **Real ad PNGs on slide 9.** Static placeholders for v1. When Ad Creative outputs flow into a per-client gallery, slide 9 can hot-link the three most recent.

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
- **Saved decks**: `media-buying/data/<client>/decks/`
- **Pitch deck prompt**: `app/src/lib/pitchDeckPrompt.ts`
- **Pitch deck save/open backend**: `app/src-tauri/src/pitch_decks.rs`
- **Vault client assets**: `vault/Clients/<Name>/Assets/`
- **Activity log file**: `vault/ops/activity.jsonl`

---

## 09 · Split View (shipped 2026-05-18)

### What's in the app now
- **Split button** in the top-right pane chrome of the primary pane. One click opens a second pane on the right. Default split is 50/50; min pane width is 480px.
- **Draggable divider** between panes. Drag left/right to resize. Cursor changes to `col-resize` on hover.
- **Per-pane independence**: each pane has its own active page, active client, sidebar selection, modals, scroll position, chat drawer, and command palette. The left pane is the primary — only it writes the persisted active client back to disk.
- **Compact mode (<800px)**: sidebar collapses to an icon rail, top-bar buttons go icon-only, clock + breadcrumb segments hide, hub banner / stat / col-2 grids stack vertically, forms force single-column. Triggered automatically by `usePaneWidth` + the `.hml-pane--compact` class.
- **Pop Out** (↗ icon, secondary pane chrome): opens a new Tauri window seeded with the pane's current client, removes the pane from the main window. The popped-out window is a full app instance with its own sidebar and top bar. The pane chrome shows a small DETACHED badge.
- **Return to main window** (↙ icon, popped-out window chrome): re-attaches the pane to the main window and closes the popped-out window.
- **Drag-to-tear-off**: mousedown on the secondary pane's chrome strip and drag the cursor more than ~100px past the main window's bounds — the pop-out fires at the cursor location.
- **File-watcher sync** (`notify` crate): the Rust side watches the configured root recursively and emits `vault://changed` events classified by kind (client / about / ops / knowledge / playbooks / recordings / clients). All webviews (main + every popped-out window) subscribe; data hooks refetch, and the affected pane briefly pulses (`.hml-vault-pulse`) so the cross-pane sync is visible.

### Your action items
1. **Try a real split with your active client.** Open the app, click the Split icon (two rectangles, top-right), drag the divider, then load Onboarding Checklist on the left and the Welcome Email form on the right. Edit a recording or memory note on the right pane and confirm the left pane updates within a second.
2. **Pop out to your second monitor.** With the split active, click the ↗ icon on the right pane. The new window should boot directly into the same client's dashboard. Drag it to your second monitor; both windows should stay in sync via file-watcher.
3. **Eyeball compact mode for pages that pinch.** The plan called out OpsTrackers, ClientCredentials, ClientProfileForm, and ClientDashboard as likely first offenders. Specifically check:
   - Tasks tracker and Revenue tracker at ~600-700px wide — note any columns that overlap or text that truncates badly.
   - Ads Manager (Workspace → Ads) in compact mode — the Meta insights tables may need column-hide rules added.
   - Sequence wizard (per-client) when compact — its step grid wasn't audited.
   Anything that pinches gets a one-line fix in `app/src/components/MainDashboard/main-dashboard.css` under the `/* COMPACT MODE */` block.
4. **Confirm pop-out windows look right after a Tauri auto-update.** The updater restarts the main window only; popped-out windows die. No graceful re-attach on update — if you live with the app open across a release, you'll need to re-pop-out manually. Flag if this becomes a daily nuisance.
5. **Test drag-to-tear-off carefully.** Phase 6 is the most fragile per the spec. Mousedown the right-pane chrome strip (the area around the buttons, not the buttons themselves) and drag the cursor past the window edge. Threshold is ~100px; below that, releasing does nothing. If it triggers when you didn't intend it to, lower the priority or remove the chrome mousedown handler in `AppPane.tsx`.

### Still parked
- **No recursive split**: a popped-out window cannot itself be split. Intentional, per spec.
- **Split state does not persist across restarts**: by design. The app always opens unsplit.
- **Two media-buying overlays at once**: the second media-buying pane works but the chrome is busy. If you find yourself wanting one-at-a-time media-buying, scope it as a global singleton later.
- **Drag-to-tear-off ghost outline**: spec mentions a ghost outline following the cursor during drag. Not implemented — the cursor change + the actual tear-off threshold are the only feedback right now.
- **Tauri auto-updater + popped-out windows**: no graceful re-attach (see action item 4).

### Files in this build
- **AppPane component**: `app/src/components/AppPane.tsx`
- **Pane context + width hook**: `app/src/lib/PaneContext.tsx`, `app/src/lib/usePaneWidth.ts`
- **Pop-out URL encoder**: `app/src/lib/popout.ts`
- **Drag detection**: `app/src/lib/dragToPopout.ts`
- **App root (pane container, divider, pop-out wiring)**: `app/src/App.tsx`
- **Split layout + compact CSS**: `app/src/components/MainDashboard/main-dashboard.css` (search for `SPLIT VIEW` and `COMPACT MODE`)
- **File watcher (Rust)**: `app/src-tauri/src/watcher.rs`
- **Capability update for pane-* windows**: `app/src-tauri/capabilities/default.json`
- **Tauri command + frontend helper**: `app/src-tauri/src/lib.rs` (handler), `app/src/lib/tauri.ts` (`watchRoot`, `onVaultChanged`)
- **Split + close + return-to-main icons**: `app/src/components/icons.tsx`
- **Bell unread state**: `vault/ops/activity_state.json`
- **Playbooks (Rust)**: `app/src-tauri/src/playbooks.rs`
- **Playbooks (TS helpers)**: `app/src/lib/playbooks.ts`
- **Niche Playbooks page**: `app/src/components/MainDashboard/NichePlaybooksPage.tsx`
- **Playbook content**: `vault/Playbooks/<slug>/`

---

## 10 · Internal Documents + Google Drive sync (shipped 2026-05-21)

### What's in the app now

- New **Documents** tab on every Client Hub (between Ads and Recordings).
- Per-client document store at `vault/Clients/<Name>/Docs/<slug>.md`. Markdown body with full frontmatter (id, kind, title, sync state, version history, orphan tracking). Folder = source of truth, same as the rest of the vault.
- Five doc kinds: `ad-copy`, `brief`, `notes`, `report`, `other`.
- **Default Folders card** at the top of each client's Documents tab. Picks the default Drive subfolder per kind, stored on the client record in `clients.yaml` as `doc_folder_defaults`. Auto-expands until all five are mapped, then collapses to an "Edit defaults" link.
- **Document editor**: title input, kind selector (read-only in v1), folder picker (reads `_drive-index.md`), debounced autosave (1s), live markdown preview, status chip (unsynced / dirty / synced), version counter, orphan count if any.
- **Push to Drive**: converts the markdown body to a native Google Doc inside the resolved subfolder. Resolution order: per-doc folder override > client default for kind > client root Drive folder. Old version (if any) gets deleted via the new direct Drive REST API helper.
- **Open in Docs**: external launch of the live Google Doc.
- **Pull from Drive**: reads the Doc body back, backs up the local copy to `Docs/.backup/<id>-<timestamp>.md`, then overwrites the local markdown body. Confirm modal explains the trade.
- **OAuth scope expanded**: existing `google_calendar_connect` flow now also requests `drive.file` (narrow per-file scope; does NOT grant access to your entire Drive). Single re-consent unlocks both Calendar and Drive going forward.
- **Orphan tracking**: if the Drive delete fails after a successful new-doc push, the old file ID is appended to `unswept_orphans` in the doc's frontmatter and surfaced as an amber count in the editor header.

### Files

- `app/src-tauri/src/client_docs.rs` — storage layer.
- `app/src-tauri/src/drive_api.rs` — Drive REST helper, currently just `drive_delete_file`.
- `app/src-tauri/src/drive_upload.rs` — extended with `push_client_doc_to_drive` and `pull_client_doc_from_drive`.
- `app/src-tauri/src/google_calendar.rs` — added `drive.file` to `SCOPES`, exposed `google_access_token` for cross-module use.
- `app/src-tauri/src/clients.rs` — added `doc_folder_defaults` field on `ClientEntry` and the `set_client_doc_folder_default` command.
- `app/src/lib/clientDocs.ts` (types in `types.ts`, wrappers in `tauri.ts`) — frontend API surface.
- `app/src/components/DocumentEditor.tsx` — the editor.
- `app/src/components/MainDashboard/pages/ClientDocuments.tsx` — per-client master/detail tab.

### Your action items (in order)

1. **Re-consent to pick up the new Drive scope.** This is the only blocking step.
   - Open the app.
   - Go to wherever Google Calendar is connected today (Settings or the Onboarding calendar card).
   - Click **Disconnect Google Calendar**, then **Connect Google Calendar** again.
   - A Google consent screen opens in your browser listing three permissions: Calendar events, Calendar (read-only), and "See, edit, create, and delete only the specific Google Drive files you use with this app". The third is `drive.file`. It sounds broad but it only grants access to files this app creates or that you explicitly open with it.
   - Click Allow. Browser tab closes itself.

2. **Set default folders for Willis Windows.**
   - Open Client Hub > Willis Windows > **Documents** tab.
   - The Default Folders card is expanded. Pick a Drive subfolder for each of the five kinds. Suggested mapping:
     - Ad Copy → Creatives
     - Brief → Notes
     - Notes → Notes
     - Report → Reports
     - Other → Notes
   - Each pick auto-saves; the card collapses once all five are mapped.

3. **Smoke-test push.**
   - Click **+ New Document**.
   - Title: `Test push (safe to delete)`. Kind: Ad Copy.
   - Type two paragraphs and a bullet list into the body. Wait until the "Saved" indicator appears.
   - Click **Push to Drive**. First push may take 30 to 60 seconds (it spawns `claude -p`).
   - When the status chip flips to green ("Synced") and the version counter shows v1, click **Open in Docs**.
   - Verify the Doc opens in docs.google.com as a **native Google Doc** (not a `.docx`), and that it lives in Willis Windows > Creatives folder in Drive.

4. **Smoke-test update (the delete path).**
   - Edit the body of the same doc, add another paragraph.
   - Click **Push to Drive** again.
   - Verify the version counter goes to v2, **Open in Docs** still works, the title in Drive is unchanged, and the **old Doc is no longer in the Creatives folder** (delete worked).
   - If the orphan count badge ever appears, click into the doc and the editor header will show the count. Drive delete failed for some reason; the new push still succeeded. Tell me when this happens.

5. **Smoke-test pull.**
   - In the Drive Doc, edit something (add a line, change a word).
   - Back in the app, click **Pull from Drive**, confirm.
   - The local body should refresh to the Drive content. Old local body is backed up to `Docs/.backup/`.

6. **Clean up.**
   - Delete the test doc locally. The Drive copy stays (intentional in v1; cleanup of Drive on local-delete will land later).

### Still parked

- **Global Documents page** in the sidebar (cross-client view). Not built yet; per-client tab covers daily use.
- **Ad Copy form "Save as Document" output mode.** Not wired yet; for now you can copy the form output and paste it into a new doc manually.
- **"Sweep orphans" cleanup command.** If a Drive delete fails repeatedly, the orphans pile up in frontmatter. No bulk sweep button yet.
- **Auto-push on save (file watcher).** Click-to-push only in v1.
- **Bidirectional live sync** (real-time). Pull is on-demand only.
- **Kind selector commit.** Read-only in v1; change kind by creating a new doc and copying content over.

### If something breaks

- "Google authentication expired or missing the Drive scope" → re-do step 1.
- "Document body is empty" → add content before pushing.
- "Drive folder ID could not be parsed" → set folder defaults in the Default Folders card.
- "Could not find a Google Doc URL in the agent response" → `claude -p` returned without the sentinel. Check `claude /mcp` to confirm `claude.ai Google Drive` MCP is connected. Retry.
- Push hangs forever → `claude -p` may have stalled. Kill the app and reopen. The doc's local body is fine (it's already saved). Try again.

---

## 08 · Niche Playbooks (shipped 2026-05-18)

The niche playbook framework is live. Three starter playbooks ship: `dental`, `gym-fitness`, `med-spa`.

### What's in the app now
- `vault/Playbooks/<slug>/` directory layout with six required files per niche (`audience.md`, `offers.md`, `angles.md`, `creative-brief.md`, `competitors.md`, `benchmarks.json`). README at `vault/Playbooks/README.md` documents the shape.
- `niche` field on client `Profile.md` frontmatter. Picker dropdown on the new-client flow (Manage clients → + Add client) and editable in the Edit Profile screen. Options come from directories under `vault/Playbooks/` plus a "Custom (no playbook)" sentinel.
- Form prefill plumbing in `GenericFormGenerator` honours: explicit override > Profile.md > niche playbook > empty. Three forms wired today: Hooks, Creative Brief, Ad Copy. Each prefilled field shows a small `auto · profile` or `auto · <slug> playbook` tag.
- Validation at app start: any incomplete playbook directory logs a console warning, never blocks boot.
- **Niche Playbooks page** under Workspace in the sidebar. Lists every playbook with a complete/incomplete badge, supports Add (with kebab-case slug + display name + the six content fields including a structured benchmarks form), Edit, and Delete (with confirm). All writes go through Tauri commands; no browser fs.

### Your action items
1. **Set `niche:` on the existing Willis Windows client.** Open Workspace → Clients Hub → Edit profile, pick a niche from the dropdown (or leave Custom if none fit), save. The home-services niche is not yet authored, so most fits will be "Custom" for now.
2. **Tune the three starter playbooks.** The agent authored drafts from generic Hauck Marketing knowledge. Open the Niche Playbooks page and edit each one to reflect real past-client experience: which offers actually performed, which angles got the cheapest CPLs, what the benchmark targets really are based on your data.
3. **Author the next niche.** Home services is the obvious gap given Willis Windows is currently in the book. Use the in-app Add niche modal. ~2 hours per niche of content writing once the framework is in place.
4. **Wire more forms to playbook prefill (optional).** Today: Hooks, Creative Brief, Ad Copy. Candidates for expansion: Offer + CTA, Competitor Research, Audience Research. One-line addition per form in `app/src/lib/formConfigs.ts` (`prefillFromPlaybook`).

### Still parked
- **Reverse-flow capture.** Phase 2 in the original plan. When Jake makes the same non-obvious edit to a niche default across 3+ clients, surface a Morning Briefing prompt: "Update the dental playbook with this?" Not built yet.
- **Multi-niche clients.** One niche per client, by design.
- **Auto-generating playbooks from past client folders.** Manual authoring only for v1.
- **Per-niche benchmarks auto-applied to the Ads Manager.** Wiring playbook benchmarks into the dashboard as a fallback is a small follow-up.
