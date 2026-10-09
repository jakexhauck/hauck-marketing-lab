# Ads Dashboard: estimates, jobs and real pickups

Status: BUILT 2026-10-09, NOT LIVE. Branch `worktree-ads-dashboard-metrics` (commits `d14fd805`, `df25696d`), worktree `.claude/worktrees/ads-dashboard-metrics`. Migration 0153 applied to prod.

## What it is

New clients (tenants.estimate_tracking, on by default for every client created from 2026-10-09; Willis, Made Better, AAG and every older client off) count the Ads Dashboard this way, as agreed with Jake 2026-10-09:

| Metric | How |
|---|---|
| Leads | Meta |
| Pickup % | Picked up ÷ leads called. Claude Haiku reads each outbound call transcript, else 30s+ counts; a lead texting or calling in counts. Calls only, never a tap on a page |
| Estimates | Appointment on the calendar named *Estimate* (Home Estimate), cancelled included |
| Estimate % | Estimates ÷ all leads |
| Jobs | Sold tap on the estimate outcome link (customer_jobs row) |
| Revenue | The $ entered on Sold |
| Cost / Lead, Cost / Estimate, Cost / Job | Spend ÷ each |

Per-ad Breakdown shows the same Estimates, Jobs and three costs.

## The three owner links (GHL custom values, filled by the app on Link / Provision)

| Custom value | Page | Buttons |
|---|---|---|
| Call Now Link | /api/call-now | Call now (tags `call-now`, GHL rings owner and bridges) |
| Lead Outcome Link | /api/lead-outcome | Estimate booked (Home Estimate time) / Call back later (day + time, reminder via tag `call-back-due`) / Not interested (reason) |
| Estimate Outcome Link | /api/estimate-outcome | Sold ($ + must book on Job calendar) / Not sold (reason) / Rescheduled (new time) / No-show |

Workflow text is identical in every sub-account: `{{custom_values.<name>}}&c={{contact.id}}`. Only the custom values differ per client (location id + HMAC key).

Calendars (Home Estimate, Job), pipeline (Sales Pipeline) and stages are found by NAME. Keep the names exact in the snapshot.

## Meta

- Purchase with $ on Sold, to the client's dataset (Client > GHL > CAPI).
- Schedule for estimates: cron calls `/api/admin/ads/capi-schedule?scope=estimate`, estimate-model clients only. Willis stays browser-side.

## Me (on Jake's go)

1. Push both commits to main (the Lead Tracker session on main has an overlapping uncommitted edit in `leadTrackerData.ts`; one small merge).
2. Deploy `workers/ads-cron` (PICKUPS_URL + CAPI_SCHEDULE_URL now set).
3. Push Test v2 custom values from the app.
4. Live test end to end: test lead, every outcome on both pages, dashboard numbers, GHL appointments and stages, capi_sent rows.
5. Delete this plan in the shipping commit; move Jake's items to the action items README.

## Jake, in Test v2

1. Turn on Call Recording + Transcription.
2. Save your cell on your GHL user.
3. Home Estimate + Job calendars: team member + availability.
4. New Lead Text workflow: ring owner, then SMS with Call + Log outcome links.
5. Missed Call Text workflow.
6. Call Now workflow (tag `call-now`).
7. Call Back Reminder workflow (tag `call-back-due`: SMS owner, remove tag).
8. Estimate Outcome workflow (Customer Booked Appointment on Home Estimate, wait 1h after start, SMS owner, allow re-entry).
9. Add `&h_ad_id={{ad.id}}` to the Meta UTMs.
10. Save Meta dataset ID + token on Test v2's CAPI page.
11. Snapshot Test v2 once it works.

Per new client after that: load snapshot, link in the app, then recording, calendar team members, owner cell, CAPI page.

## Decisions open

1. Go live now or wait for the Lead Tracker session.
2. Job outcome link (Done / Rescheduled / Cancelled after the job), or keep Sold = job.
3. Switch Above All Garage Doors to the new model.

## Known gaps

- Hand-typed and call-in leads carry no ad id.
- Personal-cell calls do not count toward Pickup %.
- Unknown whether GHL re-runs the estimate Wait after a reschedule; check in the test, add an Appointment Status trigger if not.
- No admin switch for estimate_tracking yet; flipped in the database.
- Call-back reminders run on the hourly cron (:07), so up to an hour late.
