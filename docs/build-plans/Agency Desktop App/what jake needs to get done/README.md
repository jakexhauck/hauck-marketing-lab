# What Jake needs to get done

Action items that require Jake (config, credentials, dashboard clicks) and cannot be self-served by the builder.

## Setter Suite: Dialing Hub tab (shipped + live 2026-07-21)

`/admin/setter` has a fourth tab, **Dialing Hub**: the dialing reference sheet, per client, editable in place with autosave. Sections, row labels and row values are all editable, rows and sections can be added or deleted. A value that is an http/https URL gets an open button, anything else gets a copy button. A client that has never been edited opens on the seed template transcribed from your sheet.

- [ ] **Eyeball it and fill in the links.** Admin is login-gated and I cannot mint a session, so this tab has never been rendered by anyone. Open `/admin/setter`, pick Willis, click **Dialing Hub**. The six link rows (script, three calendars, confirming-appointments form, company info sheet, full dialing SOP) all ship EMPTY on purpose, since they are per client and a wrong link is worse than a missing one. Paste the real ones in.
- [ ] **Check the six tag values are still current.** They ship pre-filled from your sheet: `services-unqualified`, `mentorship-follow-up`, and `no answer day 1` through `day 4`. If any of those tags have been renamed in the CRM, fix them here, because a setter will be copying them straight across.
- [ ] **Confirm the sheet can be retired.** Once the links are in and the tags check out, the Google Sheet is redundant. Worth saying so to the setters explicitly, or they will keep using the stale copy.

Not built, on purpose: drag-to-reorder rows, and filling the hub during new-client onboarding (you parked that one, it is blocked behind onboarding having no persistence for its answers at all).

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

## Contact detail: desktop "Cockpit" record (shipped + live 2026-07-07, `a08648e`)

Clicking a contact on desktop (lg+) now opens the three-pane Cockpit record: identity + comms + read-only details on the left, the read-only pipeline stage plus Notes / Conversation tabs in the center, quick actions + the linked opportunity + a More menu on the right. Real notes, conversation threads, opportunity, and per-tenant pipeline stages; Edit contact and Add task write through the existing endpoints. The pipeline stage is view-only here (no move). Phone layout is unchanged. Verified in demo (both themes, zero console errors), not yet in a real Willis session.

- [ ] **Smoke-test the live record in your own browser** (I can't; login-gated). In a real Willis session open **Contacts** and click a contact. Confirm: the pipeline stepper shows that contact's real stages with the correct current stage highlighted; Notes create/edit/delete works; the Conversation tab shows real messages and "Open full conversation" opens the thread; the linked Opportunity opens the lead; Edit contact saves; Add task saves. Flag anything empty or wrong.
- [ ] **Decide which deferred buttons to wire.** Five actions currently show a "Coming soon" toast because there is no contact-scoped endpoint yet: **Book appointment**, **Add to list**, **Merge duplicate**, **Export**, **Delete contact**. Book appointment is the highest-value one and can reuse the leads booking flow (calendar + free slots). Tell me which to build and in what order.

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
## Setter Suite: calling the lead from the client's number (shipped 2026-07-21)

The lead's phone number in the Setter Suite cockpit used to be a normal phone link, so tapping it dialed from the setter's own handset and the lead saw a personal mobile number. It now opens that lead's contact record in the CRM in a new tab, where the built-in softphone dials from the client's business line and records the call automatically.

It is two clicks, not one: our phone number, then the phone icon on the CRM page. That is not laziness, the CRM has no way to open its dialer already pointed at a number. Every richer option was researched and is impossible on the CRM's phone system: there is no API that places a call, there is no mobile deep-link scheme, and an embedded page cannot drive the dialer. A one-tap call needs a dialer we own, which you have ruled out.

Verified: 1285 tests green on the merged tree, typecheck and build clean. NOT verified: anything in a browser, because admin is login-gated and I cannot mint a session.

- [ ] **Click a lead in the Setter Suite and click its phone number.** Confirm a new tab opens on that lead's contact record in the CRM. This is the whole feature and I could not test it.
- [ ] **Place one real call from that CRM page and confirm the client's business number shows on the receiving phone.** Call your own mobile. This is the entire point of the change, and it is the one thing that proves it worked.
- [ ] **Click a second lead's number and confirm it reuses the same tab** rather than opening a new one. Deliberate, so a dialing session does not bury you in tabs.
- [ ] **Make sure setters are logged into the CRM in their work browser once.** If they are not, that new tab lands on a login screen instead of the contact. There is no way for the app to fix this, it is a one-time setup step per setter.
- [ ] **Decide whether you want outcomes to log themselves.** Right now a setter picks an outcome in the CRM at the end of a call, then types the same thing again into our Log This Call panel. The CRM can webhook that outcome to us so the second step disappears. It needs a live call captured first to learn the payload shape, so say the word and it becomes its own small build.

## Internal notifications hidden from every inbox (shipped 2026-07-21)

Your workflows send internal alerts ("New Facebook Lead", the review-redirect notices) to your own phone and email and to my number. The booking system logs each of those against a contact, so they were showing up in the client Inbox as if they were leads. A live look at Willis found three of them sitting there: your mobile, your email, and my contact.

They are now hidden everywhere in the app: the Inbox, every thread, the unread badge, the reactivation list, the sales lead list and its counts, and the internal Setter tools. Hidden means hidden. There is no toggle and no admin view of them, by your call. If you ever need to confirm an alert fired, it is still in the booking system, which stays the source of truth.

How it decides: anything the booking system itself tags as a notification is caught automatically. Staff numbers (yours, mine) are caught by a short per-client list I have seeded for Willis with your mobile, your email, and my number.

Verified against 100 live Willis conversations: exactly those three hidden, 97 kept, and every real lead's follow-up history left intact.

- [ ] **Open the Inbox and confirm you no longer see yourself, your email, or my number in the list.** Those three were there before. If any of them is still showing, tell me which one.
- [ ] **Tell me if any OTHER phone or email of yours or your team's gets these alerts.** I could only see what fired in the last few days, so I may have missed a person. Any I do not know about will keep showing until you tell me.
- [ ] **Confirm (313) 405-3227 is a number of yours and not a real customer.** The booking system labelled it an internal notification recipient, so it should be safe to hide, but you would know a real customer's number on sight.

---

## Cold Call went live (2026-07-26, `0596a24`)

Cold Call is now the pipeline itself: one page per stage, in the order your
GoHighLevel board has them. New Lead, 1st Dial, 2nd Dial and Call Back are all
the same calling queue. "Run the book / Work the queue" is gone. Import leads
now puts every row into GoHighLevel tagged `cc new lead`, and your workflow puts
them on the board. I tested that whole path end to end with one contact and
deleted it afterwards.

- [ ] **Delete the "Brushed Off" stage and its `cc brush off` automation in GoHighLevel.** The app no longer has that stage, so anything your automations move there is invisible in the console. Brushed Off is now a reason on the "Not interested" button instead, which is better data: it tells you WHY they said no and feeds the tracker's Objections column.
- [ ] **Tell anyone with the app open to hard-refresh once** (`Ctrl+Shift+R`). Their browser is still holding the old version, and the old version does not understand the new stage names, so it shows them a blank screen. New visitors are fine. I have a plan to make the app fix this itself.
- [ ] **Say whether I can delete the demo data.** 44 fake leads ("DEMO Roofers list", "Demo Caller (delete me)") are live in production and showing on every stage page. They are not real prospects. Deleting is permanent.
- [ ] **Decide what should happen when you import a list you have imported before.** Right now a phone number already in the book is skipped completely, so that prospect is never re-tagged and never goes back on the board. That is right for accidentally importing the same file twice, and wrong for deliberately re-working an old list. Tell me which you want.

---

## Agency Settings, and a console that checks itself (2026-07-27, `3debab5` + `056f55f`)

Settings now opens on a short list of what needs you, worst first, instead of a
wall of settings. Every connection says what it feeds, so a red row tells you the
page that goes dark rather than the name of a key. A By surface view answers the
other direction: pick a page that looks empty and see everything it needs.

On top of that, the console now checks itself every 30 minutes and sends admin
devices one notification when something that WAS working stops working. Nothing
that stays broken nags you again, and a recovery does not buzz anyone at all.

Two pieces are built and shipped but not yet switched on, and both need
something only you can issue.

- [ ] **Turn the automatic checks on.** The app half is live and the secret is
      already generated and sitting in `command-center/app/.env.local` as
      `HEALTH_CRON_SECRET`. Two commands, in this order. The first was blocked
      for me by the permission classifier:
      ```
      cd command-center/app
      node scripts/cf-rebind.mjs --add HEALTH_CRON_SECRET
      ```
      Read what it prints before saying yes: it also rewrites 9 existing secrets
      from `.env.local`, and `SESSION_SECRET` is one of them, so if that value is
      stale everyone gets logged out. Then deploy the alarm clock:
      ```
      cd workers/health-cron
      npm install && npx wrangler login && npx wrangler secret put HEALTH_CRON_SECRET
      npx wrangler deploy
      ```
      Paste the SAME value both times. Until both are done, Agency Settings shows
      a red "Scheduled health checks" row, which is it telling the truth about
      itself.

- [ ] **Prove the alert actually arrives.** Once deployed:
      `curl -X POST https://hauck-health-cron.<subdomain>.workers.dev/run -H "x-health-cron: <the secret>"`.
      It answers with a summary line. Then break something harmless in the test
      account, run it again, and confirm your phone buzzes. Nobody has ever seen
      this notification fire, so it is unproven until you see it.

- [ ] **Generate a read-only Doppler service token** for `hauck-command-center` /
      `prd`. Until this exists, the agency half of the Secrets tab can only show
      what the running app has, and it cannot tell you when Doppler and the live
      deploy have drifted apart. Optional second token with write access if you
      want to edit secrets in the app; leave it out and editing stays off, which
      the page says plainly.

- [ ] **Eyeball the page on the live site, not localhost.** `app.hauckmarketing.com/admin/settings`.
      Localhost cannot see the real credentials and will show false alarms; the
      page warns you about this at the top. Two things to check against: Google
      Drive should read broken ("never consented"), and Willis's GoHighLevel
      should pass.

- [ ] **Decide about the one-click rebind button.** You picked the option that
      mentioned it and I did not build it. It needs a Cloudflare API token living
      inside the app, which turns an admin login being stolen into someone owning
      the whole Cloudflare account. The drift banner hands you a copy-paste
      command instead. Say if you want the button anyway.

- [ ] **Your `feat/client-onboarding` branch has ~500 lines of uncommitted
      settings work in it** (an older copy of what just shipped, missing the
      agency GoHighLevel entry). It is superseded now. I left it alone because it
      is your uncommitted work, but it will collide the next time that branch
      merges main. Tell me to delete it and I will.

## Cold call tracker: the agency view (shipped 29 July 2026)

- [ ] **Look at Acquisition > Cold Call > Tracker with the picker on "Agency".**
      It used to say "pick a person"; it now draws the same tracker with every
      caller summed. Check the Total MTD row against what you get by stepping
      through each name one at a time: the two must agree. If they do not, the
      resolution order is wrong and I want to know.

- [ ] **Confirm the read-only grid is what you want there.** The agency view has
      no typeable cells, because a cell holding five people's numbers belongs to
      nobody. If you would rather type a correction at the agency level, say so
      and I will build somewhere honest for it to live.

## Sales pillar: what was sold, sources, reasons, notes, stale deals (shipped 29 July 2026)

- [ ] **Record one real close end to end.** Sales > Sales Calls, press "Closed",
      put in the monthly, the term and the cash taken. Then check three places
      agree: the row reads back "$2,000/mo, 12 mo, $500 today", the funnel's New
      MRR moved, and Sales Data's New MRR column shows it on the right day. This
      write path has never been used against a real meeting.

- [ ] **Decide whether the reason list is the right list.** Both "no" buttons now
      refuse to save without one, from eight fixed options (too expensive, wants
      to think, already has an agency, not the decision maker, bad timing, not a
      business we serve, not convinced it works, something else). If two of those
      never get used and something you hear weekly is missing, say so: it is one
      line to change while nothing has been recorded, and a rename later
      invalidates the counts already collected.

- [ ] **Confirm 14 days is the right staleness threshold.** An open deal on the
      Sales board that has not moved in a fortnight now carries an amber dot and
      a per-column count. If your cycle means 14 days is normal, the whole board
      will glow amber and the signal is worthless. Tell me the number.

- [ ] **The reason and notes are only as good as the habit.** Every no now costs
      a reason click and every outcome offers a notes box. If that friction stops
      you recording outcomes at all, the funnel goes blank and that is worse than
      no reasons. Tell me if it drags and I will make the no-show path one click
      again.

## Agency keys panel (Onboarding > Keys, 31 July 2026)

- [ ] **Create the scoped Cloudflare token. Nothing else in this build works
      without it.** Cloudflare dashboard, My Profile, API Tokens, Create Token,
      Custom. ONE permission: Account, Cloudflare Pages, Edit. Nothing else, and
      scoped to your account only. Then
      `doppler secrets set CF_DEPLOY_TOKEN` in `hauck-command-center/prd`, and
      `node scripts/cf-rebind.mjs --add CF_DEPLOY_TOKEN` to bind it. Until this
      exists the panel says "Apply is off" and saves reach Doppler only, which
      is exactly how it behaved before. Deliberately NOT the account-wide
      CLOUDFLARE_API_TOKEN: that one can touch DNS and every other Worker, and
      it stays on your machine.

- [ ] **Press Apply once, and watch it land.** The write path to Cloudflare has
      never been exercised from inside the app. The blanking guard is tested and
      copied from cf-rebind, but a real Apply against the real project is the
      only thing that proves the deploy trigger.

- [ ] **Generate the two cron secrets, and paste them into their Workers.** The
      panel makes the value and shows it once. `HEALTH_CRON_SECRET` goes into
      `workers/health-cron` and `ADS_CRON_SECRET` into `workers/ads-cron`, both
      via `wrangler secret put`. They must be DIFFERENT values. Set in only one
      place and the jobs silently do nothing, which is the state they have been
      in for weeks.

- [ ] **Do not press Regenerate on SESSION_SECRET or the VAPID pair casually.**
      Both now have a button where they used to have a command line. The first
      signs every user out including clients; the second unsubscribes every
      device from push with no way back for anyone who dismissed the prompt.
      The panel asks first, but it will do it.
