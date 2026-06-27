# Admin Service Delivery: Emoji Lane Boxes + Paid Ads Tracker

> **For agentic workers:** execute task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD where testable (the math module); UI verified by running the app and screenshots.

**Goal:** Two changes to the admin console. (A) Render every pillar's lanes as small emoji boxes instead of a list. (B) Turn the Service Delivery → Paid Ads lane into a real per-client tracker that mirrors Jake's Google Sheet: an all-clients overview, and a per-client dashboard (funnel + per-ad breakdown + lead tracker + Meta data), driven by mock data first.

**Architecture:** Lane data stays config-driven in `lib/pillars.ts` (add an `emoji` and optional `to` per lane). `LanesTab` switches from list rows to a box grid reusing the existing `.pk-lane` card CSS. The Paid Ads tracker is new routes (`/admin/ads`, `/admin/ads/:clientId`) whose math lives in one pure module (`lib/adsTracker.ts`) fed by `lib/mockAds.ts`. The math and types match the sheet exactly so real Meta + Supabase data swaps in later without touching the UI.

**Tech Stack:** React + react-router-dom (plain `<Routes>` in `App.tsx`), TypeScript, Tailwind theme tokens + the scoped `.pk-kit` styles, Vitest for the math module.

## Global Constraints

- No em dashes anywhere (chat, UI, comments, copy). Use commas, periods, parentheses, colons.
- Modern Motion design kit: indigo/violet brand, glass surfaces, JetBrains Mono for figures, Poppins display / Inter body. Admin styling is scoped to `.pk-kit`.
- Single source of truth: lane structure lives only in `lib/pillars.ts`. Adding fields there must flow everywhere (sidebar, pillar pages, infra map) with no other edits.
- Mock data only in this build. No backend, no Supabase migration. Real wiring is a tracked follow-up.
- Currency in the tracker is GBP (£), matching the source sheet.
- Metric definitions are copied verbatim from the sheet legend (see Task 4). Do not invent new ones.

---

## Spec: what we are building

### Part A: emoji lane boxes (all pillars)

Today `LanesTab.tsx` renders lanes as full-width list rows (`.pk-li`). Replace with a responsive grid of small boxes (reusing `.pk-lane` card styles, lightly restyled to add an emoji and feel "smaller"):

- Each box: emoji (top-left), lane name, one-line `what`, status dot, motion pill (Deploy/Manage) where present.
- Pipeline pillars (Sales, Onboarding): boxes carry a small step number.
- Service Delivery: keep the **Deploy (clone)** and **Manage (ongoing)** section headers, each a box grid.
- A box links to its lane workspace by default, or to `lane.to` when set (Paid Ads points at `/admin/ads`).

### Part B: Paid Ads tracker (mock data)

Three layers, mirroring the sheet:

1. **All-clients overview** (`/admin/ads`): a totals strip (every client rolled up: Leads, Pickups, Bookings, Sales, Revenue, Ad Spend, ROAS) above a table, one row per client with the same headline stats. Click a row to drill in. This is both the "client list" and the "see every client at a glance" admin view.

2. **Per-client tracker** (`/admin/ads/:clientId`), three sub-tabs:
   - **Dashboard**: headline KPI strip (Leads, Pickups, Pickup Rate, Bookings, Booking Rate, Sales, Sales % of leads, Close Rate of bookings, Revenue, Ad Spend, ROAS) + per-ad breakdown table (Ad Name, Spend, Leads, Bookings, Sales, Revenue, ROAS, Cost/Lead, Cost/Booking).
   - **Lead Tracker**: every lead (Date, Name, Contact, Lead Information, Status, Value, Notes, attribution Ad). Status is an editable dropdown; Value editable on Sold. Edits are local state only (mock).
   - **Meta Data**: daily per-ad spend pull (Date, Spend, Impressions, Reach, Link Clicks, CTR, CPM, Campaign/Ad Set/Ad), read-only.

3. **The math** (`lib/adsTracker.ts`): pure functions over `{ leads, ads, metaRows }`, returning the computed funnel and per-ad rows. Mock data shaped identically to future real data.

### File structure

- Modify `command-center/app/src/lib/pillars.ts` — add `emoji` to every lane; add optional `to` to `PillarLane`; set `to: "/admin/ads"` on the `paid-ads` lane.
- Modify `command-center/app/src/components/pillars/tabs/LanesTab.tsx` — list rows become box grid.
- Modify `command-center/app/src/components/pillars/PillarKit.tsx` — add emoji-box CSS (extend `.pk-lane`).
- Create `command-center/app/src/lib/adsTracker.ts` — types + pure metric functions.
- Create `command-center/app/src/lib/adsTracker.test.ts` — Vitest tests for the math.
- Create `command-center/app/src/lib/mockAds.ts` — 2-3 mock clients with leads/ads/meta rows.
- Create `command-center/app/src/routes/admin/AdminAds.tsx` — all-clients overview.
- Create `command-center/app/src/routes/admin/AdminAdsClient.tsx` — per-client tracker shell + sub-tabs.
- Create `command-center/app/src/components/ads-tracker/` — `KpiStrip.tsx`, `AdBreakdownTable.tsx`, `LeadTrackerTable.tsx`, `MetaDataTable.tsx`.
- Modify `command-center/app/src/App.tsx` — register the two new admin routes.

---

## Task 1: Add emoji + `to` to lane config

**Files:**
- Modify: `command-center/app/src/lib/pillars.ts`

**Interfaces:**
- Produces: `PillarLane.emoji: string` (required after this task) and `PillarLane.to?: string`.

- [ ] **Step 1:** In the `PillarLane` interface add `emoji: string;` and `to?: string;` (a lane box links to `to` when set, else its lane workspace).
- [ ] **Step 2:** Add an `emoji` to every lane object. Suggested set (adjust to taste during visual review):
  - Operations: sops 📚, tooling 🛠️, stack 🧱, comms 💬, finance 💰, team 👥, reporting 📊, admin-legal 📑
  - Outreach: cold-email ✉️, cold-calling 📞, paid-ads-leadgen 🎯, linkedin 🔗, referrals 🤝, partnerships 🧩
  - Sales: qualified ✅, discovery 🔍, proposal 📝, follow-up 🔁, closed-won 🏆, nurture 🌱
  - Onboarding: welcome 🎉, kickoff 🚀, collect-access 🔑, tech-setup ⚙️, first-campaign 📣
  - Service Delivery: software 💻, website 🌐, sales-infra 🏗️, tracking 📡, ai-agents 🤖, paid-ads 🎯, seo 🔎, commercial-leadgen 🏭
  - Retention: reporting 📊, relationship 💌, performance 🎯, upsell 📈, saves 🛟
- [ ] **Step 3:** On the `paid-ads` lane, add `to: "/admin/ads"`.
- [ ] **Step 4:** Typecheck: `npm run -s build` (or `tsc --noEmit`) in `command-center/app`. Expected: passes (every lane now has `emoji`).
- [ ] **Step 5:** Commit: `feat(admin): add emoji + link override to pillar lanes`.

## Task 2: Lane box CSS

**Files:**
- Modify: `command-center/app/src/components/pillars/PillarKit.tsx` (the `PillarStyle` `<style>` block)

- [ ] **Step 1:** Extend the existing `.pk-lane` rules with an emoji header and a tighter min-width so boxes read smaller. Add:
  - `.pk-lanes { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }` (tighter than 248px).
  - `.pk-lane-emoji { font-size: 22px; line-height: 1; }` shown top-left.
  - A small step index for pipeline boxes: `.pk-lane-idx { ... }` (reuse `.pk-li-idx` look).
  - Keep hover lift + motion pill styles already present.
- [ ] **Step 2:** Verify by reading the file; no test. Commit with Task 3 (CSS + markup ship together).

## Task 3: LanesTab box grid

**Files:**
- Modify: `command-center/app/src/components/pillars/tabs/LanesTab.tsx`

**Interfaces:**
- Consumes: `PillarLane.emoji`, `PillarLane.to` (Task 1).

- [ ] **Step 1:** Replace `LaneRow` with a `LaneBox` that renders a card: `<Link to={lane.to ?? `/admin/pillar/${pillarId}/lane/${lane.id}`}>`, containing emoji, optional step index, label + status dot, `what`, and motion pill in the footer. Use classes `.pk-lane`, `.pk-lane-emoji`, `.pk-lane-top`, `.pk-lane-label`, `.pk-lane-what`, `.pk-lane-foot`.
- [ ] **Step 2:** Pipeline pillars: render `<div className="pk-lanes">` of `LaneBox` with `index={i+1}`.
- [ ] **Step 3:** Service Delivery: keep the two `pk-list-sec-h` headers ("Deploy (clone)", "Manage (ongoing)"), each followed by a `pk-lanes` grid of the filtered lanes.
- [ ] **Step 4:** Everything else: a single `pk-lanes` grid.
- [ ] **Step 5:** Run the app, open `/admin/pillar/service/lanes` and a pipeline pillar; screenshot. Boxes render with emojis, Deploy/Manage sections intact.
- [ ] **Step 6:** Commit: `feat(admin): render pillar lanes as emoji boxes`.

## Task 4: Ads tracker math module (TDD)

**Files:**
- Create: `command-center/app/src/lib/adsTracker.ts`
- Test: `command-center/app/src/lib/adsTracker.test.ts`

**Interfaces (produced — later tasks rely on these exact names):**
```ts
export type LeadStatus =
  | "New Lead" | "No Contact" | "Call Again" | "Email"
  | "Sending Photos" | "Booked" | "Sold" | "Lost";

export interface AdsLead {
  date: string; name: string; email: string; number: string;
  info: string; status: LeadStatus; value: number | null; notes: string;
  campaignName: string; campaignId: string; adSetName: string; adSetId: string;
  adName: string; adId: string; ghlContact: string;
}
export interface AdsAd { adName: string; adId: string; spend: number; }
export interface MetaRow {
  date: string; spend: number; impressions: number; reach: number;
  linkClicks: number; ctr: number; day: string; cpm: number;
  campaignName: string; campaignId: string; adSetName: string; adSetId: string;
  adName: string; adId: string;
}
export interface AdsClientData {
  clientId: string; clientName: string; adAccountId: string;
  leads: AdsLead[]; ads: AdsAd[]; metaRows: MetaRow[];
}
export interface Funnel {
  leads: number; pickups: number; pickupRate: number;
  bookings: number; bookingRate: number; sales: number;
  salesPctOfLeads: number; closeRate: number;
  revenue: number; adSpend: number; roas: number;
}
export interface AdBreakdownRow {
  adName: string; adId: string; spend: number; leads: number;
  bookings: number; sales: number; revenue: number; roas: number;
  costPerLead: number; costPerBooking: number;
}
export function computeFunnel(data: AdsClientData): Funnel;
export function computeAdBreakdown(data: AdsClientData): AdBreakdownRow[];
export function totalSpend(metaRows: MetaRow[]): number;
```

Metric rules (verbatim from the sheet legend — implement exactly):
- `Leads` = count of leads. `Pickups` = leads past New Lead / No Contact (status not in those two). `Bookings` = Booked + Sold + Lost. `Sales` = Sold. `Revenue` = sum of `value` for Sold leads. `Ad Spend` = sum of `metaRows.spend`. `ROAS` = Revenue ÷ Ad Spend.
- `Pickup Rate` = Pickups ÷ Leads. `Booking Rate` = Bookings ÷ Leads. `Sales % (of leads)` = Sales ÷ Leads. `Close Rate (of bookings)` = Sales ÷ Bookings.
- Per ad: `leads`/`bookings`/`sales`/`revenue` counted from leads whose `adId` matches; `spend` from `ads.spend`; `roas` = revenue ÷ spend; `costPerLead` = spend ÷ leads; `costPerBooking` = spend ÷ bookings.
- All ratios guard divide-by-zero (return 0 when denominator is 0).

- [ ] **Step 1:** Write `adsTracker.test.ts` with a small fixture (5 leads across statuses, 1 sold with value 1000, 2 meta rows summing 200 spend) and assertions for `computeFunnel`: leads=5, pickups, bookings, sales=1, revenue=1000, adSpend=200, roas=5, and the rates. Plus a `computeAdBreakdown` case and a divide-by-zero case (no leads → rates 0, no NaN/Infinity).
- [ ] **Step 2:** Run: `npx vitest run src/lib/adsTracker.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `adsTracker.ts` to satisfy the rules above.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ads): pure paid-ads tracker math matching the sheet`.

## Task 5: Mock dataset

**Files:**
- Create: `command-center/app/src/lib/mockAds.ts`

**Interfaces:**
- Consumes: types from `adsTracker.ts`.
- Produces: `export const MOCK_ADS_CLIENTS: AdsClientData[]` and `export function getMockAdsClient(id: string): AdsClientData | undefined`.

- [ ] **Step 1:** Build 3 mock clients. Client 1 mirrors the sheet ("Willis Tree Care" style: tree/garden, GBP, ~12 leads across all statuses with a couple Sold carrying values, 4-6 ads with spend, a handful of daily meta rows). Clients 2-3 smaller, different niches, so the overview table has variety. Keep numbers realistic so ROAS is plausible.
- [ ] **Step 2:** Typecheck `npm run -s build`. Expected: passes.
- [ ] **Step 3:** Commit: `feat(ads): realistic mock dataset for the tracker`.

## Task 6: Tracker UI components

**Files:**
- Create: `command-center/app/src/components/ads-tracker/KpiStrip.tsx`
- Create: `command-center/app/src/components/ads-tracker/AdBreakdownTable.tsx`
- Create: `command-center/app/src/components/ads-tracker/LeadTrackerTable.tsx`
- Create: `command-center/app/src/components/ads-tracker/MetaDataTable.tsx`

**Interfaces:**
- `KpiStrip({ funnel }: { funnel: Funnel })` — renders the 11 headline figures as labelled tiles (mono tabular figures, GBP for money, `x` suffix for ROAS, `%` for rates).
- `AdBreakdownTable({ rows }: { rows: AdBreakdownRow[] })`.
- `LeadTrackerTable({ leads, onStatusChange, onValueChange })` — Status `<select>` (the 8 statuses), editable Value, attribution Ad column.
- `MetaDataTable({ rows }: { rows: MetaRow[] })` — read-only.

- [ ] **Step 1:** Build each as a presentational component using Tailwind theme tokens (match `AdminClients` table styling: `border-divider`, `bg-surface`, `text-muted`, `tabular-nums`, hover rows). Money helper formats GBP.
- [ ] **Step 2:** Typecheck. Commit: `feat(ads): tracker table + KPI components`.

## Task 7: Per-client tracker route

**Files:**
- Create: `command-center/app/src/routes/admin/AdminAdsClient.tsx`

**Interfaces:**
- Consumes: `getMockAdsClient`, `computeFunnel`, `computeAdBreakdown`, the Task 6 components.

- [ ] **Step 1:** Read `:clientId` from params; `getMockAdsClient`. If missing, redirect to `/admin/ads`.
- [ ] **Step 2:** Page shell in `.pk-root`: back link to `/admin/ads`, client name title, a sub-tab bar (Dashboard | Lead Tracker | Meta Data) using `.pk-tabs`/`.pk-tab` with local `useState` for the active sub-tab (no new route needed).
- [ ] **Step 3:** Dashboard tab: `<KpiStrip funnel={computeFunnel(data)} />` + `<AdBreakdownTable rows={computeAdBreakdown(data)} />`.
- [ ] **Step 4:** Lead Tracker tab: hold `leads` in local state seeded from the mock; `<LeadTrackerTable>` with handlers that update status/value in state and recompute the funnel live.
- [ ] **Step 5:** Meta Data tab: `<MetaDataTable rows={data.metaRows} />`.
- [ ] **Step 6:** Typecheck. Commit: `feat(ads): per-client tracker page`.

## Task 8: All-clients overview route + wiring

**Files:**
- Create: `command-center/app/src/routes/admin/AdminAds.tsx`
- Modify: `command-center/app/src/App.tsx`

**Interfaces:**
- Consumes: `MOCK_ADS_CLIENTS`, `computeFunnel`.

- [ ] **Step 1:** `AdminAds`: compute each client's funnel; render a totals strip (sum across clients: Leads, Pickups, Bookings, Sales, Revenue, Ad Spend, blended ROAS) then a table (one row per client: brand chip + name, Leads, Bookings, Sales, Revenue, Ad Spend, ROAS, chevron). Row click → `navigate(\`/admin/ads/${client.clientId}\`)`. Page shell in `.pk-root` with a title and back link to `/admin/pillar/service/lanes`.
- [ ] **Step 2:** In `App.tsx`, add inside the admin block:
  - `<Route path="/admin/ads" element={<AdminRoute><AdminAds /></AdminRoute>} />`
  - `<Route path="/admin/ads/:clientId" element={<AdminRoute><AdminAdsClient /></AdminRoute>} />`
  - Add the two imports.
- [ ] **Step 3:** Run the app: Service Delivery → Paid Ads box opens `/admin/ads`; a client row opens the tracker; sub-tabs work; changing a lead Status updates the Dashboard funnel. Screenshot each.
- [ ] **Step 4:** Commit: `feat(ads): all-clients paid-ads overview + routes`.

## Task 9: Verify + report

- [ ] **Step 1:** `npm run -s build` in `command-center/app`. Expected: clean build.
- [ ] **Step 2:** `npx vitest run src/lib/adsTracker.test.ts`. Expected: PASS.
- [ ] **Step 3:** Screenshots: lane boxes (Service Delivery + one pipeline pillar), `/admin/ads` overview, a per-client Dashboard, Lead Tracker with a live edit, Meta Data.
- [ ] **Step 4:** Report to Jake with screenshots. Do not ship until Jake reacts (mock data; he wants to approve the look before we wire real Meta + Supabase).

---

## Follow-ups (tracked, not in this build)

- Wire real data: Meta spend via the existing System User token + per-client `meta_ad_account_id`; persist lead statuses + deal values in Supabase (new migration, `ads_leads` table); replace `mockAds.ts`.
- Date Range selector on the Dashboard (All Time / 30d / 7d), matching the sheet's selector + PipelineStats windows.
- GHL Contact column linkage (currently a reserved, blank field).
- Extend the "service box opens a client list" pattern to other Service Delivery services if wanted.
