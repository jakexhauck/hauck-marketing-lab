# Wire Tier-1 client surfaces (Revenue, Home feed, Reactivation)

Package: `command-center/app` (the one responsive app: desktop sidebar + phone PWA).
Follows the same wiring contract as `wire-sales-endpoints.md`. AI out of scope.

## Definition of done

Three surfaces move from SAMPLE/DEMO/EMPTY to real Willis data, both surfaces,
demo path preserved, golden rule intact (a real client never sees fabricated
data). Typecheck + tests + build green. Shipped to main, bundle-verified.

## Triage of the tracker's Tier 1 (why these three, not all six)

Verified live against Willis GHL (`OznT3yyuwK3dqVXDsCaD`) this session:

- **Revenue 5 sample sections** — BUILD. All derivable from the already-live
  invoices + transactions arrays. No new endpoint, no new GHL data.
- **Home Today feed (jobs + reviews cards)** — BUILD. Live endpoints exist
  (`/api/sales/jobs`, `/api/reviews`); pure frontend rewire.
- **Reactivation** — BUILD. Database Reactivation Pipeline is real; stages
  confirmed live: Lead Contacted / Lead Responded / No answer / Not Qualified /
  Estimate Scheduled / Apt Completed-Quote Given / Followup - Not ready / No Show.
- **Calendar jobs stream** — already wired (`jobToItem` in `useCalendarItems`);
  verify only.
- **Reviews content (stars/text/trends)** — BLOCKED, not truly. `/reputation/reviews`
  route exists but Willis's PIT token returns 401 "not authorized for this scope".
  Unblock = Jake adds the reputation/reviews scope to the token. Then wire.
- **Paid Ads Overview/Insights/Creatives (Meta)** — BLOCKED. Meta integration
  lives in the Tauri desktop app (Rust, hardcoded token). Server-side needs a CF
  secret (Meta System-User token) I can't write + a `meta_ad_account_id` tenant
  field. Jake sets the secret + we add the tenant column.

## Plan (file-by-file)

### WS1 Revenue (client-side derivation, TDD)
1. `src/lib/revenue.ts` — add pure helpers over the live arrays:
   `settledTransactions`, `revenueTrend(tx, now, months=12)`, `lastMonthRevenue`,
   `momChangePct`, `collectedYtd`, `avgPaidInvoice(invoices, now)`,
   `topCustomers(tx, n=5)`.
2. `src/lib/revenue.test.ts` — tests first for each helper (month bucketing,
   MoM with zero last-month, YTD boundary, top-customer grouping, empty inputs).
3. `src/demo/data.ts` — enrich demo transactions with a ~12-month paid history so
   the derive-always path renders rich in demo (single code path, no placeholder).
4. `src/components/billing/BillingDesktop.tsx` — derive all 5 via `useMemo`,
   delete `PLACEHOLDER_*`, delete `SHOW_UNWIRED_SECTIONS`, delete the Sample
   banner. Assign top-customer colors from a local palette. Guard empty (real
   client with no revenue shows honest zeros / empty states, never fake).

### WS2 Home feed
5. `src/routes/Home.tsx` — move the jobs + reviews cards out of the `if (isDemo)`
   block; jobs card from `useJobs()` filtered to today (`jobsOnDay`), reviews card
   from `useReviewsQuery` (`contacts.filter(c => !c.started).length`). Cards only
   appear when count > 0 (or demo), matching the leads/messages cards.

### WS3 Reactivation
6. `functions/api/campaigns/reactivation.ts` — resolve "database reactivation"
   pipeline by name (id fallback `A7PNIqk4Fg1HINtirAmR`), fetch opps, bucket by
   stage into: reached (total), replied, booked (Estimate Scheduled + Apt
   Completed), stage distribution, recent movers. Degrade to empty + configError
   if the pipeline is absent (reviews-endpoint pattern).
7. `src/lib/reactivation.ts` — response type + demo payload (lift the shape from
   `campaigns/shared.tsx`).
8. `src/hooks/useReactivation.ts` — `api('/api/campaigns/reactivation')`.
9. `src/demo/handler.ts` — add the `/api/campaigns/reactivation` case.
10. `src/routes/sales/Reactivation.tsx` — swap hardcoded consts for the hook;
    keep the demo-populated / real-empty split.
11. `docs/connections/reactivation.md` — connection backlog.

## Honesty note on Reactivation mapping

The pipeline gives Reached (total in campaign) / Replied / Estimate-booked /
stage distribution / recent — all real. It does NOT contain the "dormant database
size" (that's a pre-campaign contact list, not a pipeline). So the "Dormant
customers" KPI is reframed to what's real (total reached / in campaign) rather
than invented. Documented in the connection doc.

## Verify
`npm run typecheck` + `npm test` + `npm run build` from `command-center/app`.
Demo path: `?demo=1` renders rich on all three. Real path can't be clicked
(login-gated); confirm by build + bundle grep, hand Jake the smoke-test list.
