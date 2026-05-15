/**
 * Hauck Marketing — single Apps Script proxy for the public-facing site.
 *
 * Three endpoints, one Web App URL:
 *
 *   POST { action: 'submit-intake', ...fields, past_customers, current_customers }
 *     → Saves uploaded files to Drive, appends a row to the linked Sheet.
 *       Used by mockups/forms/client-intake/variant-a-stepped-wizard.html
 *
 *   GET  ?action=slots&startMs=...&endMs=...&timezone=America/New_York
 *     → Proxies GHL /calendars/<id>/free-slots so the public calendar page
 *       can fetch real availability without exposing the GHL token.
 *
 *   POST { action: 'book', startTimeIso, fullName, email, notes }
 *     → Upserts a GHL contact (by email) and creates the appointment on the
 *       configured calendar. GHL fires its own confirmation + reminder
 *       workflows from there.
 *
 *   GET  (no params) → health check, returns { ok: true, service: 'hauck' }.
 *
 * Setup:
 *   1. Open the Sheet "Hauck — Client Intake Submissions"
 *   2. Extensions → Apps Script
 *   3. Paste this entire file (replaces previous version)
 *   4. Project Settings (gear) → Script Properties → add:
 *        FOLDER_ID         = <Drive folder id for intake uploads>
 *        GHL_TOKEN         = <Private Integration Token from GHL>
 *        GHL_LOCATION_ID   = <Location ID from GHL>
 *        GHL_CALENDAR_ID   = NK53JD0np0dfOaRpmUWh
 *   5. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *        Copy the Web App URL.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Column order in the Sheet — must match the row written below.
const HEADERS = [
  'Submitted At',
  'Full Name',
  'Legal Business Name',
  'EIN',
  'Street Address',
  'City',
  'State',
  'Country',
  'Postal Code',
  'Phone',
  'Email',
  'Past Customers (file)',
  'Current Customers (file)',
  'Assets Drive Link',
  'Facebook Page',
  'Website',
  'Cities Serviced',
  'Main Services',
  'Notification Preference',
  'Common FAQs',
  'Time Zone',
  'Offers / Promotions',
  'Additional Notes',
];

// ─── Routing ─────────────────────────────────────────────────

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    switch (payload.action) {
      case 'submit-intake':
        return handleIntake_(payload);
      case 'book':
        return handleBooking_(payload);
      default:
        // Back-compat: old form versions don't send `action`.
        return handleIntake_(payload);
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'slots') return handleSlots_(e.parameter);
    return json_({ ok: true, service: 'hauck', ts: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ─── Intake form submission ──────────────────────────────────

function handleIntake_(payload) {
  const folderId = scriptProp_('FOLDER_ID', { required: true });
  const folder = DriveApp.getFolderById(folderId);
  const submittedAt = new Date().toISOString();
  const slug = slugify_(payload.legal_business || payload.full_name || 'submission');
  const stamp = submittedAt.replace(/[:.]/g, '-');

  const subfolder = folder.createFolder(`${slug} — ${stamp}`);
  const pastUrl = saveFile_(subfolder, payload.past_customers, 'past-customers');
  const currentUrl = saveFile_(subfolder, payload.current_customers, 'current-customers');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    submittedAt,
    payload.full_name || '',
    payload.legal_business || '',
    payload.ein || '',
    payload.street || '',
    payload.city || '',
    payload.state || '',
    payload.country || '',
    payload.postal || '',
    payload.phone || '',
    payload.email || '',
    pastUrl || '',
    currentUrl || '',
    payload.assets_url || '',
    payload.facebook || '',
    payload.website || '',
    payload.cities || '',
    payload.services || '',
    payload.notify || '',
    payload.faqs || '',
    payload.timezone || '',
    payload.offers || '',
    payload.notes || '',
  ]);

  return json_({ ok: true });
}

// ─── Calendar: free-slots proxy ──────────────────────────────

function handleSlots_(params) {
  const calendarId = scriptProp_('GHL_CALENDAR_ID', { required: true });
  const startMs = params.startMs;
  const endMs = params.endMs;
  const timezone = params.timezone || 'America/New_York';
  if (!startMs || !endMs) {
    return json_({ ok: false, error: 'startMs and endMs are required' });
  }

  const url = `${GHL_BASE}/calendars/${calendarId}/free-slots`
    + `?startDate=${encodeURIComponent(startMs)}`
    + `&endDate=${encodeURIComponent(endMs)}`
    + `&timezone=${encodeURIComponent(timezone)}`;

  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: ghlHeaders_(),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code < 200 || code >= 300) {
    return json_({ ok: false, error: `GHL free-slots ${code}: ${body}` });
  }
  return json_({ ok: true, slots: JSON.parse(body) });
}

// ─── Calendar: create booking ────────────────────────────────

function handleBooking_(payload) {
  const calendarId = scriptProp_('GHL_CALENDAR_ID', { required: true });
  const locationId = scriptProp_('GHL_LOCATION_ID', { required: true });
  const { startTimeIso, fullName, email, notes } = payload;
  if (!startTimeIso || !fullName || !email) {
    return json_({ ok: false, error: 'startTimeIso, fullName, and email are required' });
  }

  // 1. Upsert contact by email.
  const contactId = upsertContact_(locationId, fullName, email);

  // 2. Create appointment.
  const apptResp = UrlFetchApp.fetch(`${GHL_BASE}/calendars/events/appointments`, {
    method: 'post',
    contentType: 'application/json',
    headers: ghlHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({
      calendarId: calendarId,
      locationId: locationId,
      contactId: contactId,
      startTime: startTimeIso,
      title: `Kickoff call — ${fullName}`,
      appointmentStatus: 'confirmed',
      ignoreDateRange: false,
      toNotify: true,
      notes: notes || '',
    }),
  });
  const code = apptResp.getResponseCode();
  const body = apptResp.getContentText();
  if (code < 200 || code >= 300) {
    return json_({ ok: false, error: `GHL appointment ${code}: ${body}` });
  }
  const parsed = JSON.parse(body);
  return json_({
    ok: true,
    appointmentId: parsed.id || (parsed.event && parsed.event.id) || null,
    contactId: contactId,
  });
}

function upsertContact_(locationId, fullName, email) {
  // Look up by email first.
  const lookup = UrlFetchApp.fetch(`${GHL_BASE}/contacts/search`, {
    method: 'post',
    contentType: 'application/json',
    headers: ghlHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({
      locationId: locationId,
      filters: [{ field: 'email', operator: 'eq', value: email }],
      pageLimit: 1,
    }),
  });
  if (lookup.getResponseCode() < 300) {
    const parsed = JSON.parse(lookup.getContentText());
    const found = parsed.contacts && parsed.contacts[0];
    if (found && found.id) return found.id;
  }

  // Create if not found.
  const parts = fullName.trim().split(/\s+/);
  const create = UrlFetchApp.fetch(`${GHL_BASE}/contacts/`, {
    method: 'post',
    contentType: 'application/json',
    headers: ghlHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({
      locationId: locationId,
      firstName: parts[0] || fullName,
      lastName: parts.slice(1).join(' '),
      name: fullName,
      email: email,
      source: 'Hauck Marketing — Onboarding Calendar',
      tags: ['booked-onboarding-call'],
    }),
  });
  const code = create.getResponseCode();
  const body = create.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(`GHL create contact ${code}: ${body}`);
  }
  const parsed = JSON.parse(body);
  const id = parsed.contact && parsed.contact.id;
  if (!id) throw new Error('GHL create contact: no id in response');
  return id;
}

// ─── Helpers ─────────────────────────────────────────────────

function ghlHeaders_() {
  return {
    Authorization: 'Bearer ' + scriptProp_('GHL_TOKEN', { required: true }),
    Version: GHL_API_VERSION,
    Accept: 'application/json',
  };
}

function scriptProp_(key, opts) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if ((!v || !v.trim()) && opts && opts.required) {
    throw new Error(`Script property ${key} not set.`);
  }
  return v;
}

function saveFile_(folder, fileObj, baseName) {
  if (!fileObj || !fileObj.dataBase64) return '';
  const bytes = Utilities.base64Decode(fileObj.dataBase64);
  const mime = fileObj.mimeType || 'application/octet-stream';
  const name = fileObj.name || `${baseName}.bin`;
  const blob = Utilities.newBlob(bytes, mime, name);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function slugify_(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
