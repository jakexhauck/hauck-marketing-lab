# 18 — Paid Ads hub (client-facing, nested sidebar)

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Frame

**What:** Turn the `Marketing → Paid Ads` "coming soon" stub into a self-serve hub for
clients, structured exactly like Social Media: one expandable parent in the desktop sidebar
that opens a dropdown of sub-pages, all under `/marketing/paid-ads/*`.

**Why:** Clients want to see, in plain English, that their ad money is working: what's
running, who it brought in, and what the ads actually look like. The old media-buyer
dashboard at `/paid-ads` (CPM/CPC/CTR/funnel) is too technical and is being abandoned. We
build new, client-first pages.

**Chosen visual direction:** Variant 3, "Friendly Cockpit" (mockup
`docs/mockups/paid-ads-v3.html`). Warm, with simple pure-CSS plain-English visuals (mini bar
charts, progress meters, colored stat tiles), indigo brand plus sparing green/amber accents.
Build the real pages against that mockup. The other two mockups are reference only.

**Done when:**
- Sidebar `Marketing → Paid Ads` is an expandable group (not a coming-soon stub) with 4
  children, mirroring `Social Media`.
- All 4 pages render: demo/preview (`?demo=1`) shows the designed, populated layout; a real
  (un-connected) session shows the zeroed/empty state + a "not connected yet" notice.
- The golden rule holds: a connected client never sees fabricated data.
- Old `/paid-ads`, `/admin/ads` dashboards are untouched and unreferenced by the new pages
  (built completely new, nothing reused).
- `tsc` + `vite build` pass.

## Non-goals

- No live Meta Ads data wiring. Same posture as Social: designed UI now, GHL/Meta source
  later. Real sessions are empty until connected.
- No edits to the old `/paid-ads` (PaidAds / PaidAdsDesktop) or admin ads tracker. Leave as-is.
- No mobile-specific layout pass beyond responsive defaults (matches Social).

## Page structure (4 pages)

| Page | Route | What the client sees |
|---|---|---|
| **Overview** | `/marketing/paid-ads` | The glance. Money-focused KPI row (Spend, Leads, Cost per lead, New customers). "What's running now" count, a recent-leads peek, and one plain-English line on how the month is going. |
| **Your Ads** | `/marketing/paid-ads/creatives` | Gallery of every ad running: creative thumbnail (image/video), the ad copy (headline + primary text), and simple per-ad stats (people reached, leads from it). Grouped active vs paused. No jargon. |
| **Leads** | `/marketing/paid-ads/leads` | The real people the ads brought in: name, when, call vs form, which ad, status. The payoff. |
| **What's working** | `/marketing/paid-ads/insights` | Dimmed-down for clients. No CPM/CPC/funnel. Just simple cards: "Your best ad this month", "Leads vs last month" (up/down), best day/area. Plain English only. |

Labels in the sidebar dropdown: **Overview · Your Ads · Leads · What's working**.

## GHL sales-process grounding (real pipelines, not invented statuses)

Real data (when wired) comes from GHL. A paid-ad lead's journey spans TWO real pipelines
(IDs from the test sub-account `r0WfsA12qpBv7M185V3v`, pulled 2026-06-29; see
`reference_ghl_pipeline_stages` memory):

- **Paid Ad's Pipeline** `sdBUBRxljQHm2yb2w9MG` (top of funnel): Lead In, Lead In No
  Appointment Booked, Lead Responded, No answer, Not Qualified, Intro Call Waiting
  Confirmation, Intro Call No Confirmation.
- **Sales Pipeline** `bKDivijtLXU8QvIPxMIz` (after a confirmed intro call): Intro Call
  Confirmed, Estimate Scheduled, Estimate Completed, Job Booked, Job Completed, No-Close,
  Follow Up, Abandoned.

Won/Lost is GHL's separate opportunity `status` field, not a stage.

The Leads page does NOT show 15 raw stage names. It rolls the real stages into 6 plain,
client-friendly buckets (the status chips). This rollup is the single source of truth for the
build's `LeadStatus` and is what the future GHL wiring maps stageId -> bucket against:

| Bucket (client chip) | Tone | Real GHL stages it covers |
|---|---|---|
| **New** | brand | Lead In, Lead In No Appointment Booked |
| **Trying to reach** | warning | No answer, Intro Call No Confirmation |
| **In touch** | brand | Lead Responded, Intro Call Waiting Confirmation, Intro Call Confirmed |
| **Quote sent** | neutral | Estimate Scheduled, Estimate Completed |
| **Won** | positive | Job Booked, Job Completed |
| **Not a fit** | muted | Not Qualified, No-Close, Abandoned |

Metric definitions (Overview + What's working), grounded in the above:
- **Leads** = opportunities that entered the Paid Ad's pipeline in range.
- **New customers / Jobs booked** = ad-sourced opps reaching Won (Job Booked / Job Completed).
- **Cost per lead** = spend / leads. **Return** = won job value / spend, shown in plain words
  ("every $1 brought back $7.70").
- Do NOT reuse the old `adsTracker.ts` 8-status sheet model (New Lead, Sending Photos, Sold,
  etc.). That stays with the legacy `/paid-ads` tracker. The new pages use the 6 buckets above.

Build now uses demo data shaped to these buckets/metrics; real GHL wiring is deferred (same
posture as Social: empty until connected). Map cleanly later via the stageId -> bucket table.

## Design + data rules (inherit from Social)

- One shared `shared.tsx` for the Paid Ads surfaces, mirroring `routes/social/shared.tsx`:
  - `PAID_ADS_CONTAINER` scroll container (copy Social's `SOCIAL_CONTAINER`).
  - `NotConnectedNotice` equivalent ("Not connected yet" → connect the Meta ad account
    through GoHighLevel; disabled "Connect (coming soon)" button).
  - Demo gate via `demoMode()` from `src/demo/demoMode`. Sample constants for populated view,
    zeroed/empty copies for real sessions, exactly like `SocialOverview`.
- Reuse existing primitives only (no new design system): `Shell`, `PageHeader`, `Panel`,
  `PanelHeader`, `Badge`, `Button`, `EmptyState`, `Segmented` from `components/ui`.
- No em dashes in any UI text.
- Money/number formatting via existing `src/lib/format` (`formatMoney`, `formatNumber`, etc.).

## File-by-file plan

### 1. `src/lib/nav.ts`
Replace the single Paid Ads stub:
```ts
{ to: "/marketing/paid-ads", label: "Paid Ads", icon: Megaphone, comingSoon: true },
```
with an expandable group (drop `comingSoon`), mirroring the Social Media entry:
```ts
{
  to: "/marketing/paid-ads",
  label: "Paid Ads",
  icon: Megaphone,
  children: [
    { to: "/marketing/paid-ads",            label: "Overview",       icon: LayoutDashboard },
    { to: "/marketing/paid-ads/creatives",  label: "Your Ads",       shortLabel: "Ads",     icon: Images },
    { to: "/marketing/paid-ads/leads",      label: "Leads",          icon: UserPlus },
    { to: "/marketing/paid-ads/insights",   label: "What's working", shortLabel: "Results", icon: BarChart3 },
  ],
},
```
Add any missing lucide icon imports (`Images`, `UserPlus`; `LayoutDashboard`, `BarChart3`
already imported). No other nav code changes: `Sidebar.tsx` `NavItemGroup`, `flattenNav`,
bottom bar all already handle `children`.

### 2. `src/routes/paid-ads/shared.tsx` (new)
Port Social's `shared.tsx`: container constant, `NotConnectedNotice`, any small shared glyph
helper (e.g. a platform/objective chip). Keep it minimal; add only what 2+ pages use.

### 3. `src/routes/paid-ads/AdsOverview.tsx` (new)
The "Glance". KPI row + "What's running" + recent-leads peek + status line. Demo populated,
real zeroed + `NotConnectedNotice`. Model on `SocialOverview.tsx`.

### 4. `src/routes/paid-ads/AdsCreatives.tsx` (new)
"Your Ads" gallery. Card grid: thumbnail, ad copy, simple stats, active/paused badge.

### 5. `src/routes/paid-ads/AdsLeads.tsx` (new)
Leads list/table from ads. Name, date, channel (call/form), source ad, status. Status uses
the 6 plain buckets from the GHL grounding section (New / Trying to reach / In touch / Quote
sent / Won / Not a fit) as colored chips, NOT raw stage names and NOT the legacy sheet model.
Define the bucket list + tone in a small local module (or `paid-ads/shared.tsx`) so Overview
and What's working share it. New, simple table built on `Panel` (do not import the admin
`ads-tracker` `LeadTrackerTable`). Summary strip on top (e.g. 32 leads, 7 won).

### 6. `src/routes/paid-ads/AdsInsights.tsx` (new)
"What's working", dimmed down. A few plain-English cards only. No charts-with-jargon.

### 7. `src/App.tsx`
- Remove the `/marketing/paid-ads` `ComingSoon` route (line ~323).
- Add 4 routes, each `<ProtectedRoute>`-wrapped, mirroring the Social block (lines ~327-331):
  ```
  /marketing/paid-ads            -> <AdsOverview />
  /marketing/paid-ads/creatives  -> <AdsCreatives />
  /marketing/paid-ads/leads      -> <AdsLeads />
  /marketing/paid-ads/insights   -> <AdsInsights />
  ```
- Add the 4 imports next to the Social imports.

## Build order

1. `nav.ts` group + icons (sidebar dropdown appears; routes 404 until added).
2. `paid-ads/shared.tsx`.
3. `AdsOverview` (the anchor page; proves the demo/empty pattern).
4. `App.tsx` routes wired incrementally as each page lands.
5. `AdsCreatives`, `AdsLeads`, `AdsInsights`.
6. Verify.

## Verify

- `npx tsc --noEmit` and `vite build` pass.
- Run the app; sidebar `Marketing → Paid Ads` expands to 4 children; deep-linking each route
  keeps the group open and the correct child highlighted (NavItemGroup behaviour).
- `?demo=1` shows populated designed layouts on all 4; a plain session shows zeroed/empty +
  not-connected notice on all 4. No fabricated data leaks into a connected session.
- Screenshots of all 4 pages in both states (M9 visual proof).

## Open questions

- Sub-page labels final? (Overview / Your Ads / Leads / What's working.)
- "What's working" content: which 3-4 plain cards are most useful to a local-business owner.
