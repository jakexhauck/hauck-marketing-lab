# Client App: What's Left

Master tracker for the ONE responsive client app (`command-center/app`): desktop
sidebar + mobile PWA, same routes and same data. Wiring a surface lights up both
at once, so nothing here is "mobile only" or "desktop only" unless stated.

Last updated 2026-07-02. This doc lists only what is **not yet done**. Shipped
surfaces (Inbox, Contacts, Leads, Paid-Ads leads, Forms/Chat, Jobs, Calendar
appointments+jobs, Revenue, Home, Team, chat, Assets read, Reactivation) have
been removed. AI is OUT of scope by Jake's call. A2P is verified for Willis, so
SMS send works.

## The wiring contract (how every remaining surface gets wired)

- Real session: the frontend lib calls `api('/api/...')` -> a Pages Function ->
  GoHighLevel (or Meta / Google).
- Demo session: `api()` short-circuits to `handleDemoRequest()` in
  `src/demo/handler.ts`, returning the hand-authored demo arrays.

So each surface = (1) build the endpoint, (2) switch the frontend lib to `api()`,
(3) keep the demo path. Pipelines/stages are always resolved BY NAME per tenant
(id fallback only), so it works for any client, not just Willis.

Reusable helper: `functions/lib/ghl.ts` -> `fetchAllOpportunities(ctx, {pipelineId})`
+ `shapeOpportunity`. Willis location `OznT3yyuwK3dqVXDsCaD`.

---

## Remaining work

### Blocked on Jake (external), then I wire

| Surface | Blocker | What I do once unblocked |
|---|---|---|
| **Reviews content** (Overview / Insights / All: stars, text, trends) | Willis's Private Integration Token lacks the reputation scope. Verified live: `GET /reputation/reviews` -> 401 "not authorized for this scope". | Build `/api/reviews/reputation` over GHL's reputation API + wire the three empty tabs. The request-a-review action is already live. |
| **Paid Ads: Overview / Insights / Creatives** (Meta data) | Meta integration lives only in the Tauri desktop app (Rust, hardcoded token). No CF secret, no tenant field. | Add `META_SYSTEM_USER_TOKEN` (Jake sets the CF secret) + a `meta_ad_account_id` tenant column, then a new `/api/ads/insights` Pages Function porting the graph.facebook.com calls from `app/src-tauri/src/meta_ads.rs`. Leads tab is already live. |
| **Assets** (already shipped, read-only) | Needs the agency Drive connected + a Willis folder mapped. | Nothing to build; just verify once connected (Jake steps below). |

### Wireable now (no external blocker)

- **Action wiring on already-live surfaces** (read paths are live; these write
  actions are not). GHL stage-writes + conversation sends already exist and can
  be reused:
  - **Jobs**: complete / reschedule / record payment / (re)send invoice.
  - **Leads / Paid Ads**: book intro call (+ pause nurture), confirm, off-ramp
    stage moves, log call outcome.
  - **Forms / Chat**: log call outcome, schedule a callback, book in-person visit.
- **Campaigns** (list / segments / stats): the SMS parts are wireable now over
  GHL. Email blasts wait on a verified sending domain (on hold, below).
- **Calendar: social + campaign streams**: overlays beyond appointments + jobs
  (both already live). Needs the Social + Campaigns feeds first.

### EMPTY surfaces (need a data source connected first)

- **Social** (all): needs Facebook / Instagram / Google Business connected, then
  wire the Social Planner endpoints.
- **Website** (Overview / Insights / Pages / Request): GHL site/funnel data.
  First confirm Willis actually uses the app's Website section; otherwise hide it.

### Deferred / on hold

- **Email sending domain** (ON HOLD by Jake): only needed for email campaigns;
  SMS already works.
- **Follow-up automation state** (the tracker on Leads/Forms): runs on the demo
  `fu` field. Needs a research spike (GHL workflow enrolment + step history); no
  clean GHL source yet. Stays on demo data until solved.
- **Appointment-confirmation webhook**: handler is shipped but dormant; register
  it + confirm payload fields against a real event later.

---

## What Jake needs to do (his side)

1. **Reviews scope** — GHL -> Settings -> Private Integrations -> open Willis's
   token -> add the **reputation / reviews** scope -> save. Then tell me; I wire
   Reviews Overview / Insights / All.
2. **Paid Ads Meta** — give the go-ahead; I hand you the exact
   `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN ...` line to run with `!`
   (I'm blocked from writing CF secrets). I add the `meta_ad_account_id` tenant
   field from `media-buying/data/clients.yaml` (Willis `act_27110669075184924`).
3. **Assets** — to make files appear for Willis:
   1. Google Cloud Console -> Credentials -> open the OAuth client
      (`458743066228-...apps.googleusercontent.com`) -> confirm Authorized
      redirect URIs includes
      `https://app.hauckmarketing.com/api/admin/assets/oauth/callback`.
   2. Admin app -> Assets -> Connect Google Drive -> authorize the agency account.
   3. Admin app -> Assets -> map a Drive folder to the Willis tenant.
   4. Open Willis client app -> Assets and confirm real files + download work.
4. **Social** (when ready) — connect Facebook / Instagram / Google Business for
   Willis (through GHL or the self-serve flow once built).
5. **Email domain** (only for email campaigns) — GHL -> Email Services ->
   Dedicated Domain, add DNS at Namecheap, verify.

---

## What needs verifying

- **Live-data smoke test (Jake, needs a real Willis session)** — every `/api/*`
  returns 401 without a session, so the live path can only be confirmed logged in.
  In a real Willis session, walk the recently-wired surfaces and confirm real
  records show:
  - **Revenue**: trend / collected YTD / top customers / avg invoice / MoM.
  - **Home**: the "Jobs today" and "Reviews to request" cards.
  - **Marketing -> Campaigns -> Reactivation**: real pipeline counts.
  - Every other LIVE surface (Inbox, Contacts, Leads, Jobs, Calendar, Revenue
    invoices/payments).
- **Revenue data completeness** — the `ghl` CLI probe returned 0 invoices / 0
  transactions for Willis. Confirm from the live app whether that is genuinely
  empty or a token-scope issue. Also note: the invoices/transactions aggregates
  cap at ~1000 records per tenant; fine for Willis, revisit if a client exceeds it.
- **Assets** — not verified end-to-end until a Drive is connected + a folder
  mapped (step 3 above).

---

## Reference

- Memory: `project_wire_tier1_surfaces`, `project_wire_sales_endpoints`,
  `project_client_drive_feature`.
- Jake's running action list: `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md`.
