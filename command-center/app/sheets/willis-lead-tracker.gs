/**
 * Willis Windows lead tracker: the Apps Script bound to the Google Sheet.
 *
 * Paste this into Extensions > Apps Script on the sheet, set the three script
 * properties, run setup() once. See docs/build-plans/willis-lead-tracker-sheet.md
 * and the README beside this file.
 *
 * What it does, every ten minutes:
 *   GET /api/sheets/leads   ->   upsert rows, keyed on the GHL contact id
 *
 * What it never does: touch Status, Job Value or Notes on a row that already
 * exists. Those three columns belong to the owner. The one exception is
 * documented on STATUS_ON_BOOKING below, and it fires once per lead.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Script properties (Project Settings > Script properties), so no secret is
// ever typed into a cell:
//   API_URL    https://<the command center host>/api/sheets/leads
//   API_TOKEN  the SHEETS_SYNC_TOKEN value from Doppler
//   TENANT     willis-windows

var TAB_LEADS = 'Lead Tracker';
var TAB_APPTS = 'Booked Appointments';
var TIMEZONE = 'America/Detroit';

var HEADER_ROW = 3;
var DATA_START = 4;

// Column numbers, 1 based. Change one and change HEADERS with it.
var COL = {
  dateIn: 1,
  name: 2,
  phone: 3,
  email: 4,
  address: 5,
  homeType: 6,
  timeline: 7,
  apptDay: 8,
  apptTime: 9,
  status: 10,
  jobValue: 11,
  notes: 12,
  offer: 13,
  source: 14,
  campaign: 15,
  ad: 16,
  contactId: 17,
  apptId: 18
};
var LAST_COL = COL.apptId;

var HEADERS = [
  'Date In', 'Name', 'Phone', 'Email', 'Address', 'Home Type', 'Timeline',
  'Appt Day', 'Appt Time',
  'Status', 'Job Value', 'Notes',
  'Offer', 'Source', 'Campaign', 'Ad',
  'GHL Contact ID', 'Appt ID'
];

var STATUSES = [
  'New Lead',
  'Contacted',
  'No Answer',
  'Follow Up',
  'Appointment Booked',
  'Quoted',
  'Won',
  'Lost'
];

var STATUS_NEW = 'New Lead';
var STATUS_ON_BOOKING = 'Appointment Booked';

// Statuses the sync will not overwrite when an appointment first appears. A
// job booked after the deal is already Won must not drag the row backwards.
var STATUS_FINAL = ['Won', 'Lost'];

// The owner's three columns. Never written on an existing row.
var OWNER_COLS = [COL.status, COL.jobValue, COL.notes];

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lead Tracker')
    .addItem('Sync now', 'sync')
    .addSeparator()
    .addItem('First time setup', 'setup')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Builds both tabs, the dropdown, the formats and the ten minute trigger.
 * Safe to run again: it rebuilds the furniture and leaves the data alone.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TIMEZONE);

  var sheet = ss.getSheetByName(TAB_LEADS);
  if (!sheet) {
    // A brand new spreadsheet arrives with one sheet called Sheet1. Rename it
    // rather than leaving an empty tab beside the real one.
    var first = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && first.getLastRow() === 0) {
      first.setName(TAB_LEADS);
      sheet = first;
    } else {
      sheet = ss.insertSheet(TAB_LEADS, 0);
    }
  }

  buildHeader_(sheet);
  applyColumnFormats_(sheet);
  applyStatusRules_(sheet);
  sizeColumns_(sheet);
  sheet.setFrozenRows(HEADER_ROW);
  sheet.hideColumns(COL.contactId, 2);

  buildAppointmentsTab_(ss);
  installTrigger_();

  SpreadsheetApp.getUi().alert(
    'Set up.\n\nThe sheet will pull leads every 10 minutes. ' +
    'Use Lead Tracker > Sync now to pull immediately.'
  );
}

function buildHeader_(sheet) {
  var width = LAST_COL;

  sheet.getRange(1, 1, 1, width).breakApart();
  sheet.getRange(2, 1, 1, width).breakApart();

  sheet.getRange(1, 1, 1, COL.apptTime).merge()
    .setValue('Willis Windows: Lead Tracker')
    .setFontSize(14)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#0b2a4a')
    .setVerticalAlignment('middle');
  sheet.getRange(1, COL.status, 1, width - COL.status + 1).merge()
    .setValue('')
    .setBackground('#0b2a4a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('right')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);

  var bands = [
    { from: COL.dateIn, to: COL.timeline, label: 'FILLS IN BY ITSELF', bg: '#eef2f6', fg: '#4a5b6b' },
    { from: COL.apptDay, to: COL.apptTime, label: 'THEIR APPOINTMENT', bg: '#e3eefb', fg: '#1c4b82' },
    { from: COL.status, to: COL.notes, label: 'YOU FILL THIS IN', bg: '#fdf1dc', fg: '#8a5a10' },
    { from: COL.offer, to: COL.apptId, label: 'WHERE THE LEAD CAME FROM', bg: '#eef2f6', fg: '#4a5b6b' }
  ];
  for (var i = 0; i < bands.length; i++) {
    var b = bands[i];
    sheet.getRange(2, b.from, 1, b.to - b.from + 1).merge()
      .setValue(b.label)
      .setBackground(b.bg)
      .setFontColor(b.fg)
      .setFontSize(9)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }

  sheet.getRange(HEADER_ROW, 1, 1, width)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setFontSize(10)
    .setBackground('#f7f9fb')
    .setFontColor('#131a20')
    .setBorder(null, null, true, null, null, null, '#c8d2dc', SpreadsheetApp.BorderStyle.SOLID);
}

function applyColumnFormats_(sheet) {
  var rows = Math.max(sheet.getMaxRows() - HEADER_ROW, 1);
  sheet.getRange(DATA_START, COL.dateIn, rows, 1).setNumberFormat('mmm d, yyyy');
  sheet.getRange(DATA_START, COL.apptDay, rows, 1).setNumberFormat('ddd, mmm d');
  sheet.getRange(DATA_START, COL.apptTime, rows, 1).setNumberFormat('h:mm am/pm');
  sheet.getRange(DATA_START, COL.jobValue, rows, 1).setNumberFormat('$#,##0.00');
  sheet.getRange(DATA_START, COL.notes, rows, 1).setWrap(true);
  sheet.getRange(DATA_START, 1, rows, LAST_COL).setVerticalAlignment('middle');
}

function applyStatusRules_(sheet) {
  var rows = Math.max(sheet.getMaxRows() - HEADER_ROW, 1);
  var statusRange = sheet.getRange(DATA_START, COL.status, rows, 1);

  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true)
      .setAllowInvalid(false)
      .setHelpText('Pick a status from the list.')
      .build()
  );

  // The owner reads this sheet by colour before they read it by word.
  var colours = [
    { value: 'New Lead', bg: '#fff4d6', fg: '#7a5300' },
    { value: 'Contacted', bg: '#e7f0f9', fg: '#1c4b82' },
    { value: 'No Answer', bg: '#f1f3f5', fg: '#5a6672' },
    { value: 'Follow Up', bg: '#fde9d5', fg: '#8a4b10' },
    { value: 'Appointment Booked', bg: '#d9e9fb', fg: '#0a4a91' },
    { value: 'Quoted', bg: '#e8e3f7', fg: '#4a3287' },
    { value: 'Won', bg: '#d8f0dd', fg: '#155e30' },
    { value: 'Lost', bg: '#f7dcdc', fg: '#8a1f1f' }
  ];
  var rules = [];
  for (var i = 0; i < colours.length; i++) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(colours[i].value)
        .setBackground(colours[i].bg)
        .setFontColor(colours[i].fg)
        .setRanges([statusRange])
        .build()
    );
  }
  sheet.setConditionalFormatRules(rules);
}

function sizeColumns_(sheet) {
  var widths = {};
  widths[COL.dateIn] = 95;
  widths[COL.name] = 165;
  widths[COL.phone] = 125;
  widths[COL.email] = 215;
  widths[COL.address] = 245;
  widths[COL.homeType] = 145;
  widths[COL.timeline] = 130;
  widths[COL.apptDay] = 105;
  widths[COL.apptTime] = 90;
  widths[COL.status] = 160;
  widths[COL.jobValue] = 100;
  widths[COL.notes] = 260;
  widths[COL.offer] = 210;
  widths[COL.source] = 140;
  widths[COL.campaign] = 210;
  widths[COL.ad] = 210;
  for (var col in widths) {
    sheet.setColumnWidth(Number(col), widths[col]);
  }
}

/**
 * The appointments view. One formula, no second copy of the data: it reads the
 * Lead Tracker tab, so it can never disagree with it.
 */
function buildAppointmentsTab_(ss) {
  var sheet = ss.getSheetByName(TAB_APPTS);
  if (!sheet) sheet = ss.insertSheet(TAB_APPTS);
  sheet.clear();

  sheet.getRange(1, 1, 1, 7).merge()
    .setValue('Booked Appointments: what is coming up, soonest first')
    .setFontSize(13)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#0b2a4a')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  sheet.getRange(2, 1, 1, 7)
    .setValues([['Day', 'Time', 'Name', 'Phone', 'Address', 'Status', 'Notes']])
    .setFontWeight('bold')
    .setBackground('#f7f9fb');

  var t = "'" + TAB_LEADS + "'!";
  var formula =
    '=IFERROR(SORT(FILTER({' +
      t + 'H' + DATA_START + ':H,' +
      t + 'I' + DATA_START + ':I,' +
      t + 'B' + DATA_START + ':B,' +
      t + 'C' + DATA_START + ':C,' +
      t + 'E' + DATA_START + ':E,' +
      t + 'J' + DATA_START + ':J,' +
      t + 'L' + DATA_START + ':L},' +
      t + 'H' + DATA_START + ':H>=TODAY()),1,TRUE),' +
    '"Nothing booked yet.")';
  sheet.getRange(3, 1).setFormula(formula);

  sheet.getRange(3, 1, sheet.getMaxRows() - 2, 1).setNumberFormat('ddd, mmm d');
  sheet.getRange(3, 2, sheet.getMaxRows() - 2, 1).setNumberFormat('h:mm am/pm');
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 170);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 250);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 260);
  sheet.setFrozenRows(2);
}

function installTrigger_() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'sync') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

function sync() {
  var payload = fetchLeads_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB_LEADS);
  if (!sheet) throw new Error('No "' + TAB_LEADS + '" tab. Run First time setup.');

  var result = writeRows_(sheet, payload.rows || []);

  var stamp = Utilities.formatDate(new Date(), TIMEZONE, "MMM d 'at' h:mm a");
  var note = 'Last updated ' + stamp + '  (' + result.added + ' new, ' +
    result.updated + ' updated)';
  if (payload.capped) {
    note += '  NOTE: only the most recent 2000 contacts are shown.';
  }
  sheet.getRange(1, COL.status).setValue(note);

  return result;
}

function fetchLeads_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('API_URL');
  var token = props.getProperty('API_TOKEN');
  var tenant = props.getProperty('TENANT') || 'willis-windows';

  if (!url || !token) {
    throw new Error(
      'Missing API_URL or API_TOKEN in Project Settings > Script properties.'
    );
  }

  // The token travels in a header, not the query string, so it stays out of
  // the execution log and out of anything the sheet can display.
  var res = UrlFetchApp.fetch(url + '?tenant=' + encodeURIComponent(tenant), {
    method: 'get',
    headers: { 'x-webhook-token': token },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    throw new Error('Lead feed returned ' + code + ': ' + body.slice(0, 300));
  }
  return JSON.parse(body);
}

/**
 * The upsert. Existing rows have their automatic columns refreshed and their
 * three owner columns left exactly as they were. New rows go in at the top,
 * because a lead that came in ten minutes ago is the one being looked for.
 */
function writeRows_(sheet, rows) {
  var lastRow = sheet.getLastRow();
  var count = Math.max(lastRow - DATA_START + 1, 0);

  // One read of everything, then all the work happens in memory. Reading or
  // writing cell by cell is what turns a few hundred leads into a script that
  // times out.
  var indexById = {};
  var existingStatus = [];
  var existingApptId = [];
  var leftBlock = [];
  var rightBlock = [];
  if (count > 0) {
    var block = sheet.getRange(DATA_START, 1, count, LAST_COL).getValues();
    for (var i = 0; i < count; i++) {
      leftBlock.push(block[i].slice(0, COL.apptTime));
      rightBlock.push(block[i].slice(COL.offer - 1, LAST_COL));
      existingStatus[i] = String(block[i][COL.status - 1] || '').trim();
      existingApptId[i] = String(block[i][COL.apptId - 1] || '').trim();
      var id = String(block[i][COL.contactId - 1] || '').trim();
      if (id) indexById[id] = i;
    }
  }

  var fresh = [];
  var statusEdits = [];
  var updated = 0;

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var id = String(row.contactId || '').trim();
    if (!id) continue;

    if (indexById.hasOwnProperty(id)) {
      var at = indexById[id];
      leftBlock[at] = leftCells_(row);
      rightBlock[at] = rightCells_(row);
      updated++;

      // The one automatic status change after a row exists: the first time GHL
      // shows this lead an appointment. Once only, and never over a decision
      // the owner has already made.
      var newAppt = String(row.apptId || '').trim();
      if (newAppt && !existingApptId[at] && !isFinalStatus_(existingStatus[at])) {
        statusEdits.push({ row: DATA_START + at, value: STATUS_ON_BOOKING });
      }
    } else {
      fresh.push(row);
    }
  }

  if (count > 0) {
    sheet.getRange(DATA_START, COL.dateIn, count, COL.apptTime).setValues(leftBlock);
    sheet.getRange(DATA_START, COL.offer, count, LAST_COL - COL.offer + 1).setValues(rightBlock);
  }
  for (var s = 0; s < statusEdits.length; s++) {
    sheet.getRange(statusEdits[s].row, COL.status).setValue(statusEdits[s].value);
  }

  if (fresh.length > 0) {
    sheet.insertRowsBefore(DATA_START, fresh.length);
    var block2 = [];
    for (var f = 0; f < fresh.length; f++) {
      block2.push(fullRow_(fresh[f]));
    }
    var range = sheet.getRange(DATA_START, 1, fresh.length, LAST_COL);
    range.setValues(block2);
    // Inserted rows inherit the header's formatting, so every format the new
    // rows need is re-applied rather than assumed.
    formatRows_(sheet, DATA_START, fresh.length);
  }

  return { added: fresh.length, updated: updated };
}

function isFinalStatus_(status) {
  for (var i = 0; i < STATUS_FINAL.length; i++) {
    if (STATUS_FINAL[i] === status) return true;
  }
  return false;
}

// Columns A to I, the identity of the lead and when they are booked in.
function leftCells_(row) {
  var appt = toDate_(row.apptAt);
  return [
    toDate_(row.dateIn),
    row.name || '',
    row.phone || '',
    row.email || '',
    row.address || '',
    row.homeType || '',
    row.timeline || '',
    appt || '',
    appt || ''
  ];
}

// Columns M to R, where the lead came from plus the two hidden keys.
function rightCells_(row) {
  return [
    row.offer || '',
    row.source || '',
    row.campaign || '',
    row.ad || '',
    row.contactId || '',
    row.apptId || ''
  ];
}

function fullRow_(row) {
  var left = leftCells_(row);
  var right = rightCells_(row);
  // A lead that arrives already booked says so from its first minute, rather
  // than reading New Lead beside an appointment time.
  var status = row.apptId ? STATUS_ON_BOOKING : STATUS_NEW;
  return left.concat([status, '', '']).concat(right);
}

function toDate_(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d;
}

function formatRows_(sheet, startRow, numRows) {
  sheet.getRange(startRow, 1, numRows, LAST_COL)
    .setBackground(null)
    .setFontColor('#131a20')
    .setFontWeight('normal')
    .setFontSize(10)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setBorder(null, null, null, null, null, null);
  sheet.getRange(startRow, COL.dateIn, numRows, 1).setNumberFormat('mmm d, yyyy');
  sheet.getRange(startRow, COL.apptDay, numRows, 1).setNumberFormat('ddd, mmm d');
  sheet.getRange(startRow, COL.apptTime, numRows, 1).setNumberFormat('h:mm am/pm');
  sheet.getRange(startRow, COL.jobValue, numRows, 1).setNumberFormat('$#,##0.00');
  sheet.getRange(startRow, COL.notes, numRows, 1).setWrap(true);
  sheet.getRange(startRow, COL.status, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true)
      .setAllowInvalid(false)
      .setHelpText('Pick a status from the list.')
      .build()
  );
}
