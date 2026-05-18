# New-Client Flow, intake to launch

> Status: Calendar code built (awaiting Jake's setup). Welcome email deferred. Cascade + sequence wizard proposed.
> Effort: ~25 min for calendar activation. ~15 min for welcome email Apps Script tweak (+10 min GHL workflow). 1 day for cascade. 2-3 days for sequence wizard.
> Why this matters: A signed client today triggers 6 separate form runs across 24 hours. Three signings in one week and steps get skipped. This builds the no-touch path from intake submission to ads launched.
> Depends on: Activity + Briefing doc (every step logs an activity event).

## What this build replaces

Four earlier docs (now merged): the custom booking page, the welcome-email automation, the one-click Phase-1 cascade, and the onboarding sequence wizard. They all serve the same arc.

## The arc, four stages

```
Stage 1: Booking (intake form + calendar)         ← code built, awaiting Jake's setup
Stage 2: Day-0 cascade (welcome email, contract)  ← proposed
Stage 3: Onboarding sequence wizard               ← proposed
Stage 4: Ads launched                             ← exit
```

---

## Stage 1, Booking page + welcome email

### What's built

A fully custom, app-themed booking page (`mockups/forms/onboarding-calendar/variant-a-stepped.html`) that books appointments into Jake's existing GHL onboarding calendar. Clients see the Hauck Marketing visual identity end-to-end; no GHL chrome anywhere. GHL stays the system of record. All of its workflows (confirmations, reminders, pipeline updates) fire automatically.

### Architecture

```
Client browser
  loads variant-a-stepped.html (static, hosted on Cloudflare)
  clicks date → JS calls Apps Script GET ?action=slots
  picks time + details → JS calls Apps Script POST { action: 'book' }
    ↓
Apps Script Web App
  holds GHL token (script properties, not exposed to client)
  GET slots  → GHL /calendars/<id>/free-slots
  POST book  → GHL /contacts/search (upsert) → /calendars/events/appointments
    ↓
GoHighLevel
  free-slots respects: calendar availability hours + two-way Google sync
  appointment create fires: workflows, email/SMS confirm, calendar invite
    ↓
Google Calendar (Jake's), event lands here via GHL's two-way sync
```

Single source of truth: GHL. Google Calendar is connected to GHL via two-way sync, so anything on Jake's personal Google Calendar automatically blocks bookings, and anything booked through the custom page lands on his Google Calendar instantly.

### Calendar ID

`NK53JD0np0dfOaRpmUWh`, Jake's GHL Onboarding Call calendar. Goes into Apps Script `GHL_CALENDAR_ID` script property.

### Files

- `mockups/forms/onboarding-calendar/variant-a-stepped.html`: the booking page (production-ready, `MOCK_MODE` auto-disables when `APPS_SCRIPT_URL` is configured).
- `mockups/forms/client-intake/apps-script.gs`: multi-action proxy (intake submission + calendar slots + booking). One Web App URL for everything.
- `mockups/forms/client-intake/variant-a-stepped-wizard.html`: intake form; success state redirects to the calendar URL.

### Activation checklist (Jake, ~25 min one-time)

**1. GHL two-way Google Calendar sync (~5 min).**
- GHL → **Settings → My Profile → Calendar Settings → Calendar Integrations**.
- Connect Google account.
- Pick which Google Calendars block bookings (personal, work, family, whichever should block).
- Two-way sync on primary Hauck calendar.
- GHL → **Settings → Calendars → Onboarding Call** (`NK53JD0np0dfOaRpmUWh`):
  - Confirm availability hours (e.g., Mon-Fri 9am-5pm Eastern).
  - Confirm 30-min duration + 15-min buffer.
  - Confirm max bookings per day (4 recommended).

**2. GHL Private Integration Token (~3 min).** If not already created:
- Settings → Private Integrations → + Create New Integration.
- Scopes: `calendars.readonly`, `calendars/events.write`, `contacts.readonly`, `contacts.write`.
- Copy token. The token in `ghl_config.json` may already have the right scopes; check first.

**3. Apps Script setup (~7 min).**
- Open the **Hauck — Client Intake Submissions** sheet.
- **Extensions → Apps Script**.
- Delete whatever's there. Paste `mockups/forms/client-intake/apps-script.gs`.
- Save. Project name: **Hauck Intake + Booking Handler**.
- Left sidebar → **gear icon → Script Properties → Add script property**, four total:
  - `FOLDER_ID` = Drive folder ID (from earlier intake setup)
  - `GHL_TOKEN` = PIT
  - `GHL_LOCATION_ID` = GHL location ID (same one the app uses)
  - `GHL_CALENDAR_ID` = `NK53JD0np0dfOaRpmUWh`
- Save script properties.

**4. Apps Script deploy (~3 min).**
- Top-right → **Deploy → New deployment**.
- Gear next to "Select type" → **Web app**.
- Description: `Intake + Booking v1`.
- Execute as: **Me**. Who has access: **Anyone**.
- Deploy. Authorize (Advanced → "Go to ... (unsafe)" → Allow).
- Copy the **Web App URL** (looks like `https://script.google.com/macros/s/AKfycb.../exec`).

**5. Wire URLs (~2 min).**
- `variant-a-stepped.html`: `const APPS_SCRIPT_URL = '<Web App URL>';`.
- `variant-a-stepped-wizard.html`: `const ONBOARDING_CALENDAR_URL = '<public calendar page URL>';` (e.g. `https://intake.hauckmarketing.com/book`).

**6. Hosting on Cloudflare Pages (~5 min).**
- Cloudflare → Workers & Pages → Create application → Pages → Upload assets.
- Drag `mockups/forms/` contents (or set up GitHub auto-deploy).
- Custom domain: add `intake.hauckmarketing.com`.
- Add the CNAME record at the registrar.

**7. Smoke test (~5 min).**
- Open the deployed calendar page in incognito.
- Pick a date, confirm slots load (Network tab should hit Apps Script URL).
- Pick a slot, fake name + email, click Confirm.
- Verify: GHL contact created, GHL appointment, Google Calendar event with Zoom link.

### Verification, what to check after a real booking

- **GHL → Calendars → Onboarding Call**: appointment present at the right time.
- **GHL → Contacts**: contact exists, has tag `booked-onboarding-call`.
- **Google Calendar**: event exists, has Zoom link.
- **Sheet**: intake submission row (separate flow; bookings don't write to the Sheet).

### Welcome email automation (deferred, ~25 min when ready)

The intake form's only job is to make sure GHL knows a submission landed. GHL's workflow engine handles the welcome email + SMS + pipeline assignment.

**1. GHL workflow (~10 min).** Automation → Workflows → + Create Workflow.
- Trigger: Contact Tag Added → `intake-submitted`.
- Actions:
  - **Send Email**, template "New Client Intake, Welcome", subject "Welcome to Hauck Marketing, next steps inside", body with thanks + what to expect + link to onboarding calendar.
  - *(optional)* **Send SMS**, short confirmation.
  - **Add to Pipeline**: Onboarding, stage 1 ("Onboarding Call").
  - **Add Tag** `intake-processed` (lets app know it's been handled).
- Publish.

**2. Apps Script tweak (~15 min).** Edit `apps-script.gs` `doPost()` so it also calls GHL contacts API after `sheet.appendRow(...)`:

```javascript
const ghlToken = PropertiesService.getScriptProperties().getProperty('GHL_TOKEN');
const ghlLocationId = PropertiesService.getScriptProperties().getProperty('GHL_LOCATION_ID');

UrlFetchApp.fetch('https://services.leadconnectorhq.com/contacts/', {
  method: 'post',
  contentType: 'application/json',
  headers: {
    Authorization: `Bearer ${ghlToken}`,
    Version: '2021-07-28',
  },
  payload: JSON.stringify({
    locationId: ghlLocationId,
    firstName: (payload.full_name || '').split(' ')[0],
    lastName: (payload.full_name || '').split(' ').slice(1).join(' '),
    email: payload.email,
    phone: payload.phone,
    companyName: payload.legal_business,
    address1: payload.street,
    city: payload.city,
    state: payload.state,
    postalCode: payload.postal,
    country: payload.country,
    timezone: payload.timezone,
    source: 'Hauck Marketing Lab Intake Form',
    tags: ['intake-submitted'],
    customFields: [
      { key: 'ein', field_value: payload.ein },
      { key: 'cities_serviced', field_value: payload.cities },
      { key: 'main_services', field_value: payload.services },
      { key: 'facebook_url', field_value: payload.facebook },
      { key: 'website_url', field_value: payload.website },
      { key: 'assets_drive_url', field_value: payload.assets_url },
      { key: 'common_faqs', field_value: payload.faqs },
      { key: 'past_offers', field_value: payload.offers },
      { key: 'notification_preference', field_value: payload.notify },
      { key: 'intake_notes', field_value: payload.notes },
      { key: 'past_customers_file_url', field_value: pastUrl },
      { key: 'current_customers_file_url', field_value: currentUrl },
    ],
  }),
  muteHttpExceptions: true,
});
```

**3. GHL Custom Fields (~5 min).** Settings → Custom Fields → Contact. Add as Text fields: `ein`, `cities_serviced`, `main_services`, `facebook_url`, `website_url`, `assets_drive_url`, `common_faqs`, `past_offers`, `notification_preference`, `intake_notes`, `past_customers_file_url`, `current_customers_file_url`.

**4. Apps Script credentials (~3 min).** Project Settings → Script Properties → add (if not already present from booking setup):
- `GHL_TOKEN`, Private Integration Token.
- `GHL_LOCATION_ID`, location ID.

### Known limitations / future work

- **Timezone:** v1 hardcodes `America/New_York`. Eventually let clients see slots in their local time.
- **One calendar only:** v1 books into a single calendar. If we add more meeting types later, the calendar ID becomes a URL param or per-page config.
- **No reschedule UI:** clients reschedule by emailing back or using GHL-generated link in confirmation. Custom reschedule is its own build.
- **No payment gating:** the form + calendar are open. Add per-client token check in Apps Script later if needed.
- **Failure handling.** If GHL API fails (token expired, rate limited), the Sheet row still lands but the email never fires. v1: log to Apps Script execution log, Jake can manually re-tag.

---

## Stage 2, Day-0 cascade

### Why this matters

Phase 1 ("Close the Deal") has 6 deliverables: welcome email, contract, expectations email, kickoff invite, intake form share, and Profile.md creation. Every new client = 6 deliberate form opens within 24 hours of signing.

When you sign one client a month this is fine. When you sign one a week, and especially when a single great outreach campaign produces three signings in one day, you start to skip steps. The cascade removes the decision count.

### What we have today

- 17 forms in `formConfigs.ts`. Phase 1 forms: `welcome-email`, `contract`, `expectations-email`, plus the new-client profile form.
- `OnboardingChecklist.tsx`, tracks per-task completion.
- `Profile.md` per client + `prefillFromProfile` already wires shared fields between forms.

### What "done" looks like

1. **"Mark client Won" button** on Client Hub. Already partially exists via `OpsClientRow`. Confirm it fires the cascade hook.
2. **One modal** opens with Phase 1 checklist + per-form draft preview:
   - ☑ Welcome email, draft generated, shown in modal.
   - ☑ Expectations email, draft.
   - ☑ Contract, draft.
   - ☑ Kickoff calendar invite, pre-filled (link to onboarding calendar from `Profile.md`).
   - ☑ Intake form share, link copied.
3. **Approve each (or batch approve all).** Jake reviews drafts in-place. One click per item or "Approve all" at the bottom.
4. **Sends + saves fire in parallel.** Drafts go to Gmail (or Instantly if email-sender is wired from Outreach doc). Files save to `vault/Clients/<name>/onboarding/`.
5. **Activity log line per action.** `phase1_welcome_sent`, `phase1_contract_sent`, etc.
6. **Onboarding checklist auto-ticks** those tasks done with timestamps.

Total time from "Won" click to all sent: ~3 minutes of review, vs. ~45 minutes of context switching today.

### Build steps

1. **Cascade definition (`app/src/lib/cascades.ts`).** Declarative spec: `PHASE_1_CASCADE = [{ formId: 'welcome-email', autofillFrom: 'profile' }, { formId: 'contract', ... }, ...]`. One place to add/remove steps without code changes elsewhere.

2. **Bulk runner.** For each step in the cascade: load form config, build values from `prefillFromProfile`, render the prompt via `assembleGenericPrompt`, run `claude -p` in parallel via `Promise.all`. Stream all 5-6 results into a single modal as they complete.

3. **Modal (`Phase1CascadeModal.tsx`).** Each step is a collapsible card: status (pending → generating → ready → approved → sent), preview of output, edit button (opens the underlying form for tweaks), approve checkbox. Footer: "Approve all 6" big button + per-step state count.

4. **Send actions.** Wire to existing send paths (Gmail draft today, full send if Outreach doc shipped). Calendar invite via Google Calendar API via existing OAuth in `google_oauth_secrets.rs`.

5. **Onboarding checklist auto-tick.** On send-success per step, call existing `markOnboardingTaskComplete(client_slug, task_id)`. Stamp with timestamp + "auto-cascade" flag (honest audit trail).

6. **Failure recovery.** If one step fails (LLM error, send failure), the rest still proceed. Failed step stays in the modal until manually retried. "Skip this step" option for any item Jake intentionally wants to do later.

### Open decisions

- **Should the cascade run automatically on "Won" click, or only when Jake confirms?** Recommend: cascade opens but does NOT auto-send. Jake reviews every draft before send.
- **What lives in Phase 2-6 cascades later?** Out of scope here. The abstraction in step 1 should be reusable.
- **Contract generation.** Currently produces markdown. Recommend manual countersign + PDF for v1; DocuSign/PandaDoc later.

### Out of scope

- Phase 2-6 cascades (Phase 2 = Onboarding Call deliverables, Phase 3 = Technical Setup, etc.). Build the abstraction here; expand later.
- Auto-sending without Jake review. Always human-in-the-loop.
- Contract e-signing integrations. Manual countersign for v1.

### Effort + leverage

- 1 day.
- Per-new-client savings: ~40 minutes.
- At 1 new client/week: 35 hrs/year. At 2/week: 70 hrs/year.

---

## Stage 3, Onboarding sequence wizard

### Why this matters

New clients today require Jake to know which form to open next, in what order, with which prior outputs in hand. The OnboardingChecklist tracks *that* a thing happened; it doesn't *guide* the next form. Mirror the OutreachSequencePage model: a stepper that walks the new client from signed → launched, with each form's output auto-feeding the next.

### What we have today

- **`OutreachSequencePage`**, proven stepper pattern: scrape → mockup → DM → summary, shared state, resumable.
- **`OnboardingChecklist`**, per-client phased checklist, tracks completion, syncs phase completion to GHL pipeline. Does not run forms.
- **Forms in scope:** `onboarding-calendar`, `audience-research`, `ad-copy`, `web-designer`, `pre-launch-qa`.
- **`prefillFromProfile`** already wires Profile.md fields into forms. The sequence extends this to chain step N → N+1.
- **Client Hub** has tab pages (`Overview`, `Campaigns`, `Resources`, etc.).

### What "done" looks like

1. **New "Sequence" tab on Client Hub.** Visible while the client is onboarding. Hidden after Jake clicks "Mark launched."
2. **5-step stepper**, top-of-page like OutreachSequencePage:
   1. Onboarding Calendar, confirm call booked.
   2. Audience Builder, competitors + audience saved.
   3. Ad Copy Generator, 10+ variations approved.
   4. Web Designer, landing page generated.
   5. Pre-launch QA, pixel + payment + client approval.
3. **Each step auto-prefills from prior outputs.** Audience → ad-copy `audience` field. Ad-copy → web-designer `headlines` field. User can edit anything before submitting.
4. **State persists per-client** in `vault/Clients/<name>/onboarding.json`. New `sequence` block: `{ currentStep, stepOutputs: { stepId: { path, completedAt } } }`.
5. **"Mark launched" button** at the bottom of step 5. Sets `adsLaunchedAt` on the client + flips `sequenceComplete: true`. Sequence tab disappears; standalone form access is the only entry point thereafter.
6. **Onboarding checklist auto-ticks** the matching task when each step completes. Activity log line per step.
7. **Resumable.** Closing and reopening lands on `currentStep`. Completed steps show a green checkmark + "View output" link to the saved file in `vault/Clients/<name>/onboarding/`.

### Build steps

1. **Sequence definition (`app/src/lib/onboardingSequence.ts`).**
```ts
export const ONBOARDING_SEQUENCE: SequenceStep[] = [
  { id: "calendar",  formId: "onboarding-calendar", checklistTaskId: "02-call",      chainFrom: null },
  { id: "audience",  formId: "audience-research",   checklistTaskId: "04-audiences", chainFrom: null },
  { id: "ad-copy",   formId: "ad-copy",             checklistTaskId: "04-copy",      chainFrom: { step: "audience", fields: { audience_summary: "audience" } } },
  { id: "website",   formId: "web-designer",        checklistTaskId: "04-creative",  chainFrom: { step: "ad-copy",  fields: { primary_headline: "hook" } } },
  { id: "qa",        formId: "pre-launch-qa",       checklistTaskId: "05-qa",        chainFrom: null },
];
```
Field-mapping is the only spec that needs maintenance when forms evolve.

2. **Sequence state on disk.** Extend `vault/Clients/<name>/onboarding.json` with a `sequence` key. No migration needed; absent key = step 1, no outputs. New helpers `loadSequenceState(slug)` / `saveSequenceState(slug, state)`.

3. **Output → input bridge.** When step N completes, parse the form output (markdown table for ad-copy, structured JSON for audience) and persist to `sequence.stepOutputs[stepId]`. When step N+1 opens, read `chainFrom`, pull the named field from the prior step's output, prefill into the next form's values **before** `prefillFromProfile` runs (so Profile.md is the fallback, not the override).

4. **Sequence tab UI (`app/src/components/MainDashboard/pages/ClientSequence.tsx`).**
   - Top: stepper showing 1-5 with status badges (done / current / pending / skipped).
   - Body: the form for the current step, rendered via existing `GenericFormGenerator` with prefilled values.
   - Footer: "Save & continue" (advances `currentStep`), "Skip step" (marks skipped, advances), "Back" (re-opens prior step pre-filled with its saved output).
   - Step 5 footer adds the prominent "Mark launched" button, disabled until step 5 has produced an output.

5. **Client Hub tab visibility.** Conditionally render the Sequence tab when `!sequenceComplete`. After launch, tab disappears; users access forms via existing menu. Default landing tab for a new client = Sequence (until launched), then Overview.

6. **"Mark launched" wiring.** Sets `adsLaunchedAt = now`. Sets `sequenceComplete = true`. Fires same auto-tick + activity-log line as a normal step completion.

7. **Failure / partial recovery.** If a `claude -p` call fails mid-step, the form stays open with current values; nothing persisted. Same UX as standalone form runs. If chaining fails (prior output malformed), prefill silently skips that field and logs a console warning. Never block on auto-prefill.

### Open decisions

- **Activity log integration.** The Activity + Briefing doc isn't shipped yet. Write to `vault/Clients/<name>/activity.log` with the same line format anticipated, so this is forward-compatible.
- **What if Jake re-runs a completed step?** Recommend: re-running overwrites saved output and invalidates downstream prefills (next step gets a banner: "Audience was re-generated, review prefilled values before submitting"). Don't auto-rerun downstream.
- **Skip semantics.** Skipped steps don't block "Mark launched". Yellow badge in the stepper. Confirm.
- **Mobile/narrow-screen layout.** Out of scope for v1; Sequence tab assumes desktop, like OutreachSequencePage.

### Out of scope

- **Intake form in the sequence.** Intake runs before the client exists in the vault (it *creates* the client). Sequence starts at the calendar step.
- **Post-launch sequences.** Weekly/monthly reports stay standalone forms.
- **Cross-client batch sequencing.** One client at a time. Multi-client cascade is Stage 2's territory.
- **Re-opening sequence after launch.** Once `sequenceComplete = true`, the tab is gone. Editing happens via standalone form access. Avoids ambiguity about "is this client onboarding or launched?"

---

## Compound effect

Stage 2 (cascade) + Stage 3 (sequence) together cover the full new-client arc:
- Cascade handles the **parallel** Day-0 deliverables (welcome email, contract, kickoff invite).
- Sequence handles the **serial** Day-0-through-launch deliverables (audience → copy → site → QA).

Per-new-client savings: ~40 min from cascade + ~30 min from sequence = ~70 min of context-switching gone. At 1 signing/week: ~60 hours/year. Lubricates every other scaling lever.
