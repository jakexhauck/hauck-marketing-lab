# Post Call Form column on Sales Data

Written 2026-08-23. Wires one of the seven blank columns listed in
"what jake needs to get done": Post Call Form.

## What changes, and why

Sales Data has had a Post Call Form column since it shipped. It renders a faint
dash because nothing feeds it (`src/lib/salesSheet.ts:253`). The form itself
lives in GoHighLevel: a disposition form whose first question is a hidden phone
field, so a submission attaches itself to the right contact without the closer
typing anything.

The decision taken on 2026-08-23: **GoHighLevel tells the app about the form,
the app stores and shows it.** A workflow fires when an appointment is
confirmed and posts the pre-filled form URL into the same `/api/webhook`
endpoint every other workflow already uses. The endpoint stamps it onto that
contact's meeting row in `public.sales_calls`, and the column renders it as a
clickable link beside the appointment time.

Why store rather than compose: the URL shape belongs to whoever owns the
automation. Swapping the form later is a one-line edit in the GHL workflow, not
a deploy. The app's only opinions are the allowlisted host it will accept and
which row gets stamped.

## The contract

Workflow (built by Jake in the Hauck Marketing agency sub-account):

| Piece | Value |
|---|---|
| Trigger | Appointment Status = Confirmed |
| Filter | In calendar: the sales-call calendar(s), optional but recommended |
| Action | Webhook, POST |
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

Rules carried over from the house conventions (`docs/HOOKUP-RUNBOOK.md`):
`locationId` is mandatory, `type` is case-sensitive, leave `id` out. This
payload supersedes the earlier chat version that sent `phone`; the workflow
sends the whole URL so the app never needs to know a form id.

What the app does with it:

- Accepts the URL only if it starts with
  `https://link.hauckmarketing.com/widget/form/`. Anything else is dropped and
  logged, so a misconfigured workflow cannot write foreign links onto an admin
  surface.
- Picks the target row: that contact's meetings where
  `appointment_status = 'confirmed'` and no form is stamped yet, earliest
  scheduled first. No match means nothing happens. This rule makes retries free:
  a duplicate event finds every row stamped and no-ops.
- Writes the URL to `sales_calls.post_call_form_url`.

The legacy "Post Call Form Submitted -> Update Tracking Sheet" workflow is old
Google Sheet plumbing. It stays untouched and unrelated.

## File-by-file

1. `supabase/migrations/0122_post_call_form_url.sql` - `post_call_form_url text
   not null default ''` on `public.sales_calls`, with a column comment saying
   where it comes from (the GHL workflow, never typed by hand).
2. `functions/lib/postCallForm.ts` (new, pure) - two exports:
   `isAllowedFormUrl(url)` against the host prefix, and
   `pickTargetCall(rows, contactId)` implementing the selection rule above.
   Pure so both are unit-tested without Supabase.
3. `functions/lib/ghlEvents.ts` - optional `formUrl?: string` on
   `GhlWebhookEvent`.
4. `functions/api/webhook.ts` - handle `type === "PostCallForm"` before the
   unmapped-type early return, beside the confirmation flip: resolve tenant,
   then `ctx.waitUntil(stamp...)`. Best-effort off the response path, failures
   through `logErrorBestEffort`, never a non-200 back to GHL.
5. `functions/lib/salesSheetRows.ts` - `SalesCallRow` and `SheetCall` gain
   `postCallFormUrl`; `toSheetCall` maps it straight through.
6. `functions/api/admin/tracker/sales-data.ts` - SELECT gains
   `post_call_form_url`; `toRow` passes it through.
7. `src/lib/salesSheet.ts` - `sheetRow` emits the URL instead of the hardcoded
   empty string.
8. `src/components/admin/tracker/SalesSheet.tsx` - the Post Call Form cell
   renders an anchor ("Open form", new tab) when the row carries a URL and is
   not cancelled; the faint dash otherwise. Check the mobile rendering path of
   DailyTracker and keep one behaviour on both.
9. `app/docs/connections/post-call-form.md` (new) - the connection doc:
   trigger, payload, where WEBHOOK_SECRET lives, what the app does with the
   event, how to test it.

## Verify

Unit: `isAllowedFormUrl` accepts the real form URL and rejects a foreign host,
a bare path, and an empty string; `pickTargetCall` skips cancelled rows, skips
stamped rows, takes the earliest confirmed match, returns null on no match;
`toSheetCall` carries the URL through.

Build: `npm run typecheck && npm test && npm run build`, then
`npm run db:migrate`.

Live, in order:

1. curl a hand-built PostCallForm payload at the production webhook with a
   contactId that owns no meeting: 200 back, nothing stamped, nothing logged as
   an error.
2. Jake fires the published workflow on a dummy contact with a confirmed
   appointment: Sales Data shows Open form on that row, the click opens the
   form with the hidden phone field already filled.
3. Re-fire the same event: still one stamped row, not two.

Visual proof: Playwright screenshot of the month view showing a stamped row
between its unstamped neighbours.

## Ship

Commit, push, watch the Pages deploy, smoke-test the live page. Then Jake
publishes the workflow if he has not already; events fired before this ships
were acked and ignored, so any meeting confirmed early needs one manual
re-fire from the workflow (or a fresh confirm) to catch up.

## Out of scope

The other six blank columns (Set By, Closer, Payment Type, Payments Complete,
Recording, Payment Status). Each needs its own source decision and gets its own
plan.
