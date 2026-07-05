# App Revision Doc - Analysis & Task Breakdown

Source: Jake's Google Doc of manual page revisions (read 2026-07-05).
Status: **ANALYSIS ONLY - nothing built.** This is the doc turned into tasks, with
current-state notes and open questions. Do not start work until the open questions
at the bottom are answered.

Legend for each task:
- `[UI]` pure page/UI/data-display work (safe to do in the pages-first phase)
- `[WIRE]` needs real data wiring or a GHL/automation write path (deferred to the automation phase per the standing "pages before automations" rule)
- `[DECISION]` blocked on a product decision from Jake (see Open Questions)
- `[BLOCKED?]` may be infeasible with current data sources; flagged for feasibility

Current-state facts below come from a live audit of `command-center/app`.

---

## Sections with no content in the doc (noted, no tasks yet)
Admin (only: "build the onboarding process"), Acquisition, Sales, Service Delivery,
Operations, Jobs (`- do`), Contacts (`- do`), Calendar (`- do`), Revenue (`- do`),
Assets, Team. **Client** has two cross-cutting ideas (see below). Everything else is
blank / "do" and is parked until Jake fills it in.

### Client (cross-cutting)
1. `[WIRE]` Full lead-source tracking: know where every lead comes from, surfaced in the admin view.
2. `[WIRE]` Every client page that shows data feeds back to the admin view.
> These are an analytics/telemetry layer across the whole app, not a single page. Big, deferred.

---

## Paid Ads
Current tabs: **Overview / Your Ads / What's working**. All wired to real Meta via
`GET /api/ads/insights` (honest zeros until a client's Meta is connected). There is
ALSO an orphaned, demo-only media-buyer dashboard at `/paid-ads` (funnel + campaign
table + CTR/CPC/CPM depth) that is not in the nav.

1. `[DECISION]` Add an in-depth ad-data tab, **replacing** "What's working". (Q1: is this reviving the old dashboard's depth, or a new simpler view? Full metric list?)
2. `[UI]` Add a "phase of ads" indicator (Learning / Scaling) so the client knows the current phase.
3. `[UI/WIRE]` Confirm the data chart pulls the correct sources: spend, new leads, cost per lead, new customers, revenue from ads, ROAS. (Overview already shows all six as KPI tiles - mostly done; verify wiring.)
4. `[UI]` Add a funnel view for when we send traffic to a funnel - ships as a **"coming soon"** page (every client starts on lead forms).
5. `[BLOCKED?]` Let the client view the Meta media library, as its own separate page. (Q2: real Meta media-library embed vs a link-out? Feasibility.)
6. `[UI]` "Your Ads" shows **live ads only** (currently shows active + paused).
7. `[BLOCKED?]` Click into each ad on "Your Ads" to see it per placement: Instagram/story/feed/reel views. (Q2: needs Meta ad-preview API; may not be available.)
8. `[UI]` On "Your Ads" cards, remove "people reached" and "leads from this ad".
9. `[UI]` Remove the description under the header.

## Google Reviews
Current tabs: **Overview / Ask for Reviews / All Reviews / What's working**. Rating hero
+ recent reviews are real (Google Places). The request→click→review funnel already exists
ON the Overview, is read-only, and is real (GHL review pipeline). All-Reviews and
What's-working are demo-only.

1. `[UI/DECISION]` Fix the Overview page formatting. (Q3: what specifically is wrong?)
2. `[UI]` Add a tab showing the Google review pipeline, **read-only** (client can't move leads). If no campaign has run for the sub-account, show a "not started yet" state. (Note: a read-only funnel already exists on Overview - Q4: move it to its own tab, and is "pipeline" the funnel or the contact list?)
3. `[DECISION]` Rename "What's working" to something more professional that reads as an all-data overview. (Q5: proposed name?)
4. `[UI]` Remove the top-right "Reply to reviews" and "Ask for a review" buttons.
5. `[UI]` Remove the "your reputation at a glance…" description.
6. `[WIRE]` Wire the correct data into Overview (the 2×2 stat chips are currently demo).
7. `[WIRE]` "Ask for reviews" fires from a direct trigger only when a job is completed; needs an easy way to mark a job done and drop that customer into the list (deliberately NOT automatic). (UI list of completed-job contacts already exists; the trigger is the automation piece - Q6.)
8. `[BLOCKED?]` Add a view of the full Google Business Profile backend (photos, videos, links, everything Google asks us to add) plus a public-facing preview of the profile. (Needs GBP API; access approval was submitted, pending. Q7: full management vs read-only preview?)

## Commercial Outreach (rename of "Campaigns")
Current "Campaigns" section tabs: Overview / Campaigns / Audiences / Reactivation /
What's working. Only **Audiences** and **Reactivation** are real; the rest are demo.
The current framing is "done-for-you messaging to your existing customers."

1. `[UI]` The "live" tab should say **"in the works"** to clients.
2. `[DECISION]` Rename the Campaigns section to **Commercial Outreach** (or similar). (Q8: is Commercial Outreach specifically B2B cold outreach to commercial businesses, i.e. a new concept, vs the existing customer-messaging? What happens to the existing customer-campaigns + Audiences?)
3. `[UI]` Add a tab showing the email schedule.
4. `[WIRE]` Add a tab for "emails sent" - client views every email sent to the commercial businesses.
5. `[WIRE]` Add a full-data tab: CTR and other email metrics, plus appointments and leads generated.
6. `[WIRE/BLOCKED?]` If we can reach these companies by SMS, add SMS data and an SMS view alongside emails on the all-emails page.

## Reactivation (promote to its own section)
Currently a real page mounted under Campaigns.

1. `[UI]` Give Reactivation its own top-level tab/section.
2. `[UI]` Add a pipeline-view page inside it.
3. `[UI]` Repurpose the current Reactivation page as the full-data page.
4. `[WIRE]` Add a page to view the SMS and email being sent to customers.

## Group Outreach (new section, Facebook groups)
Greenfield - nothing exists.

1. `[UI]` Add a standalone Facebook Group Outreach tab/section.
2. `[UI]` Make the live page say **"in the works"**.

## Website
Current tabs: **Overview / Pages / Request a Change / What's working**. Overview already
shows a full live-site preview + desktop/mobile toggle + a KPI data row. What's-working is
real GA4. Pages tab's "request a change" button navigates to the Request page (which always
previews the home page).

1. `[UI]` Overview shows the whole website; **remove the data** from the main page; redo the mobile view so it looks like a real phone with the site on it.
2. `[UI/WIRE]` Change "What's working" into a data page: all Google Analytics data plus chat-widget data and estimate-form data. (GA4 is already there; chat-widget + estimate-form data is new - Q9: source?)
3. `[UI]` Combine Pages + Request-a-Change: the "request a change to this page" button on the Pages tab should drop a pin for **that specific page** in place, not navigate away.
4. `[UI]` Remove the "your storefront…" description and the line under it.
5. `[UI]` Remove the "request a change" button at the top of Overview.

## Social Media
Current tabs: **Overview / Ideas / Calendar / My Posts / What's working**. Posts list/create/
delete are real (GHL Social Planner). Reach/engagement metrics are NOT available from the
Social Planner API. Composer already gates platforms on connected accounts. AI features
(Rewrite, "in your voice", tone chips) exist but are demo-gated/unwired.

1. `[UI]` Remove the description under the header.
2. `[UI]` Rename "Calls & messages" → "DMs"; remove "People reached".
3. `[UI]` Don't offer Instagram posts if IG isn't connected (composer already gates this - verify + extend anywhere else).
4. `[UI]` Remove the templated ideas from the Ideas section.
5. `[UI]` Remove everything AI-related across the whole Social section.
6. `[WIRE/BLOCKED?]` Change "What's working" into a full data page. (Engagement/reach data isn't exposed by the Social Planner - Q10.)
7. `[BLOCKED?]` On "My Posts", show all comments/likes and let the client respond to comments. (No comments/engagement endpoint in the Social Planner - Q10.)

## Inbox
Current: ONE unified stream (`/conversations`), all channels merged per contact; origin
classifier already tags paid ad / estimate form / chat widget / social / call. IG DM and
Messenger are currently supported.

1. `[UI]` Remove the description under the header.
2. `[UI/DECISION]` Make each channel (SMS, email, etc.) its own page, structured like the others. (Q11: this reverses the unified inbox into channel-separated pages - confirm.)
3. `[UI]` Add a disclaimer/indicator when you're talking to the same contact over both SMS and email.
4. `[DECISION]` Integrate the current Leads section into the main inbox. (Q12: how does this square with Leads becoming pure pipelines?)
5. `[UI]` For each page, explicitly categorize where the lead came from (paid ads, estimate form, chat widget; later FB group + commercial outreach). (Classifier already exists - surface it explicitly.)
6. `[UI]` Remove "chat widget" as its own conversation type (chat replies go out over SMS + email).
7. `[UI]` Only email + SMS in the inbox - no Instagram DMs, no Messenger.

## Leads
Current: two surfaces - "New Leads" hub (source worklist, mostly demo, still has intro-call
UI) + "Pipeline" kanban (real GHL sales pipelines, button/sheet stage moves, no trash view).

1. `[UI/DECISION]` Convert the section to mainly pipelines: **Organic, Paid Ads, Sales**. (Q13: does the "New Leads" hub go away? Which real pipelines map to these three?)
2. `[WIRE]` Automations correlate to the leads; the client must not be able to mess with the automations. (Automation phase.)
3. `[UI]` Remove anything referencing an intro call (still present in the New Leads hub).
4. `[UI/WIRE]` Make each pipeline **read-only** (tags/automations move leads). Give the client an easy way to tell the app what happened at "job booked" (e.g. rescheduled, and the closed amount). (Q14: build the read-only UI + placeholder outcome controls now, defer the GHL write path?)
5. `[UI]` Add a "trash leads" page: dead-lead stages (e.g. sales "no close", organic "no response") move here, one page covering all three pipelines, so the main pipelines stay clean.
6. `[UI/DECISION]` Stages per pipeline:
   - **Sales:** Estimate scheduled → Estimate completed → Job booked → Job completed → Follow up.
   - **Organic:** chat-widget + estimate-form submissions; show when a lead responds to the auto follow-up; chat-widget rows show "client needs to respond" (no auto follow-up for chat).
   - **Paid Ads:** same, keyed on a lead-form submit → responds to the auto follow-up.
   - **Trash:** every stage not listed above, one page for all three pipelines.
   (Q13/Q14: these app stages must map to the real GHL pipeline stages.)

---

## Open Questions (must answer before any work)
- **Q1 (Paid Ads):** "In-depth data" tab - revive the old media-buyer dashboard depth (CTR/CPC/CPM/impressions + campaign table), or a new simpler view? Exact metrics?
- **Q2 (Paid Ads):** Meta media library page + per-ad placement previews (feed/story/reel) - are you OK that these depend on Meta APIs that may or may not expose them? Priority?
- **Q3 (Reviews):** What specifically is wrong with the Overview formatting?
- **Q4 (Reviews):** The read-only funnel already lives on Overview - move it to its own "pipeline" tab? Is "pipeline" the funnel or the actual contact list?
- **Q5 (Reviews):** New name for "What's working"?
- **Q6 (Reviews):** For now, is the completed-jobs list enough (trigger mechanism deferred to automation phase)?
- **Q7 (Reviews):** GBP backend view - full profile management vs read-only preview? OK that it's blocked on GBP API approval?
- **Q8 (Outreach):** Is "Commercial Outreach" B2B cold outreach to commercial businesses (a new concept), vs the existing customer messaging? What happens to the existing customer-campaigns + Audiences?
- **Q9 (Website):** Where do chat-widget and estimate-form submission numbers come from (GHL)? OK to defer that data to the wiring phase and ship GA4 now?
- **Q10 (Social):** Engagement data (comments, likes, reach) is not exposed by the Social Planner API. Do you have another source, or do the "full data" page and comment-replies get parked until we do?
- **Q11 (Inbox):** Confirm you want the unified inbox split into channel-separated pages (an SMS page, an Email page), not one merged stream.
- **Q12 (Inbox/Leads):** "Integrate leads into the inbox" vs "Leads becomes pure pipelines" - do lead conversations live in the Inbox while the Leads section is just read-only pipeline boards?
- **Q13 (Leads):** Which real pipelines map to Organic / Paid Ads / Sales? Does the "New Leads" hub get removed entirely?
- **Q14 (Leads):** Build the read-only pipeline UI + placeholder outcome controls now and defer the actual GHL write-back to the automation phase?
