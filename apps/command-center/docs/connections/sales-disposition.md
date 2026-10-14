# Post-call form (Sales Data)

What happened on each of Jake's sales calls is recorded in Sales Data itself.
Every meeting on the sheet has an **Open form** button; the form saves straight
onto `public.sales_calls`. Nothing goes through GoHighLevel on this path.

Until 2026-09-28 this was a GHL form (`RaoIfnclY5sytH5ndisi`) with two
workflows posting to `/api/webhook`. It was never submitted once: the workflow
that put the form link on a meeting fired for 1 meeting in 23. The webhook
handlers are gone; turn both workflows off in GHL.

## The pieces

| Piece | Where |
|---|---|
| Calls in | `functions/api/lib/salesCallSync.ts`, reads every calendar named demo/discovery/sales on each page load |
| Form | `src/components/admin/tracker/SalesCallForm.tsx` |
| Rules | `functions/lib/salesDisposition.ts` (pure, tested) |
| Save | `PATCH /api/admin/tracker/sales-data` `{ id, form }` or `{ id, excluded }`, owner only |
| Columns | 0122 (`payment_platform`, `recording_link`, `revenue_generated`), 0135 (`disposition_status`, `excluded_at`) |

## Mapping onto `public.sales_calls`

| Answer | Column | Notes |
|---|---|---|
| Status PIF / Deposit | `outcome='closed'`, `disposition_status` keeps which | |
| No-Close | `outcome='not_interested'` | |
| No-Show | `outcome='no_show'` | |
| Follow Up | `outcome='follow_up'` | |
| Unqualified | `outcome='not_qualified'`, `qualified=false` | |
| Cancelled | `disposition_status='cancelled'`, `outcome=null` | the sync never writes this column, so it cannot flip back |
| Cash Collected | `cash_collected` | |
| Revenue Generated | `revenue_generated` | preferred over deal arithmetic on a close |
| Payment Platform | `payment_platform` | |
| Call Recording | `recording_link` | https links only |
| Feedback | `scratchpad` | replaced, not appended: the form is an editor |

## Rules worth remembering

- A saved form outranks the calendar both ways: form-Cancelled stays cancelled,
  and a calendar-cancelled meeting with a saved outcome counts as that outcome.
- The X on a row sets `excluded_at`. Exited meetings count nowhere on Sales Data
  and are dropped from Sales Calls too. "Show removed" brings one back.
- "N need a form" counts meetings past their time, not cancelled, not exited,
  with no status and no outcome.
- The sync owns `scheduled_at` and `appointment_status`; the form owns
  everything else. Neither writes the other's columns.
