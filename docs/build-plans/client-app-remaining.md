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

### Paid Ads (Meta) — WIRED, needs Jake to set two CF values to go live

`functions/api/ads/insights.ts` is built and shipped; Overview / Insights /
Creatives read real Meta data. It's env-configured, so it shows the not-connected
state until Jake sets both (values: token is in `app/src-tauri/src/meta_oauth_secrets.rs`):

- `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN <token> --secret`
- `node scripts/cf.mjs env:set META_AD_ACCOUNT_ID act_27110669075184924`

Verified: the token reaches Willis's account (200) with $0 spend / 0 campaigns
(ads not launched), so once set the tabs correctly show zeros and fill in when
ads run. Follow-ups (not blockers): real revenue/ROAS/"new customers" need a GHL
job join; real ad thumbnails; a per-tenant `meta_ad_account_id` column. See
`command-center/app/docs/connections/paid-ads-meta.md`.

### Reviews content — set to "Coming soon" (GHL is a dead end)

Overview / Insights / All now show a clean "Coming soon" for real sessions; the
request-a-review action stays live; demo keeps the built layout. GHL does NOT
expose reviews to tokens (`/reputation/reviews` -> 401 even with a full-scope
PIT). Real wiring later = Google Business Profile API directly (Willis's Google
Business is connected, but that API is Google-access-gated + a separate build:
Google `business.manage` scope + API enable + location lookup).

### Blocked on Jake (external), then I wire

| Surface | Blocker | What I do once unblocked |
|---|---|---|
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

1. **Paid Ads Meta — set two CF values** to switch the (already-shipped) tabs
   from "not connected" to live. Run with `!` (I'm blocked from CF writes); the
   token value is in `app/src-tauri/src/meta_oauth_secrets.rs`:
   - `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN <token> --secret`
   - `node scripts/cf.mjs env:set META_AD_ACCOUNT_ID act_27110669075184924`
   (Willis has $0 spend, so it'll show zeros until ads launch — that's correct.)
2. **Assets** — to make files appear for Willis:
   1. Google Cloud Console -> Credentials -> open the OAuth client
      (`458743066228-...apps.googleusercontent.com`) -> confirm Authorized
      redirect URIs includes
      `https://app.hauckmarketing.com/api/admin/assets/oauth/callback`.
   2. Admin app -> Assets -> Connect Google Drive -> authorize the agency account.
   3. Admin app -> Assets -> map a Drive folder to the Willis tenant.
   4. Open Willis client app -> Assets and confirm real files + download work.
3. **Social** (when ready) — connect Facebook / Instagram / Google Business for
   Willis (through GHL or the self-serve flow once built).
4. **Email domain** (only for email campaigns) — GHL -> Email Services ->
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
  - **Paid Ads** (after the two CF values are set): Overview/Insights/Creatives
    should show real zeros (Willis has no spend), not "not connected".
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
