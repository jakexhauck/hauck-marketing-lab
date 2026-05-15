# Custom Onboarding Calendar

**Status:** Code built. Awaiting Jake's one-time GHL + Apps Script + hosting setup.

A fully custom, app-themed booking page (`mockups/forms/onboarding-calendar/variant-a-stepped.html`) that books appointments into Jake's existing GHL onboarding calendar. Clients see the Hauck Marketing visual identity end-to-end — no GHL chrome anywhere. GHL stays the system of record; all of its workflows (confirmations, reminders, pipeline updates) fire automatically.

## Architecture

```
Client browser  ─────────────────────────────────────────────────────
  │
  │  loads variant-a-stepped.html (static page, hosted on Cloudflare)
  │  clicks date → JS calls Apps Script GET ?action=slots
  │  picks time, enters details → JS calls Apps Script POST { action: 'book' }
  ▼
Apps Script Web App ─────────────────────────────────────────────────
  │  holds GHL token (script properties — not exposed to client)
  │  GET slots  →  GHL /calendars/<id>/free-slots
  │  POST book  →  GHL /contacts/search (upsert) → /calendars/events/appointments
  ▼
GoHighLevel  ────────────────────────────────────────────────────────
  │  free-slots respects: calendar availability hours + two-way Google sync
  │  appointment create fires: workflows, email/SMS confirm, calendar invite
  ▼
Google Calendar (Jake's) — event lands here via GHL's two-way sync
```

**Single source of truth:** GHL. Google Calendar is connected to GHL via two-way sync, so anything on Jake's personal Google Calendar automatically blocks bookings, and anything booked through the custom page lands on his Google Calendar instantly.

## Calendar ID

`NK53JD0np0dfOaRpmUWh` — Jake's GHL Onboarding Call calendar. Goes into Apps Script `GHL_CALENDAR_ID` script property.

## Files

- `mockups/forms/onboarding-calendar/variant-a-stepped.html` — the booking page (production-ready, `MOCK_MODE` auto-disables when `APPS_SCRIPT_URL` is configured)
- `mockups/forms/client-intake/apps-script.gs` — multi-action proxy (intake form submission + calendar slots + booking) — extends the same script the form uses, one Web App URL for everything
- `mockups/forms/client-intake/variant-a-stepped-wizard.html` — intake form; its success state redirects to the calendar URL

## Deployment checklist (Jake's side, one-time, ~25 min)

### 1. GHL — two-way Google Calendar sync (~5 min)

1. GHL → **Settings → My Profile → Calendar Settings → Calendar Integrations**
2. Connect your Google account
3. Pick the Google Calendars you want GHL to check for conflicts (personal, work, family — whichever ones have events that should block bookings)
4. Set sync direction to **two-way** for the primary Hauck calendar (so bookings flow both ways)
5. GHL → **Settings → Calendars → Onboarding Call** (calendar ID `NK53JD0np0dfOaRpmUWh`)
   - Confirm availability hours (e.g., Mon-Fri 9am-5pm Eastern)
   - Confirm 30-min duration + desired buffer (15 min recommended)
   - Confirm max bookings per day (4 recommended)

### 2. GHL — Private Integration Token (~3 min)

If you don't already have a Private Integration Token (PIT):
1. GHL → **Settings → Private Integrations → + Create New Integration**
2. Scopes: `calendars.readonly`, `calendars/events.write`, `contacts.readonly`, `contacts.write`
3. Copy the token — you'll paste it into the Apps Script in step 3.

The token in your local app's `ghl_config.json` may already have the right scopes — check that one first.

### 3. Apps Script — paste + configure (~7 min)

1. Open the Sheet **`Hauck — Client Intake Submissions`** (from the intake-form setup)
2. **Extensions → Apps Script**
3. Delete whatever's there. Paste the contents of `mockups/forms/client-intake/apps-script.gs`.
4. Click the disk/save icon. Project name: **`Hauck Intake + Booking Handler`**
5. Left sidebar → **gear icon (Project Settings) → Script Properties → Add script property**, four total:
   - `FOLDER_ID` = Drive folder ID (from earlier intake setup)
   - `GHL_TOKEN` = Private Integration Token
   - `GHL_LOCATION_ID` = your GHL location ID (same one the app uses)
   - `GHL_CALENDAR_ID` = `NK53JD0np0dfOaRpmUWh`
6. Click **Save script properties**

### 4. Apps Script — deploy as Web App (~3 min)

1. Top-right → blue **Deploy → New deployment**
2. Gear next to "Select type" → **Web app**
3. Description: `Intake + Booking v1`
4. Execute as: **Me**
5. Who has access: **Anyone**
6. Click **Deploy**, authorize (Advanced → "Go to ... (unsafe)" → Allow)
7. Copy the **Web App URL** — looks like `https://script.google.com/macros/s/AKfycb.../exec`

### 5. Wire URLs into the HTML pages (~2 min)

Open `mockups/forms/onboarding-calendar/variant-a-stepped.html`, top of `<script>`:
```javascript
const APPS_SCRIPT_URL = 'PASTE_WEB_APP_URL_HERE';
```

Open `mockups/forms/client-intake/variant-a-stepped-wizard.html`, top of `<script>`:
```javascript
const ONBOARDING_CALENDAR_URL = 'PASTE_CALENDAR_PAGE_PUBLIC_URL_HERE';
// e.g. https://intake.hauckmarketing.com/book
```

### 6. Hosting — Cloudflare Pages (~5 min)

1. Create a free Cloudflare account (or use existing)
2. Workers & Pages → **Create application → Pages → Upload assets**
3. Drag the contents of `mockups/forms/` (or set up the GitHub repo for auto-deploy)
4. Custom domain: add `intake.hauckmarketing.com`
5. Cloudflare gives you a CNAME record to add at your domain registrar — copy/paste it once
6. The form will live at `intake.hauckmarketing.com/client-intake/variant-a-stepped-wizard.html` (we can clean up the URL with a rename to `intake.hauckmarketing.com/` and `intake.hauckmarketing.com/book/`)

### 7. Smoke test (~5 min)

1. Open the deployed calendar page in an incognito window
2. Pick a date → confirm slots load (check Network tab — should hit your Apps Script URL)
3. Pick a slot, fill in fake name + email, click Confirm
4. Verify: GHL contact created, GHL appointment shows up, Google Calendar event appears on your account
5. If anything fails, the page shows the error — paste it to me

## Verification — what to check after a real booking

- **GHL → Calendars → Onboarding Call** — appointment present at the right time
- **GHL → Contacts** — contact exists, has tag `booked-onboarding-call`
- **Google Calendar** — event exists at the right time, has Zoom link (assuming GHL is set to auto-attach Zoom)
- **Sheet** — intake submission row (separate flow; bookings don't write to the Sheet)

## Known limitations / future work

- **Timezone:** v1 hardcodes `America/New_York`. Eventually let the client see slots in their local time.
- **One calendar only:** v1 books into a single calendar. If we add more meeting types later, the calendar ID becomes a URL param or per-page config.
- **No reschedule UI:** clients reschedule by emailing back or using the GHL-generated link in the confirmation email. Custom reschedule would be its own build.
- **No payment gating:** the form + calendar are open. If we later want to gate them behind paid-only, we add a per-client token check in Apps Script.

## Related

- [[client-intake-email-automation]] — welcome email firing from `intake-submitted` tag (deferred)
- [[project-client-intake-form]] — memory note on the intake form direction
