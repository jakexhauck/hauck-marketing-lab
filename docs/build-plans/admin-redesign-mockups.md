# Admin Redesign — Mockup Plan

Turning Jake's tracker spreadsheets into native admin pages. This plan lists every mockup to build,
the design rules for each, and how we fan them out to cloud instances.

- **Design backbone:** Bento Bold (locked). Rules in `command-center/docs/mockups/admin-redesign/_bento-system.md`. Reference build: `cold-calling.html`.
- **Variations:** 3 per surface (A table-first, B dashboard-first, C split/paneled). ALL are Bento Bold; they differ only in layout/emphasis.
- **Process:** exactly like Cold Calls — dispatch cloud instances, Jake reviews the gallery, picks one per surface, iterate.
- **Phase 1 = manual entry** (editable cells, app is source of truth). Phase 2 auto-fill from GHL/Meta is later, out of scope for mockups.

## Placement recap
| Pillar | Surfaces |
|---|---|
| Command | Business Health dashboard |
| Acquisition | Leads · Cold Call (DONE) · Cold SMS |
| Sales | Sales Data (reuses daily-funnel template) |
| Fulfillment | Client cockpit (kept) + Billing tab + Ad Tracking sub-tab |
| Operations | Scaling Calculator · Founder Time Audit · Daily Task List |

## Status — mockups done, layouts PICKED (2026-07-17)
- [x] Cold Call — `cold-calling.html` (Bento Bold, editable, month nav). APPROVED (reference impl).
- [x] Business Health → **B** (zoned: Money / Clients & Retention)
- [x] Leads → **B** (status-count tiles filter the table)
- [x] Cold SMS → **B** (in-page sub-nav: Daily · Monthly · Script Test)
- [x] Client Billing → **B** (grouped bento cards: Deal · Cash · Dates · Status)
- [x] Ad Tracking → **A** (wide grouped table, Spend/Funnel/Qualify/Revenue bands)
- [x] Scaling Calculator → **C** (compact inputs card + result tile row, hero daily number)
- [x] Time Audit → **A** (calendar grid, leverage colors, $/day footer)
- [x] Tasks → **A** (editable checklist table)
- Sales Data = reuses the Cold Call daily-funnel engine (different columns).
NEXT: per-surface implementation plans in `docs/build-plans/admin-redesign/`.

---

## 1. Cold SMS  (Acquisition)
**Purpose:** daily SMS-outreach funnel, plus monthly unit economics and an A/B script test.
**Reuses:** the `cold-calling.html` daily table (editable, month nav, auto-populated days).
**Daily funnel columns:** Date · SMS Sent · Positive Replies · Reply % (calc) · Meetings Booked · Reply→Book % (calc) · Book→Sent % (calc) · Notes.
**Stat tiles:** SMS Sent (MTD) · Reply % · Meetings Booked · Book→Sent %.
**Extra block 1 — Monthly economics** (one row per month): Month · Total SMS Sent · VA Cost · Calls Booked · Calls Showed · Show Rate · SMS/Client · SMS Cost · Total Cost · Cost/Call · Cost/Showed · New Clients · Cash Collected · CAC · ROI · LTV.
**Extra block 2 — A/B script test** (4 variation rows): Variation · Total Sent · Positive Replies · Positive Reply % · Calls Booked · Booking % · Clients Closed.
**Variations:**
- A: daily table full-height primary; economics + A/B as compact panels you scroll to below.
- B: a small sub-nav inside the SMS page (Daily · Monthly · Script Test); each its own clean view.
- C: daily table + a right-hand bento panel stack that swaps between Monthly economics and A/B test.

## 2. Leads table  (Acquisition)
**Purpose:** pre-sale prospect CRM, spreadsheet-style, worked daily.
**Columns:** First Name · Last Name · Phone · Timezone · Status · First Contact · Source · Appointment Date · No Answer · Last Contact · Follow Up Date · Email · Notes.
**Status values (dropdown):** New · Contacted · No Answer · Booked · Qualified · Closed · Dead (color-coded chips).
**Behaviors:** inline-editable rows, sortable columns, add-a-row, status as a colored pill dropdown.
**Variations:**
- A: pure full-width editable table (spreadsheet feel), status chips inline.
- B: table + a top bento strip (counts per status: New / Contacted / Booked / etc.) as filters.
- C: table + a "Due today" follow-up queue panel (leads whose Follow Up Date is now) on the right.

## 3. Ad Tracking  (Fulfillment — per-client, Paid Ads sub-tab)
**Purpose:** per-client daily paid-ad funnel, spend → revenue → ROAS. Wide (30 columns).
**Columns (grouped):** Date | Spend · Impressions · CPM · Clicks · CPC · CTR · Link Clicks · CPL · CPNL | New Leads · LP Conv · Demos Booked · Cost/Demo · Lead→Book % | Qualified · Disqualified · No-Show · Qual % · Cost/Qual | Sales · Contracted Rev · UF Cash · New MRR · CPA · Rev ROAS · UF ROAS.
**Summary:** rolling windows 4-day / 7-day / 30-day / MTD as pinned rows or tiles.
**Context:** lives inside the client cockpit under Paid Ads; show the cockpit header + tab bar. Manual entry.
**Variations:**
- A: one very wide horizontally-scrolling table with grouped column headers (Spend / Funnel / Revenue).
- B: collapse into stages — a bento row of stage tiles (Spend, Leads, Demos, Sales, ROAS) above a trimmed daily table.
- C: the 4/7/30/MTD windows as 4 bento cards up top, full daily table below.

## 4. Client Billing tab  (Fulfillment — per-client cockpit tab)
**Purpose:** one client's deal + money record. NOT a table, a record card. Lives as a new cockpit tab.
**Fields:** Source · Date Closed · Service · Payment Arrangement · Upfront Cash · Remaining to Collect · Total Cash Collected · Billing Date · Renewal Date · Status (Active/Churned) · Churn Date · Last Touchpoint · Notes. Plus a link to this client's Ad Tracking.
**Behaviors:** editable fields; money formatted; renewal/billing dates highlight when near; status pill.
**Variations:**
- A: single bento panel, labeled fields in a clean 2-column grid.
- B: grouped bento cards (Deal · Cash · Dates/Renewal · Status) side by side.
- C: a summary strip of money tiles (Total Collected, Remaining, MRR) on top + editable detail fields below.

## 5. Business Health dashboard  (Command home)
**Purpose:** whole-agency KPI read. Replaces the old Command content.
**Metrics:** CAC · LTV · LTV:CAC · ROAS · Churn % · Total Clients (start/new/end) · Avg Rev/Client · Avg Retention · Profit Margin · Avg LTV · New MRR.
**Behaviors:** each metric a bento stat tile with benchmark chip (LTV:CAC >3, ROAS >3, CAC target, churn watch). Some tiles editable (manual inputs), some computed.
**Variations:**
- A: one big bento grid of KPI tiles, sized by importance (hero tiles for LTV:CAC, ROAS, MRR).
- B: two zones — "Money" tiles row + "Clients/Retention" tiles row, each grouped in a panel.
- C: a hero summary card (headline health) + supporting tile grid + a simple month-over-month mini list.

## 6. Scaling Calculator  (Operations)
**Purpose:** cash goal in → required daily activity out.
**Inputs (editable):** Current Revenue · Cash Goal · Offer Price · Avg Cash/Close · Closing % · Show Rate · Booking Rate.
**Outputs (computed):** New Clients Needed · Calls Needed · Total Calls Needed · Total Monthly Input · **Total Daily Input Needed** (the headline).
**Behaviors:** type inputs, outputs recompute live. Keep the sheet's "underestimate your KPIs" note.
**Variations:**
- A: split panel — inputs form (left) / result tiles (right), headline "Daily Input" as a hero tile.
- B: a vertical flow (goal → math → daily number) reading top to bottom like a funnel.
- C: inputs as a compact bento card, results as a big colorful tile row beneath.

## 7. Founder Time Audit  (Operations)
**Purpose:** weekly time grid; tag each block by leverage + task; see the $ value of your time.
**Grid:** rows = 30-min blocks 6:00 AM–10:00 PM; columns = Mon–Sun. Each cell = a tagged block.
**Legends:** Leverage (Low → Low/Mid → Mid → Mid/High → High, color scale) and Task type (Outreach, Sales calls, Roleplays, Scraping leads, Scrolling, etc.). Row "Total $ Amount" per day.
**Behaviors:** click a cell to tag it (leverage color + task); day totals compute a dollar value.
**Variations:**
- A: full calendar grid, cells colored by leverage, legend rail on the right.
- B: grid + a bento summary (hours by leverage bucket, $ per day) across the top.
- C: a lighter "list per day" layout for narrow screens, grid on wide — same tagging model.

## 8. Daily Task List  (Operations)
**Purpose:** simple working checklist.
**Columns:** Done (checkbox) · Task · Notes / Files · Status · Updates.
**Status values:** To do · Doing · Done (color chips).
**Behaviors:** check off, add rows, edit inline, status pill.
**Variations:**
- A: clean editable table with checkboxes and status chips.
- B: table + a small bento counter strip (To do / Doing / Done counts).
- C: a light kanban-lite (three status columns of task cards) instead of a table.

---

## Dispatch method
For each surface, launch **3 cloud instances** (one per variation A/B/C). Each instance:
1. Reads `_bento-system.md` (the backbone) + `cold-calling.html` (reference) + its surface brief + its variation letter.
2. Writes `command-center/docs/mockups/admin-redesign/<surface>-<A|B|C>.html`.
3. Returns the path + a one-line description.
Then build a per-surface `index` switcher (like the Cold Calls gallery) so Jake flips A/B/C and picks.

**Total:** 8 surfaces × 3 = 24 mockups. Can run in waves (e.g. Acquisition first: SMS + Leads = 6).
