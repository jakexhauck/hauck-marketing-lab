# Sales call outcomes drive the pipeline by TAG

Written 2026-07-29. Replaces the direct stage routing built in Stage 2 of
`agency-ghl-connection.md`.

## What changes, and why

Today the app moves the card itself: press an outcome and
`routeSalesCall` PUTs a pipeline stage and a status onto the opportunity. That
works, but it makes the app a second author of Jake's board, and it means every
automation he wants to hang off a sale (onboarding email, follow-up sequence,
no-show rebook) has to be built into this app rather than into GoHighLevel where
the rest of them live.

The Setter Suite already solved this and the convention is written down in
`src/lib/setterStageActions.ts`: **the app applies ONE tag; the CRM's own
automation moves the opportunity.** Cold Call does the same thing
(`functions/lib/agencyGhl.ts:CC_TAGS`). Sales Calls is the last surface still
writing stages, and this plan brings it into line.

After this, the app writes exactly two things to GoHighLevel:

1. one tag per outcome (and one when a meeting is booked), and
2. the cash amount onto the card when a deal closes, because no workflow can
   know that number.

It writes no stage and creates no opportunity. Jake's workflow creates the card
off the booked tag and moves it thereafter.

## The five buttons, set 2026-07-29

One button per stage, so the board says why a deal is where it is.

| Button | Outcome | Expected stage | Showed? |
|---|---|---|---|
| Showed, closed | `closed` | New Client | yes |
| Showed, needs another | `follow_up` | Follow Up (Jake is adding it) | yes |
| Showed, no close | `no_close` | No-Close | yes |
| Showed, not a fit | `not_a_fit` | Not Interested/Unqualified | yes |
| No-showed | `no_show` | No-Show | no |

`no_close` is new. It splits today's single "not a fit" into "they heard it and
said no" (still a qualified prospect) and "they were never a fit"
(disqualified), which is the distinction the board already has two columns for.

The "expected stage" column is NOT written by the app. It is kept so the Sales
Pipeline page can say "your workflows are expected to move cards into Follow Up
and this board has no such stage", which is a drift check, not an assertion.

## Tag names

Placeholders until Jake supplies the real ones. They live in ONE constant,
`SC_TAGS` in `functions/lib/salesCallTags.ts`, and nothing else in the app spells
a tag out. Renaming them is a one-file edit.

Exactly one `sc ` tag sits on a contact at a time: applying one removes the
others, so a filter on "sc no show" can never return somebody who has since
closed. Same rule as `CC_TAGS`.

## File-by-file

1. `supabase/migrations/0065_sales_call_no_close.sql` - extend the `outcome`
   CHECK constraint to allow `no_close`; add `ghl_tag` so a row records which
   tag was applied rather than a stage the app no longer writes.
2. `functions/lib/salesCalls.ts` - add `no_close` to `SalesCallOutcome` and
   `SALES_CALL_OUTCOMES`; count it in `totalsFor`.
3. `functions/lib/salesCallTags.ts` (new, pure) - `SC_TAGS`, `ALL_SC_TAGS`,
   `tagsForSalesCall(outcome | "booked")`.
4. `functions/lib/salesPipeline.ts` - `SALES_STAGES` gains Follow Up and
   No-Close and loses Appointment Showed; `ROUTES` becomes the EXPECTED
   destination per outcome (drift check only), and the status field goes: the
   app no longer sets won/lost.
5. `functions/api/lib/salesCallPush.ts` (new) - apply the tag to the contact;
   on a close, find that contact's card on the Sales board and PUT the amount.
6. `functions/api/lib/recordSalesCall.ts` - `pushToPipeline` becomes
   `pushOutcome`, which tags instead of routing.
7. `functions/api/admin/cold-call/book.ts` - a booking applies the booked tag
   instead of creating a card.
8. `functions/api/lib/agencySales.ts` - `routeSalesCall` deleted;
   `resolveAgencySalesPipeline` stays (both read surfaces use it).
9. `src/components/admin/sales/meetingUi.tsx` - the fifth button.
10. `src/components/admin/sales/SalesPipelineBoard.tsx` and
    `SalesCallsSection.tsx` - copy that says what actually happens now.

## Verify

Unit: the tag mapping (one tag on, the rest off), `no_close` counting as showed
but not won, and the drift check naming a missing Follow Up stage.

Live: NOT run as part of this build. Recording an outcome against the real
account writes a tag to a real contact, and Jake wants to watch the first one.
