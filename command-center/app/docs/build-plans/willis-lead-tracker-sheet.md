# Willis Windows lead tracker: the Google Sheet

**Decided 2026-08-12 with Jake.** A Willis-only Google Sheet the owner works out
of: every lead lands in it by itself, they mark the outcome, and a booked
appointment shows the day and the time without anybody typing it.

Not a replacement for the Command Center's Paid Ads tracker. The owner lives in
a spreadsheet, so the spreadsheet is where the outcome gets marked.

## The four decisions

| Question | Answer |
|---|---|
| How leads arrive | Automatically, on a timer, no typing |
| Which sheet | A new Willis-only workbook, the demo template left alone |
| Which leads | **Every** lead, any source, not just the ads funnel |
| Who edits it | Jake only, until he shares it |

## Columns

Grey blocks are written by the sync and locked. The blue block is the only
thing the owner touches.

| # | Column | Filled by | Source |
|---|---|---|---|
| A | Date In | sync | contact `dateAdded`, Detroit time |
| B | Name | sync | first + last |
| C | Phone | sync | contact |
| D | Email | sync | contact |
| E | Address | sync | address1, city, state, postal, one line |
| F | Home Type | sync | survey `home_type` |
| G | Timeline | sync | survey `timeline` |
| H | Appt Day | sync | GHL calendar event, `ddd, mmm d` |
| I | Appt Time | sync | same event, `h:mm AM/PM` |
| J | **Status** | **owner** | dropdown, eight options |
| K | **Job Value** | **owner** | currency |
| L | **Notes** | **owner** | free text |
| M | Offer | sync | survey `offer` |
| N | Source | sync | contact `source` |
| O | Campaign | sync | first-touch attribution |
| P | Ad | sync | first-touch attribution |
| Q | GHL Contact ID | sync | hidden, the upsert key |
| R | Appt ID | sync | hidden, how "booked" is detected once |

**Source (N) was not in the layout Jake approved.** It was added because he then
chose every lead from any source: without it a referral and a Facebook lead are
indistinguishable on the row. Say the word and it goes.

Second tab, **Booked Appointments**: a formula view of the same rows, upcoming
only, soonest first. No second sync, no second copy of the truth.

## Status

Eight options: New Lead, Contacted, No Answer, Follow Up, Appointment Booked,
Quoted, Won, Lost.

Two of them set themselves, per Jake: everything else is the owner choosing.

- **New Lead** is written once, when the row is created.
- **Appointment Booked** is written once, the first time the sync sees an
  appointment for that contact (row R was empty and GHL now has an event).

That "once" is the whole trick. If the sync re-asserted a status on every run,
an owner who marked a booked lead **Won** would watch it flip back to
Appointment Booked ten minutes later, and would stop trusting the sheet by the
end of the first day. The appointment day and time keep updating after that;
only the status is left alone.

## How the data gets there

```
Apps Script (bound to the sheet, timer every 10 min)
  -> GET /api/sheets/leads?token=…&tenant=willis-windows
       -> GHL: contacts, custom fields, calendar events
  <- JSON rows
  -> upsert into the sheet, keyed on GHL contact id
```

The GHL token stays server-side. The sheet holds only a shared secret
(`SHEETS_SYNC_TOKEN`, Doppler) in Script Properties, and that secret can read
one client's leads and write nothing.

Rejected: the Apps Script calling GHL directly. It would put a GHL private
token in a spreadsheet the client will eventually own, and re-implement the
attribution and appointment joins that already exist in `functions/lib`.

### Files

| File | What |
|---|---|
| `functions/lib/sheetLeads.ts` | shaping: contacts + events -> sheet rows |
| `functions/lib/sheetLeads.test.ts` | the shaping and the once-only rules |
| `functions/api/sheets/leads.ts` | the endpoint, token-guarded |
| `functions/api/_middleware.ts` | `/api/sheets/leads` added to PUBLIC_PATHS |
| `functions/lib/env.ts` | `SHEETS_SYNC_TOKEN` |
| `sheets/willis-lead-tracker.gs` | the Apps Script Jake pastes |

Appointments reuse `loadAppointmentsByContact` from `lib/leadWhen.ts`: one call
per calendar for the whole list, not one per lead. Campaign and Ad come from
`firstTouchAttribution` in `lib/adAttribution.ts`, reading `contact.attributions`
off the bulk list, **not** the `utm_*` custom fields, which were measured empty
across 100 live Willis contacts on 2026-07-19.

## What will be blank on day one, and why

Home Type, Timeline and Offer are custom fields on the contact. The funnel posts
them, but only the GHL workflow in
`docs/build-plans/willis-ads-funnel-golive.md` §2.4 writes them onto the
contact, and that workflow is still on Jake's blocker list. Until it is built,
those three columns are empty for new leads and every other column is real.

The sheet does not fake them. An empty cell is the honest answer.

## Verification

1. `npx wrangler pages dev` on 8788, hit the endpoint with the real token,
   confirm real Willis names come back and note which fields are empty.
2. Paste the script, run `setup()`, run `sync()`, confirm rows land.
3. Change a status by hand, run `sync()` again, confirm it is not overwritten.
4. Only then deploy.
