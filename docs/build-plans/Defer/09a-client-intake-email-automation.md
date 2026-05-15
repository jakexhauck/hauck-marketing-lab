# Client Intake — Welcome Email Automation (deferred)

**Status:** Not built. Jake deferred this; the form works end-to-end without it.

## The intent

When a client submits the intake form (`mockups/forms/client-intake/variant-a-stepped-wizard.html`), they should automatically receive a welcome email confirming receipt and pointing them to the next step (booking the onboarding call). All of this happens before any human at Hauck touches the submission.

The email itself is built and sent by GoHighLevel — not by our code. The intake form's only job is to make sure GHL knows a submission landed; GHL's workflow engine handles the rest.

## How it will work when wired up

```
Client submits intake form
        ↓
Apps Script handler writes row to Sheet + saves uploaded files to Drive
        ↓
Apps Script ALSO posts to GHL: create-contact with tag `intake-submitted`
        ↓
GHL Workflow listens for: "contact tagged `intake-submitted`"
        ↓
GHL fires: welcome email template + optional SMS confirmation
        ↓
(later) The HML app polls GHL for `intake-submitted` contacts and creates
        the matching client folder/profile/opportunity.
```

The point: GHL stays the system of record for clients and their journey. The form's submission lands in two places — the Sheet (for our own auditing) and GHL (so workflows fire automatically).

## What needs to happen to turn this on

### 1. GHL workflow setup (Jake — ~10 min, one time)

1. Log into GHL → **Automation → Workflows → + Create Workflow**
2. **Trigger:** Contact Tag Added → `intake-submitted`
3. **Actions (in order):**
   - **Send Email** — template "New Client Intake — Welcome"
     - Subject: `Welcome to Hauck Marketing — next steps inside`
     - Body: thanks for submitting, what to expect, **link to onboarding calendar**, set the tone
   - *(optional)* **Send SMS** — short confirmation
   - **Add to Pipeline** — Onboarding pipeline, stage 1 ("Onboarding Call")
   - **Add Tag** — `intake-processed` (lets app know it's been handled)
4. Publish the workflow.

### 2. Update the Apps Script handler (developer — ~15 min)

Edit `mockups/forms/client-intake/apps-script.gs` `doPost()` to also call GHL's API after writing the Sheet row:

```javascript
// After sheet.appendRow(...) succeeds:
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

### 3. GHL Custom Fields (Jake — ~5 min, one time)

The `customFields` array above references custom field keys. GHL must have these defined first:

In GHL → **Settings → Custom Fields → Contact**, create these as Text fields:
- `ein`
- `cities_serviced`
- `main_services`
- `facebook_url`
- `website_url`
- `assets_drive_url`
- `common_faqs`
- `past_offers`
- `notification_preference`
- `intake_notes`
- `past_customers_file_url`
- `current_customers_file_url`

### 4. Apps Script credentials (Jake — ~3 min)

In the Apps Script editor → Project Settings → Script Properties → add:
- `GHL_TOKEN` — Private Integration Token (same one stored in the app's `ghl_config.json`)
- `GHL_LOCATION_ID` — same location ID

## What "done" looks like

Client fills out form → sees success page redirecting to calendar → 30 seconds later they have a welcome email in their inbox with a link to book the call. No human in the loop until the call itself.

## Open questions (resolve before building)

- **Email design.** Use Jake's existing welcome email template, or write a new one specific to this flow? The form intake is a different context than the manual handoff he used before.
- **SMS option.** Worth sending an SMS confirmation? Some clients prefer it; others find it pushy. Default: no SMS unless Jake explicitly wants one.
- **Failure handling.** If the GHL API call fails (token expired, rate limited), the Sheet row still lands but the email never fires. Worth a Slack/email alert to Jake when this happens, vs. just logging the error to the Apps Script execution log. Probably the latter is fine for v1 — Jake can manually check the sheet and re-tag the contact.

## Related files

- `mockups/forms/client-intake/variant-a-stepped-wizard.html` — the form itself
- `mockups/forms/client-intake/apps-script.gs` — current handler (no GHL call yet)
- `app/src-tauri/src/ghl.rs` — reference shape for GHL API calls (the app uses the same endpoint and headers)
- `app/src/lib/ghlSync.ts` — onboarding stage mapping (Phase 1 now "Onboarding Call")
