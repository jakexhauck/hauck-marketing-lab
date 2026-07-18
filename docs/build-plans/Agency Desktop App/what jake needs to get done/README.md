# What Jake needs to get done

Action items that require Jake (config, credentials, dashboard clicks) and cannot be self-served by the builder.

## Client Modern Motion rebrand (shipped + live 2026-06-26)

- [ ] **Set Willis's tenant brand color to indigo.** The Modern Motion rebrand is live, but the in-app brand HUE is read at runtime from Willis's Supabase tenant row (`brandColor`), not from CSS. The login screen and all structure (glass, gradient, motion, mono, dark mode) are already indigo, but once Willis's team signs in, the solid brand accent will be whatever their tenant row says. If it is not indigo, the solid brand and the fixed indigo-to-violet gradient can mismatch.
  - Fix: in the admin console, open Willis's client detail and set **Brand color** to `#4f46e5` (or clear it to fall back to the indigo default).

## Tier-1 client wiring (shipped + live 2026-07-02, `88ae0a6`)

Revenue, Home feed, and Reactivation now read real data. Two related surfaces stayed blocked on you:

- [ ] **Reviews content (stars / text / trends).** GHL's reputation API works, but Willis's Private Integration Token lacks the scope. Verified: `GET /reputation/reviews` returns 401 "not authorized for this scope."
  - Fix: GHL -> Settings -> Private Integrations -> open Willis's token -> add the **reputation / reviews** scope -> save. Tell me when done and I wire Reviews Overview / Insights / All.
- [ ] **Paid Ads Overview / Insights / Creatives (Meta data).** The Meta integration currently lives only in the Tauri desktop app (hardcoded token). To wire it into the client web app I need two things:
  - Set a Meta System-User token as a Cloudflare secret. I will hand you the exact `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN ...` line to run with `!` (I'm blocked from writing CF secrets).
  - I add a `meta_ad_account_id` column to the tenants table (sourced from `media-buying/data/clients.yaml`, e.g. Willis `act_27110669075184924`). No action from you there beyond a go-ahead.
- [ ] **Smoke-test the newly-live surfaces** (I can't; every `/api/*` is login-gated). In a real Willis session, open **Revenue** (trend / YTD / top customers should show real numbers), **Home** (jobs-today + reviews-to-request cards), and **Marketing -> Campaigns -> Reactivation** (real pipeline counts). Flag anything that reads empty or wrong.

## Google Reviews funnel wired to the pipeline (shipped + live 2026-07-02)

The Reviews **Overview** tab now renders a live request -> click -> review funnel from the GHL review pipeline (stages you confirmed: Asked for review / Review link clicked / Positive review submission / Negative feedback received). Demo layout and the other tabs are unchanged.

- [ ] **Smoke-test the Reviews funnel** (I can't; login-gated). In a real Willis session open **Marketing -> Google Reviews -> Overview**. You should see: KPI tiles (Asked / Clicked / Left a review / Caught privately), the three-step journey bars, a conversion line, and recent positive reviewers. If it reads empty when the pipeline has people in it, the pipeline name did not resolve (see next item).
- [ ] **Confirm the pipeline resolves by name.** The endpoint finds the pipeline by matching a name that contains "review" or "reputation", with a fallback that matches the gate stages. If Willis's review pipeline is named something else, tell me the exact name and I will pin it.
- [ ] **All Reviews / average-rating hero still need Google Business Profile.** A pipeline cannot supply star ratings or review text, so the **All Reviews** list and the big average-rating hero stay "coming soon" until GBP is connected. Same blocker as the reputation-scope item above. This is unchanged by this work.

## Inbox: grouped by pipeline stage (shipped + live 2026-07-06)

The Inbox is now one unified view (the old SMS / Email tab split is gone). Every conversation is grouped by its pipeline stage (New / Unsorted, Lead In, Lead Responded, Estimate Scheduled, Estimate Completed, Job Booked, Job Completed, then Follow Up and Closed / Inactive collapsed at the bottom). A subtle green/blue source tag shows Organic vs Facebook. Opening a lead shows SMS and Email as two separate threads on their own tabs, each with its own reply box. Stage is joined from each contact's opportunity; verified end to end in demo mode (desktop + mobile), not yet in a real Willis session.

- [ ] **Smoke-test the live inbox in your own browser** (I can't; login-gated). In a real Willis session open **Inbox**. Confirm: leads land in the right stage groups; the New / Unsorted group holds anyone with no opportunity yet; Follow Up and Closed sit collapsed at the bottom; the source chips (All / Organic / Facebook) filter correctly; opening a lead shows SMS and Email as separate tabs and a reply goes out on the right channel. Flag any lead that lands in the wrong group.
- [ ] **Decide the Paid Ads pipeline trim.** You said you want Paid Ads to only have **Lead In** and **Lead Responded** (with a "trash leads" pipeline coming later). Right now the inbox maps by stage name, so a paid lead sitting in any other stage still shows under that stage's group. Trim the Paid Ads pipeline in GHL to the two stages when you're ready, or tell me to force all Paid Ads leads into just those two groups.
- [ ] **"Trash leads" pipeline.** When you build it, tell me its name and I'll route it into the Closed / Inactive group (or hide it from the inbox entirely, your call).

## Call Console: inbound call capture + outcome routing (built 2026-07-06, wiring pending)

When an inbound call hits the business number, the client app pops a top banner and a Call Console: whoever answered captures an unknown caller's name/ZIP (written to the real contact) and taps an outcome that routes the lead to the right pipeline stage. Route 1 telephony (answer on the cell, the app is the capture pad). Built and verified in demo (banner, capture form, all five outcome taps, zero console errors). It stays dark until you wire the signal. Full backlog: `command-center/app/docs/connections/call-console.md`.

- [ ] **Add the "Send Webhook" action to your inbound-call workflow.** On the workflow that already tags inbound calls, add a Send Webhook action: POST to `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>` with JSON body `{ "type": "InboundCall", "locationId": "{{location.id}}", "contactId": "{{contact.id}}", "phone": "{{contact.phone}}", "firstName": "{{contact.first_name}}", "lastName": "{{contact.last_name}}" }`. Without this the banner never pops.
- [ ] **Confirm `WEBHOOK_SECRET` is set** and matches the token in the workflow URL (the webhook fails closed without it).
- [ ] **Place a live test call** into the business number and confirm the banner pops. Note whether it pops mid-ring or right after hang-up (the call trigger's timing decides live vs instant-after; the build handles both).
- [ ] **On the call, type the caller's name/ZIP and Save**, then confirm the details land on the real contact.
- [ ] **Tap each outcome once** and confirm the opportunity lands in the expected stage (Booked the job: Job Booked, Book in-person visit: Estimate Scheduled, Follow up later: Follow Up, No answer: No Answer, Not qualified: lost).
- [ ] **Known-caller follow-up (known limitation).** A repeat caller whose opportunity has already advanced into the Sales Pipeline is not in the leads feed the console matches against, so logging an outcome for them creates a second opportunity instead of moving the existing one. If this matters, tell me and I will add a server-side across-all-pipelines lookup so the console updates the existing opportunity instead of duplicating.

## Admin Business Health: the Command home (shipped + live 2026-07-18, `8d2058e`)

`/admin` is no longer the Theory-of-Constraints command view. It is now **Business Health**: two bento panels (Money, Clients & Retention) over one period at a time, with a This month / Quarter / Year toggle. Every tinted tile is a number you type; every "Auto" tile is computed from those (CAC, ROAS, Avg LTV, LTV:CAC, total clients) and recomputes live as you type. Edits autosave after ~600ms and each period keeps its own row, so a fresh period opens all-zero rather than showing invented figures. Phase 1 is deliberately manual entry: "Auto" means "derived from your inputs", not "pulled from GHL/Meta".

- [ ] **Eyeball `/admin` in your own browser** (I cannot; it is login-gated and production uses a different session secret than local). Confirm the two panels look right, then type into Marketing Spend and New Clients and watch CAC / ROAS / LTV:CAC move.
- [ ] **Enter your real numbers for this month.** The page is empty until you do. It needs: marketing spend, new revenue, new MRR, start/new/churned client counts, profit margin %, avg retention (months), avg revenue per client, churn %.
- [ ] **Sanity-check the benchmark thresholds against how you actually run the business.** Right now: CAC good under $1k; LTV:CAC healthy at 3x+, watch 1-3x; ROAS good at 3x+, thin 1-3x; churn low under 8%, bad over 15%; margin healthy at 25%+, thin at 10-25%. Tell me any number that is wrong for your targets and I will change it.
- [ ] **Decide on Phase 2 auto-fill.** Marketing spend and client counts could pre-fill from Meta + the tenant roster (`/api/admin/overview` already computes both agency-wide) and let you override. Say the word and I will wire it.

## Acquisition pillar: Leads, Cold Call, Cold SMS (built 2026-07-18, not yet eyeballed)

The Acquisition pillar's three tabs are real. `/admin/pillar/acquisition` now serves Leads (a hand-kept prospect spreadsheet with status tiles, inline edit, sort, filter, soft delete), Cold Call (the daily dialing funnel on the shared DailyTracker engine), and SMS (three sub-views: Daily funnel, Monthly economics, Script Test A/B). All agency-global, admin-only, manual entry, app DB is the source of truth. No GHL or dialer auto-fill yet, that is Phase 2.

Verified: 552 unit tests green, typecheck and build clean, migrations 0030 to 0032 applied live, and every table round-tripped against the real DB (upsert, unique-key, blank-stays-null, the lead status CHECK, and soft delete all confirmed). NOT verified: how any of it looks or behaves in a browser, because the admin console is login-gated.

- [ ] **Eyeball all three tabs in your own browser** (I can't; admin login). Go to `/admin/pillar/acquisition` and check each tab: Leads (add a lead, type in cells, change status via the pill, tap a status tile to filter, sort by a column header, delete a row, then reload and confirm everything persisted), Cold Call (type into a day, watch the rates, footer and stat tiles update, reload, switch months), SMS (all three sub-views, month nav appears on Daily only, add a month row, add a script variation). Flag anything that looks wrong or fabricated.
- [ ] **Decide: empty month shows "-" or "0".** When no days are logged, the Cold Call footer and tiles currently show "-" rather than "0". I chose that because a hard 0 cannot be told apart from "made no calls", which reads as fabricated data. The approved mockup prints 0. Tell me which you want.
- [ ] **Eyeball two bits of UI the plans never specified.** Monthly economics needed a way to create a month row, so it has a month picker plus an "Add month" button. Script Test has a name field plus "Add variation" and a per-row delete. Both were implied by the plans' verify steps but never designed, so they are my invention and worth a look.
- [ ] **Migration numbering collision, needs your call.** Three parallel branches each numbered a migration 0030: `0030_business_health.sql`, `0030_leads.sql` (mine) and `0030_sales_data.sql`. All three are applied live and the database is correct (the ledger keys on filename, not number), but the repo convention that the 4-digit number orders migrations is broken. Mine took 0030 to 0032 on this branch. Whichever of business-health and sales-data merges after me needs renumbering to 0033+. Tell me if you want me to renumber instead.
