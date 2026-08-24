# Sales disposition form (GHL form drives Sales Data)

The end-of-call recorder for Jake's own sales calls is a GoHighLevel form, not
an app surface. After a call Jake opens the prospect's prefilled form from the
Sales Data sheet's **Post Call Form** column, fills it, submits, and the sheet
fills itself. Plan: `docs/build-plans/sales-disposition-form.md`.

## The pieces

| Piece | Where |
|---|---|
| Form | `RaoIfnclY5sytH5ndisi` on the Hauck Marketing location (`OznT3yyuwK3dqVXDsCaD`) |
| Workflow A | Appointment Status = Confirmed -> posts the form URL (`PostCallForm`) |
| Workflow B | Form Submitted on that form -> posts the answers (`SalesDisposition`) |
| Endpoint | `POST https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>` |
| App handler | `functions/lib/salesDispositionApply.ts`, routed in `functions/api/webhook.ts` |

`WEBHOOK_SECRET` lives in Doppler / wrangler vars, same value as every other
workflow webhook. House rules: `locationId` is mandatory, `type` is
case-sensitive, leave `id` out.

## Workflow A body (stamps the link)

```json
{
  "type": "PostCallForm",
  "locationId": "{{location.id}}",
  "contactId": "{{contact.id}}",
  "formUrl": "https://link.hauckmarketing.com/widget/form/RaoIfnclY5sytH5ndisi?phone={{contact.phone}}"
}
```

The app accepts only URLs starting with
`https://link.hauckmarketing.com/widget/form/`, picks that contact's most
recent meeting with no outcome yet, earliest tie-break none, and writes
`post_call_form_url`. Sales Data renders it as an **Open form** link (quiet on
a cancelled row).

## Workflow B body (lands the answers)

Map each value to the matching form answer custom value:

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

Mapping onto `public.sales_calls`:

| Answer | Column | Notes |
|---|---|---|
| Status PIF / Deposit | `outcome='closed'` | both mean closed |
| No-Close | `outcome='not_interested'` | |
| No-Show | `outcome='no_show'` | |
| Follow Up | `outcome='follow_up'` | `follow_up_at` stays null, due immediately |
| Unqualified | `outcome='not_qualified'` | also sets `qualified=false` |
| Cancelled | `appointment_status='cancelled'` | no outcome; cancel in GHL too or the calendar sync may flip it back |
| Cash Collected | `cash_collected` | feeds the Cash tile |
| Revenue Generated | `revenue_generated` | preferred over deal arithmetic on a close |
| Payment Platform | `payment_platform` | Payment Type column |
| Call Recording | `recording_link` | Recording column |
| Feedback | `scratchpad` | appended, capped at 4000 chars |

## Rules worth remembering

- Matching is by contact id first, normalised phone second.
- Only a meeting with NO outcome yet can be stamped, most recent first. Every
  meeting recorded means nothing happens, so retries and double submissions
  are free.
- An unknown or blank status stamps free text only and never invents an
  outcome.
- The app writes NOTHING back to GHL on this path. Tags, pipeline stages and
  opportunity values are GHL automations' job.

## Testing it

1. curl a payload with a contact owning no meeting: 200, nothing stamped,
   nothing in error_log.
2. curl workflow A with a foreign-host `formUrl`: dropped and logged.
3. Fire workflow A on a dummy confirmed appointment: Open form appears on the
   row and opens with the phone prefilled.
4. Submit the form on that dummy: outcome pill, Payment Type, Recording,
   Revenue, Cash and notes all land.
5. Re-fire both workflows: still one stamped row each.
