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
| Revenue: 5 dashboard sections | LIVE | trend, MoM, Top Customers, YTD, Avg now derived from live invoices+transactions; banner dropped (shipped 2026-07-02 `88ae0a6`). Caveat: aggregates cap at ~1000 records/tenant |
| Reactivation | LIVE (read) | `/api/campaigns/reactivation` reads the Database Reactivation pipeline (shipped 2026-07-02 `88ae0a6`). Send path still unwired |
| Home: Today feed cards | LIVE | jobs + reviews cards wired to `/api/sales/jobs` + `/api/reviews` (shipped 2026-07-02 `88ae0a6`). Desktop Home is a stat-tile layout, has no jobs/reviews cards by design |
| Calendar: jobs stream | LIVE | already wired via `jobToItem`; social/campaign overlays still demo |
| Paid Ads: Overview / Insights / Creatives | BLOCKED (Meta) | needs a Meta System-User token as a CF secret (I can't write) + a `meta_ad_account_id` tenant field. Integration currently lives in the Tauri desktop app (Rust, hardcoded token) |
| Reviews: Overview / Insights / All | BLOCKED (scope) | `/reputation/reviews` route exists but Willis's PIT token returns 401 "not authorized for this scope". Jake adds the reputation/reviews scope, then wireable |
| Campaigns (all) | EMPTY | segments, list, send, stats |
| Social (all) | EMPTY | needs accounts connected + Social Planner endpoints |
| Website (Overview/Insights/Pages/Request) | EMPTY | GHL site/funnel data; confirm Willis uses this section |
| Calendar: social / campaign streams | EMPTY | overlays beyond appointments + jobs |
| Follow-up tracker (on Leads/Forms) | DEMO | runs on the demo `fu` field; no clean GHL source yet |

---

## Remaining work, grouped

### Tier 1 - DONE (shipped 2026-07-02 `88ae0a6`)

1. ~~**Reactivation**~~ - LIVE. `/api/campaigns/reactivation` over the Database Reactivation pipeline.
2. **Reviews content** - BLOCKED on token scope (see below), not a code gap.
3. **Paid Ads Overview / Insights / Creatives** - BLOCKED on a Meta CF secret + tenant field (see below).
4. ~~**Revenue**~~ - LIVE. 5 sections derived from live invoices+transactions; banner dropped.
5. ~~**Home Today feed + Calendar jobs stream**~~ - LIVE. jobs/reviews cards + calendar jobs stream all wired.
6. **Action wiring on live surfaces** - still open (below).

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

### Newly-identified unblocks (from the 2026-07-02 Tier-1 wiring)

- **Reviews content** (to light up Reviews Overview/Insights/All): in GHL, add the
  **reputation / reviews** scope to Willis's Private Integration Token (Settings ->
  Private Integrations). Verified: `GET /reputation/reviews` returns 401
  "not authorized for this scope" today; once scoped I wire the content.
- **Paid Ads Meta tabs** (Overview/Insights/Creatives): (a) Jake sets a Meta
  System-User token as a CF secret (`cf.mjs env:set META_SYSTEM_USER_TOKEN ...`,
  I'll hand the exact line), and (b) we add a `meta_ad_account_id` column to the
  tenants table (from `media-buying/data/clients.yaml`). Then a new
  `/api/ads/insights` Pages Function ports the graph.facebook.com calls from the
  Tauri app's `meta_ads.rs`.

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
