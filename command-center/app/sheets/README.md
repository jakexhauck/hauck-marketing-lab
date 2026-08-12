# Client lead tracker sheets

The Google Sheet a client's owner works out of. Leads arrive by themselves; the
owner marks the outcome. One script per client sheet, one shared endpoint.

- `willis-lead-tracker.gs` is the script for Willis Windows.
- The feed is `GET /api/sheets/leads` (`functions/api/sheets/leads.ts`).
- The reasoning is in `docs/build-plans/willis-lead-tracker-sheet.md`.

## Standing one up

1. Create the spreadsheet in the agency Drive.
2. Extensions > Apps Script. Delete the stub, paste the whole `.gs` file, save.
3. Project Settings > Script properties, add three:

   | Property | Value |
   |---|---|
   | `API_URL` | `https://<command center host>/api/sheets/leads` |
   | `API_TOKEN` | `SHEETS_SYNC_TOKEN` from Doppler |
   | `TENANT` | the tenant slug, e.g. `willis-windows` |

4. Run `setup()` once. Google asks for authorisation the first time: it is your
   own script asking to read one URL and write this sheet.
5. Reload the spreadsheet. A **Lead Tracker** menu appears. Use **Sync now**.

After that it pulls every ten minutes on its own.

## The rule that matters

The script never writes **Status**, **Job Value** or **Notes** on a row that
already exists. Two exceptions, both once per lead:

- a new row is created as **New Lead** (or **Appointment Booked**, if the lead
  booked before the first sync ever saw them);
- an existing row flips to **Appointment Booked** the first time GHL shows it an
  appointment, unless the owner has already marked it Won or Lost.

Anything else the owner types stays typed. If that stops being true, they stop
trusting the sheet, and a sheet the owner does not trust is worse than no sheet.

## Adding another client

Copy the `.gs`, change `TENANT`, `TIMEZONE` and the title strings. The endpoint
is already per-tenant; nothing server-side needs to change.
