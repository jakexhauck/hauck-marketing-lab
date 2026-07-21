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

## Fulfillment: Software tab, every client-app page in one place (shipped + live 2026-07-19, `4391103`)

Fulfillment now has a **Software** tab per client, between Overview and Paid Ads. Left rail lists every page of the client app (32 today: Home, all four Marketing channels with their tabs, all the Company pages with theirs, the four Jobs calendar views, and four record pages). Click one and it renders live on the right with that client's real data. Read-only, and the server enforces that: any write from inside the frame is refused. Desktop and phone widths both available.

The page list is not hand-written. It derives from `nav.ts` and `pageTabs.ts`, the same files the app renders its own sidebar and tab bars from, so any page added later shows up here on its own. A test asserts every entry points at a route that actually exists.

Verified: 840 tests green, typecheck clean, live bundle carries the code, the new endpoint 401s unauthenticated, CORS advertises the new header, and `frame-ancestors 'self'` is live. NOT verified: how any of it looks, because admin is login-gated and I cannot mint an admin session.

- [ ] **Eyeball the tab.** `/admin` → Fulfillment → Willis → Software. Click down the whole list. Flag anything that renders wrong, loads slowly, or looks broken inside the frame.
- [ ] **Check the phone toggle.** It constrains the frame to 420px so you get the real mobile layout, not a scaled-down desktop. Confirm that is what you see.
- [ ] **Confirm the admin shell survives.** Click through ten pages and check the cockpit is still around the frame and you are still admin. That is the whole point of the design; if it ever bounces you to login, tell me immediately.
- [ ] **Check the record pages.** "A single lead / contact / customer / conversation" pick Willis's most recent real record. If a row says "none" but you know Willis has that data, that lookup is wrong and I want to know.
- [ ] **Decide whether you want this for other clients as they onboard.** It works per client automatically, no setup, but worth knowing you expect to use it that way.

## Setter Suite: the pseudo-GHL dialing surface (shipped 2026-07-21)

`/admin/setter` is live. It is the surface your setters work leads from, pointed at the **test account** (`r0WfsA12qpBv7M185V3v`), not Willis. Board across all 8 pipelines using the real GHL stage names verbatim, one client at a time with a switcher, and a docked cockpit on the right for the selected lead. From the cockpit you log a dial (attempts, spoke yes/no, outcome, note), add or remove tags, and book a real slot that writes back to GHL. Stage movement stays owned by GHL automations firing off the tags, exactly as you asked. The client app is untouched and still read-only.

Every one of your 13 spreadsheet columns is either pulled from GHL or captured by the dial logger. It ships **empty**, per your call, so you can iterate the UI before pointing it at Willis.

**The rate strip was removed on 2026-07-21** at your request. Total leads in, contact rate, booking rate, show rate and close rate no longer appear anywhere in the app. The underlying dial data is untouched and still recorded per dial in `setter_dials`, so those five numbers can be rebuilt from it whenever you want them back. Nothing was lost, only the display.

Verified: 964 tests green, typecheck and build clean, migration `0040_setter_dials` applied live. Tag add and remove and a full book/confirm/cancel cycle were all proven against the real test account and cleaned up. NOT verified: anything through a real signed admin session, because minting one is blocked in my environment, so no endpoint has run through your own middleware and session gate.

- [ ] **Click through `/admin/setter` in your own browser.** This is the one real gap. Confirm the board loads, the client switcher works, and the cockpit opens on a lead. If any endpoint 401s or 500s, that is the session gate and I want to know immediately.
- [ ] **Put a few fake leads into the test account** so you can see the board with something in it, then log a dial and confirm it persists across a reload.
- [ ] **Decide on the per-tenant timezone column.** Booking slots currently resolve from one global timezone. Harmless today (Willis and the test account are both Detroit) but wrong the day you onboard outside Michigan. Note your GHL has Willis set to `America/Cancun`, so reading the timezone from GHL would make it worse, not better. Needs a migration when you want it.
- [ ] **Tell me what to change in the UI.** You said you wanted to iterate before pointing it at Willis. Known rough edge I would fix first: the tag picker only offers tags this contact has already had, rather than the client's full 49-tag list.
- [ ] **Before Willis goes on it: Willis still runs the OLD 6-pipeline structure.** The Suite is built for the new 8. That is either a GHL migration on Willis or a per-client mapping layer in the app. Your call which.

## SOP Hub, backed by Google Drive (shipped 2026-07-21, `main` `f43bb39`)

Your SOPs now come live from Drive. `/admin/pillar/operations?tab=sops`. Each
subfolder of `SOPs Templates` is a category, each Google Doc is an SOP page, the
`3. ` number prefix sets the order, and a `1. X.mp4` next to a `1.1 X.gdoc`
attaches that video to that SOP. Sheets, PDFs and images show as attachments
linking out to Drive.

Writing an SOP is now writing a Google Doc. No deploy, no editor to learn,
nothing to copy into the app. Edit a Doc and the hub picks it up on next open.

Deleted the 125 Local Ads School entries in `sopData.ts`. Every one had the same
placeholder body ("Step-by-step SOP to be written from the video"), none had
written steps, and nothing imported the file. Their Loom links went with them.

Verified: 1017 tests green (40 new on the two risky pure modules, plus 11 pinned
to your real filenames), typecheck and build clean, migration `0041_sop_doc_cache`
applied live, all three endpoints 401 on prod, SOP code confirmed in the served
bundle. NOT verified: the actual Drive read, because nothing is connected yet.

- [ ] **Connect Google Drive. This is the blocker and nothing works without it.**
      Signed in as admin, open `https://app.hauckmarketing.com/api/admin/assets/oauth/start`
      directly in the address bar. There is no button: the old `/admin/assets`
      page was removed when the admin became pillar tabs. Consent lands you back
      on the SOPs tab.
- [ ] **Consent as `contact.jakehauck@gmail.com`.** That account owns the SOPs
      folder. Picking `jdhauckmonetization@gmail.com` gives a 403 and an empty
      hub. The tab will tell you if you pick wrong.
- [ ] **Then eyeball one SOP end to end.** Open `7. Facebook Pixel SOP` and check
      it reads like a document: headings, bold, lists, working links. Google's
      HTML export is messy and the sanitizer is the piece most likely to need a
      second pass on a Doc I have not seen. If it looks flat or broken, tell me
      which Doc.
- [ ] **Decide on `EXAMPLE CLIENT FOLDER`.** Excluded by name as empty
      scaffolding. Say if you want it visible.
- [ ] **Optional: fix the "Fullfillment" spelling in Drive.** The app reads folder
      names verbatim, so the typo shows in the UI. Renaming the folder fixes it
      with no code change.
## Setter Suite: the client inbox and all-calendars booking (shipped 2026-07-21)

The Setter Suite now has a **Board / Inbox** switcher. Inbox is the client's whole conversation list, and setters can reply as the client over SMS or email. Booking gained a real calendar picker, so it is no longer pinned to one calendar resolved by name; the free-text calendar box is gone. There is also a new **audit log** at `/admin/audit`, reachable from Settings, listing every cross-tenant admin action with a filter for sends.

Verified: 1107 tests green, typecheck and build clean. Three independent reviewers went over the diff. NOT verified: anything in a browser, because admin is login-gated and I cannot mint a session.

- [ ] **Send one real test message to yourself** from the Inbox, on the test account, and confirm it arrives. This is the single most important check on the list: it is the only path in the app that contacts a real person, and it has never been run end to end.
- [ ] **Then open `/admin/audit` and confirm that send is listed.** If the message arrived but no row appears, tell me immediately: that means the accountability record is broken, and it is the one thing this build is supposed to guarantee.
- [ ] **Book something through the new calendar picker** and confirm it lands on the right calendar in the booking system. The old free-text name field is gone, so this path changed.
- [ ] **Read the notice at the top of `/admin/audit`.** It says the log names an ACCOUNT, not a person. Because there are no per-setter logins yet, a message sent by a hired setter will show your name. Decide whether you want per-setter accounts before you actually hire, because the log cannot be corrected after the fact.
- [ ] **Know the inbox limits.** It reads the 1000 most recent conversations. Beyond that the list and the search both say so plainly rather than pretending to be complete, but a very old conversation will only be findable by search, and past 1000 not at all. Tell me if you hit that ceiling in real use and I will add a proper server-side search.
- [ ] **Decide about the other six channels.** The composer offers SMS and email only. The booking system also supports Facebook, Instagram, Google, WhatsApp and live chat, but those only deliver if the customer already has an open conversation on that network, so sending blind would silently fail. Say the word if you want them.

## Setter Suite: the Calendar tab (shipped 2026-07-21)

The Setter Suite now has a third tab: **Calendar**. It shows the selected client's booked appointments as blocks and their Google Calendar busy hours as grey bands, on a week grid. A setter books by clicking any empty stretch, or with the Book button, then searching an existing contact by name or phone.

Verified: 1276 tests green, typecheck and build clean, all three new endpoints return 401 unauthenticated both locally and live. Live bundle `index-0uzXMu5X.js` carries the new copy.

NOT verified: **anything in a browser.** You chose to skip component tests on this build, and admin is login-gated so I cannot mint a session. That means the booking path has never been executed by anyone, by a test or a human.

- [ ] **Do the first booking yourself, on the test account, before any setter touches this.** Open `/admin/setter`, pick Calendar, click an empty slot, search a contact, confirm. Then check it landed in the booking system at the right time. This is the highest-risk item on the list: it is a write path to a real calendar that has never been run.
- [ ] **Check the time is right, not just that it booked.** The slot maths converts a local wall-clock time to UTC. If the appointment lands an hour out, tell me immediately and say whether the client was on daylight saving that week.
- [ ] **Watch for a yellow warning line above the grid.** It appears if one of the client's calendars failed to load, and it means the grid is missing appointments. Do not offer a time while that line is showing. If you see it, tell me which client.
- [ ] **Note that busy hours only appear for clients who linked their own Google Calendar.** Willis has. The test account has not, so expect the line saying so rather than grey bands. A setter cannot link a calendar on a client's behalf today.
- [ ] **Decide whether setters should be able to link a client's calendar.** Right now only the client can, because the connect flow redirects into the client app. Say the word if you want an admin-side version.
- [ ] **Contact search is unproven against a real location.** It sends `query=` to the booking system's contacts endpoint, which nothing in the app had used before. If a search comes back empty for a contact you know exists, that parameter is the first suspect. Tell me and I will switch it.
