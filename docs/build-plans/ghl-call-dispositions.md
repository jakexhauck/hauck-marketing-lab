# GHL call dispositions drive the Cold Call tracker (backend)

## Frame

- **What:** a disposition picked in GoHighLevel's dialer records the cold call outcome in the app, the same as pressing the button did. Meetings booked come from the "Hauck Marketing Demo Call - Cold Call" calendar.
- **Why:** Jake is moving fully to GoHighLevel for calls (2026-09-30). Callbacks are a GHL follow-up, meetings are booked in GHL.
- **Done:** a GHL workflow webhook turns the contact's pending dial into the outcome, applies the same tags and lead changes, and the tracker counts calendar bookings by the day they were booked.
- **Out of scope here:** removing the Power dialer page (UI pass, later). Both paths coexist: first answer wins.

## Decisions

- Endpoint `POST /api/crm/call-disposition?token=<WEBHOOK_SECRET>`. Public path, same shared secret as `/api/webhook` (same trust level, no new secret to set).
- Body is tolerant: `contactId` / `contact_id` / `customData.contactId`; `outcome` (our key) or `disposition` (the GHL label, which matches `DIAL_OUTCOMES[].label`). Optional `callId`, `userEmail`. `location.id` / `locationId` must equal `AGENCY_GHL_LOCATION_ID` when present.
- Matching: newest pending dial for the contact's lead in the last 2 hours; exact `call_message_id` wins when `callId` is sent. None found: run the power dialer sync once, then retry. Still none: a judged row within 15 min means "already recorded" (no-op); otherwise insert a judged row (the sync later stamps it with the call, never duplicates it).
- Caller: `userEmail` matched to `admin_accounts`, else the pending row's caller, else `resolveCronCaller`.
- Lead fields per outcome: same as the CallWorkspace buttons (status, no_answer, last_contact, first_contact_date, follow_up_date).
- Meetings: from `MEETINGS_FROM_CALENDAR = 2026-10-01`, a day's meetings = non-excluded Cold Call calendar `sales_calls` rows by `created_at` in the agency zone; a `booked` dial no longer adds a meeting on those days. Credited to `booked_by`, else the caller of the latest dial on that lead, else `logged_by`.
- Cron: every 5th minute the cold-call sync runs the agency meetings sync (narrow window: -2h to +60d) INSTEAD of the dialer sync, to stay under the 50 subrequest cap.

## Files

1. `functions/lib/coldCallDisposition.ts` (+ test): `parseDisposition`, `leadFieldsForOutcome`, `pickDispositionDial`.
2. `functions/lib/coldCallOutcomePush.ts`: `pushLead` + `countNoAnswers` moved out of `cold-call/dials.ts`, shared.
3. `functions/lib/powerDialerSync.ts`: export `resolveLead`.
4. `functions/api/crm/call-disposition.ts`: the endpoint.
5. `functions/api/_middleware.ts`: public path.
6. `functions/lib/coldCallMeetings.ts` (+ test): `MEETINGS_FROM_CALENDAR`, `addCalendarMeetings`, `creditMeetings`.
7. `functions/lib/coldCallDials.ts`: booked dials stop counting as meetings from the cutoff.
8. `functions/lib/coldCallAgency.ts`, `functions/api/admin/tracker/cold-calls.ts`: read and merge calendar meetings.
9. `functions/api/admin/cold-call/sync.ts`: 5th-minute meetings sync.
10. `src/lib/releaseNotes.ts`, `blueprint/index.html`.

## GHL side (after ship)

One workflow per disposition in Cold Calling > Call Dispositions: trigger Call Details (outbound, disposition = X), action Webhook POST to the endpoint with custom data `outcome` and `contactId`. Prove the payload with one real call.
