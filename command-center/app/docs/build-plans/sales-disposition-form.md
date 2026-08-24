# Sales disposition form: GHL form drives the Sales Data sheet

Written 2026-08-24. Supersedes `post-call-form-column.md` (its stamping half is
folded in here unchanged in spirit). Decisions taken with Jake on 2026-08-24.

## What changes, and why

The end-of-call recorder is now Jake's GoHighLevel disposition form, not the
in-app panel. After a sales call Jake opens the prospect's prefilled form from
the Sales Data sheet, fills it, submits, and a GHL workflow posts the answers
to `/api/webhook`. The app stamps them onto that contact's meeting row in
`public.sales_calls`, and every cell on the Sales Data sheet fills itself.

Decisions locked with Jake:

1. **Workflow webhook**, not polling. Same endpoint every other workflow uses.
2. **Forward only.** No backfill of past meetings.
3. **Owner only.** No caller-facing surface changes.
4. **GHL handles all CRM moves** (tags, pipeline, opportunity value). The app
   writes only its own tables on this path.
5. **The form fully replaces the in-app end-of-call panel.** No Calls tab
   returns. `RecordPanel` and its hooks stay dormant and unreachable; deleting
   them later is separate housekeeping.
6. **Follow Up is undated.** `follow_up_at` stays null; the sheet counts it as
   Follow-Up immediately.
7. **Revenue Generated feeds Revenue; Cash Collected feeds Cash Collected.**

## The two workflows (Jake builds these in GHL, Hauck Marketing agency sub-account)

### A. Stamp the form URL when a meeting confirms

| Piece | Value |
|---|---|
| Trigger | Appointment Status = Confirmed, filtered to the sales-call calendar(s) |
| Action | Webhook POST |
| URL | `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>` |

Body:

```json
{
  "type": "PostCallForm",
  "locationId": "{{location.id}}",
  "contactId": "{{contact.id}}",
  "formUrl": "https://link.hauckmarketing.com/widget/form/RaoIfnclY5sytH5ndisi?phone={{contact.phone}}"
}
```

House rules (`docs/HOOKUP-RUNBOOK.md`): `locationId` mandatory, `type`
case-sensitive, leave `id` out.

### B. Post the form's answers when it is submitted

| Piece | Value |
|---|---|
| Trigger | Form Submitted, form = the RaoIfnclY5sytH5ndisi disposition form |
| Action | Webhook POST to the same URL |

Body (map each value to the matching form-answer custom value):

```json
{
  "type": "SalesDisposition",
  "locationId": "{{location.id}}",
  "contactId": "{{contact.id}}",
  "phone": "{{contact.phone}}",
  "status": "<appointment status radio>",
  "cashCollected": "<how much cash collected>",
  "revenueGenerated": "<how much revenue generated>",
  "paymentPlatform": "<payment platform>",
  "recordingLink": "<call recording>",
  "feedback": "<feedback for appointment>"
}
```

## The mapping

The form (fetched live from GHL, location `OznT3yyuwK3dqVXDsCaD`) asks seven
things. Radio values are exact strings:

| Form answer | Lands in `sales_calls` |
|---|---|
| Status `PIF` or `Deposit` | `outcome='closed'` |
| Status `No-Close` | `outcome='not_interested'` |
| Status `No-Show` | `outcome='no_show'` |
| Status `Follow Up` | `outcome='follow_up'`, `follow_up_at` stays null |
| Status `Unqualified` | `outcome='not_qualified'`, `qualified=false` |
| Status `Cancelled` | `appointment_status='cancelled'`, outcome left null |
| How Much Cash Collected? | `cash_collected` |
| How Much Revenue Generated | `revenue_generated` |
| Payment Platform | `payment_platform` |
| Call Recording | `recording_link` |
| Feedback For Appointment | `scratchpad` (appended, capped 4000) |

Rules:

- A blank or unrecognised `status` stamps the free-text fields but never
  invents an outcome. Partial submissions are safe.
- Matching: by `ghl_contact_id` from `contactId`; fallback on normalised phone
  (digits only, last ten). Target row: that contact's most recent meeting with
  a null outcome. No such row means nothing happens and it is only logged, so
  duplicate submissions find the row already recorded and no-op. Retries free.
- `revenue_generated` is stored raw. The sheet shows it on a close, falling
  back to `contractValue(parseDeal(deal))` for rows the old panel recorded,
  which keep working untouched.
- Cancelled touches `appointment_status`, which calendar sync otherwise owns.
  Accepted deliberately: the form is what happened. If GHL still says
  confirmed, the sync may flip it back, and the fix is cancelling in GHL too.

## File-by-file

1. `supabase/migrations/0122_sales_disposition.sql`: on `public.sales_calls`,
   add `post_call_form_url text not null default ''`,
   `payment_platform text not null default ''`,
   `recording_link text not null default ''`,
   `revenue_generated numeric null`. Column comments name their source.
2. `functions/lib/salesDisposition.ts` (new, pure):
   `STATUS_OUTCOMES` map, `parseStatus(raw)` returning
   `{ outcome, qualified, cancelAppointment } | null`,
   `parseMoney(raw)` tolerating `$1,200` / `1200.50` / blank,
   `pickTargetCall(rows, contactId, phone)` implementing the selection rule,
   `isAllowedFormUrl(url)` against
   `https://link.hauckmarketing.com/widget/form/`.
   Reuse `internalRecipients.n()` for phone digits.
3. `functions/lib/ghlEvents.ts`: optional fields on `GhlWebhookEvent`:
   `contactId, phone, status, cashCollected, revenueGenerated,
   paymentPlatform, recordingLink, feedback, formUrl`.
4. `functions/api/webhook.ts`: handle `type === "PostCallForm"` and
   `type === "SalesDisposition"` before the unmapped-type early return, beside
   the confirmation flip. Resolve tenant, then `ctx.waitUntil(stamp...)`.
   Best-effort, failures through `logErrorBestEffort`, never non-200 to GHL.
   Each stamps an audit line (`salescall.form_url`,
   `salescall.disposition`).
5. `functions/api/admin/tracker/sales-data.ts`: SELECT gains the four columns;
   `toRow` passes them through.
6. `functions/lib/salesSheetRows.ts`: `SalesCallRow` and `SheetCall` gain
   `postCallFormUrl, paymentPlatform, recordingLink`;
   `SheetCall.revenue` prefers `revenueGenerated` on a close.
7. `src/lib/salesSheet.ts`: `sheetRow` emits real values instead of the three
   hardcoded empty strings; `SheetRow` carries `postCallFormUrl` for the
   renderer. Update `salesSheet.test.ts` expectations.
8. `src/components/admin/tracker/SalesSheet.tsx` and the mobile path in
   `DailyTracker`: Post Call Form cell renders an anchor ("Open form", new
   tab) when the row has a URL and is not cancelled; faint dash otherwise.
   One behaviour on desktop and mobile.
9. `app/docs/connections/sales-disposition.md` (new): both workflows, both
   payloads, where `WEBHOOK_SECRET` lives, what the app does, how to test.

Tests: `functions/lib/salesDisposition.test.ts` covering every radio string,
an unknown one, blank ones, money parsing, target picking (skips recorded rows,
skips other contacts, most-recent-first, phone fallback), and the URL
allowlist.

## Verify

1. Unit: `npm test`. Build: `npm run typecheck && npm run build`. Then
   `npm run db:migrate`.
2. curl a hand-built `SalesDisposition` payload for a contact owning nothing:
   200, nothing stamped, nothing erroring.
3. curl a `PostCallForm` payload with a foreign-host URL: dropped and logged.
4. Jake fires workflow A on a dummy confirmed appointment: Sales Data shows
   Open form on that row; clicking it opens the form with the phone filled.
5. Jake submits the form on that dummy: the row flips to the chosen outcome;
   Payment Type, Recording, Revenue, Cash fill; notes carry the feedback.
6. Re-fire both: still one stamped row each.

Visual proof: Playwright screenshot of a month view with one dispositioned row
between awaiting neighbours.

## Ship

Commit, push, watch the Pages deploy, smoke-test the live page. Then Jake
publishes both workflows if not already; events fired before this shipped were
acked and ignored, so anything confirmed early needs one manual re-fire.

## Out of scope

Deleting `RecordPanel` / `useColdCall` meeting hooks (dormant, harmless);
restoring any Calls tab (refused); backfilling history (forward only); the app
writing tags or opportunity values on this path (GHL owns CRM moves).
