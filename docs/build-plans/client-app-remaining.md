# Client App: Everything Still To Do

Master tracker for the ONE responsive client app (`command-center/app`): desktop
sidebar + mobile PWA, same routes and same data. Wiring a surface lights up both
at once, so nothing here is "mobile only" or "desktop only" unless stated.

Last updated 2026-07-02. AI is OUT of scope by Jake's call (revisit once the app
is otherwise done). A2P is verified for Willis, so SMS send works.

## Status legend

- **LIVE** = reads real Willis data (both surfaces).
- **EMPTY** = wired to the golden rule: a real session shows an honest empty /
  not-connected state, NOT fake data. Needs a backend to fill it.
- **SAMPLE** = a real user currently sees labeled sample data (only Revenue).

## The wiring contract (how every surface gets wired)

- Real session: the frontend lib calls `api('/api/...')` -> a Pages Function ->
  GoHighLevel (or Meta / Google).
- Demo session: `api()` short-circuits to `handleDemoRequest()` in
  `src/demo/handler.ts`, returning the hand-authored demo arrays.

So each surface = (1) build the endpoint, (2) switch the frontend lib to `api()`,
(3) keep the demo path. Pipelines/stages are always resolved BY NAME per tenant
(id fallback only), so it works for any client, not just Willis.

## Grounding (verified live against Willis GHL, location `OznT3yyuwK3dqVXDsCaD`)

Pipelines (real ids + key stages):
- Paid Ad's Pipeline `uz0fFxCgiwdXbg4Zmwkc` (Lead In ... Intro Call Waiting Confirmation ... Estimate Scheduled)
- Organic Pipeline `NSkPBlP8BcPTtyibNEIu` (Lead In ... Estimate Scheduled ... Estimate Completed)
- Sales Pipeline `6o9Gx6e0TXRFJdln5d01` (... Job Booked, Job Completed ...)
- Database Reactivation `A7PNIqk4Fg1HINtirAmR`; Google Review Campaign `R76ncRGrODiJuDJJTUWR`
- Reusable helper: `functions/lib/ghl.ts` -> `fetchAllOpportunities(ctx, {pipelineId})` + `shapeOpportunity`.
- The `ghl` CLI's `opportunities list` / `invoices` / `transactions` commands have a `locationId` vs `location_id` bug (CLI only; the app's own calls are correct).

---

## Section-by-section status

| Section | Status | Notes |
|---|---|---|
| Unified Inbox | LIVE | list, thread, send SMS/email |
| Contacts | LIVE | list, detail, notes, tasks |
| Leads (unified) | LIVE | `/api/sales/leads` |
| Paid Ads: Leads | LIVE | `/api/ads/leads` |
| Estimate Forms + Chat Widget | LIVE | `/api/forms/submissions` (split by source) |
| Jobs | LIVE (read) | `/api/sales/jobs`; `paid` defaults false; no stage-write yet |
| Calendar: appointments | LIVE | other streams still demo |
| Reviews: request-a-review | LIVE | the tag action is real |
| Revenue: invoices + transactions | LIVE | real GHL data |
| Home: counts | LIVE | `/api/summary` |
| Team / Staff | LIVE | + silent GHL provisioning |
| Internal team chat | LIVE | Supabase |
| Assets | LIVE (read) | shipped 2026-07-02; shows files once the agency Drive is connected + a folder mapped (see Jake's steps) |
| Revenue: 5 dashboard sections | SAMPLE | trend, MoM, Top Customers, YTD, Avg + a "Sample" banner (`SHOW_UNWIRED_SECTIONS`) |
| Paid Ads: Overview / Insights / Creatives | EMPTY | leads are live; these three still need Meta wiring |
| Reviews: Overview / Insights / All | EMPTY | review content + stars (GHL reputation / Google) |
| Reactivation | EMPTY | real Database Reactivation pipeline exists, not read yet |
| Campaigns (all) | EMPTY | segments, list, send, stats |
| Social (all) | EMPTY | needs accounts connected + Social Planner endpoints |
| Website (Overview/Insights/Pages/Request) | EMPTY | GHL site/funnel data; confirm Willis uses this section |
| Calendar: jobs / social / campaign streams | EMPTY | overlays beyond appointments |
| Home: Today feed cards | PARTIAL | leads/messages real; jobs/reviews cards to confirm |
| Follow-up tracker (on Leads/Forms) | DEMO | runs on the demo `fu` field; no clean GHL source yet |

---

## Remaining work, grouped

### Tier 1 - I can wire now (data already exists in GHL/Meta)

1. **Reactivation** - read the Database Reactivation pipeline into the Reactivation surface.
2. **Reviews content** - Overview/Insights/All from the review source (GHL reputation / Google), on top of the live request action.
3. **Paid Ads Overview / Insights / Creatives** - Meta insights (partly wired already) into the three non-leads tabs.
4. **Revenue** - wire the 5 sample sections to real data, then set `SHOW_UNWIRED_SECTIONS = false` and drop the banner.
5. **Home Today feed + Calendar streams** - point the jobs/reviews cards and the calendar jobs stream at the now-live endpoints.
6. **Action wiring on live surfaces** (below).

### Tier 2 - needs something from Jake (external)

7. **Assets** - connect the agency Drive + map a Willis folder (steps below). Code is shipped.
8. **Social** - connect Facebook / Instagram / Google Business (self-serve connect flow, or connect in GHL), then wire Social Planner endpoints.

### Tier 3 - deferred / on hold

9. **Campaigns** - SMS parts wireable now; email blasts wait on a verified sending domain (ON HOLD by Jake).
10. **Follow-up automation state** - research spike; GHL workflow enrolment + step history. Tracker stays on demo data until solved.
11. **Appointment-confirmation webhook** - handler is shipped but dormant; register + confirm payload later (see below).
12. **Website** - only if Willis actually uses the app's Website section; otherwise hide it.

---

## Action wiring still missing on already-live surfaces

The read paths are live; these write actions are not yet wired (mostly GHL stage
writes + conversation sends already exist and can be reused):

- **Jobs**: complete / reschedule / record payment / (re)send invoice.
- **Leads / Paid Ads**: book intro call (+ pause nurture), confirm, off-ramp stage moves, log call outcome.
- **Forms / Chat**: log call outcome, schedule a callback, book in-person visit (stage writes).
- **Reply/send** already works via `/api/conversations/:contactId/send`.

---

## Verification gaps (do these before calling a surface "done")

- **Live-data smoke test**: every `/api/*` returns 401 without a session (even bogus paths), so the live data path can only be confirmed from a logged-in Willis session. Walk each LIVE surface and confirm real records show.
- **Revenue**: the `ghl` CLI probe returned 0 invoices / 0 transactions. Confirm from the live app whether that is genuinely empty or a scope issue.
- **Assets**: not verified end-to-end until a Drive is connected and a folder mapped (step 4 below).

---

## Jake's manual action items

### Assets (to make files appear for Willis)

1. Google Cloud Console -> APIs & Services -> Credentials -> open the OAuth client (`458743066228-...apps.googleusercontent.com`) -> confirm Authorized redirect URIs includes `https://app.hauckmarketing.com/api/admin/assets/oauth/callback`.
2. Admin app -> Assets -> Connect Google Drive -> authorize the agency Google account.
3. Admin app -> Assets -> map a Drive folder to the Willis tenant (Client Drives / client-folders).
4. Open Willis client app -> Assets and confirm real files + download work.

### Deferred / when needed

- **Social**: connect Facebook / Instagram / Google Business for Willis (through GHL or the self-serve flow once built).
- **Email sending domain** (ON HOLD): only needed for email campaigns; SMS already works. GHL -> Email Services -> Dedicated Domain, add DNS at Namecheap, verify.
- **Appointment webhook** (deferred): register `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>` in a GHL workflow; confirm the payload fields first. I will handle this by observing a real event later.
- **CF secrets**: I am blocked from writing Cloudflare secrets. When a step needs one, I hand you the exact `cf.mjs env:set` line to run with `!`.

---

## Recommended order

1. Verify the LIVE surfaces against a real Willis session (fast, high value).
2. Revenue: wire the 5 sample sections, drop the banner.
3. Reactivation + Reviews content (easy reads over existing GHL data).
4. Paid Ads Overview / Insights / Creatives (Meta).
5. Action wiring (Jobs + Leads stage writes, outcomes).
6. Assets: verify once Jake connects the Drive.
7. Social (after accounts connected).
8. Campaigns (SMS now; email when the domain is done).
9. Website (only if Willis uses it), Home/Calendar streams, follow-up tracker research, webhook registration.

## Reference

- `docs/build-plans/wire-sales-endpoints.md` - the Forms/Chat/Ads/Jobs/webhook build.
- Memory: `project_wire_sales_endpoints`, `project_client_drive_feature`.
