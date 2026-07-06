# Leads section redesign: Pipeline / Organic / Paid Ads

Date: 2026-07-06
Status: SPEC (approved in brainstorming, pending written-spec sign-off)

## What and why

The Leads section today has two tabs: **New Leads** (a merged hub with three inline
source tabs, Paid Ads / Estimate Forms / Chat, each a two-pane conversation view)
and **Pipeline** (the kanban board). Jake wants the section reorganized into three
purpose-built pages:

1. **Pipeline**: just the sales pipeline board (the strict pipeline, already built).
2. **Organic**: chat-widget submissions (with their messages) and estimate-form
   submissions.
3. **Paid Ads**: every lead that came through paid ads.

The merged two-pane "New Leads" hub is retired. Organic and Paid Ads become plain,
navigational lists that hand off to surfaces that already exist (the Inbox and the
lead detail page). This keeps each page single-purpose and removes the duplicated
conversation UI the hub carried.

## Definition of done

- Leads sidebar row opens **Pipeline** by default.
- Section tab bar shows `Pipeline | Organic | Paid Ads` on every Leads page, mobile
  and desktop.
- Organic page lists estimate-form and chat leads under two sub-tabs; clicking a
  lead opens the unified Inbox with that conversation selected.
- Paid Ads page lists ad leads; clicking a lead opens its full lead detail page.
- No inline conversation panes or booking actions on Organic/Paid Ads (they are
  lists only).
- Old routes redirect, nav tests pass, source-filter helpers unit-tested.
- Real data flows (source is already tagged per lead); demo/preview still renders.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Tab structure | Replace `[New Leads, Pipeline]` with `[Pipeline, Organic, Paid Ads]`, Pipeline default. |
| Organic layout | Two sub-tabs: **Estimate Forms** and **Chat**, each a grouped list. |
| Organic click | Row -> Inbox at `/conversations/:contactId` (that lead selected). |
| Paid Ads layout | Simple list (name, ad, timestamp, status). No conversation, no sequence tracker. |
| Paid Ads click | Row -> `/lead/:id` (full lead detail). |
| Booking actions | Dropped from the lists. Booking/callback/disqualify happen on the lead detail page and pipeline board. |

## Architecture

### Routing (`command-center/app/src/App.tsx`)

| Path | Element | Change |
|---|---|---|
| `/sales/leads` | `Leads` (the board) | Was `LeadsHub`. Now the Pipeline page + default. |
| `/sales/leads/organic` | `LeadsOrganic` (new) | New route. |
| `/sales/leads/paid-ads` | `LeadsPaidAds` (new) | New route. |

Redirect updates:

- `/sales/leads/pipeline` -> `/sales/leads` (old pipeline sub-path).
- `/leads` -> `/sales/leads` (was `/sales/leads/pipeline`).
- `/sales/overview` -> `/sales/leads` (was `/sales/leads/pipeline`).
- `/marketing/paid-ads/leads` -> `/sales/leads/paid-ads` (was `/sales/leads?source=ads`).
- `/sales/forms` -> `/sales/leads/organic`; `/sales/chat` -> `/sales/leads/organic`;
  `/sales/paid-ads` -> `/sales/leads/paid-ads` (were all -> `/sales/leads`).

### Tabs (`command-center/app/src/lib/pageTabs.ts`)

```ts
export const LEADS_TABS: PageTab[] = [
  { to: "/sales/leads", label: "Pipeline", end: true },
  { to: "/sales/leads/organic", label: "Organic" },
  { to: "/sales/leads/paid-ads", label: "Paid Ads" },
];
```

`sectionLabel(LEADS_TABS)` stays `"Leads"`.

### Pipeline page (`routes/Leads.tsx`, `components/leads/LeadsDesktop.tsx`)

Behavior unchanged (board/list, Move/Won/Lost, inline chat, pipeline switcher).
Two edits:

1. It now serves `/sales/leads` instead of `/sales/leads/pipeline` (routing change
   only; component untouched).
2. Mobile `Leads.tsx` currently renders no `PageTabs` (only the desktop
   `LeadsDesktop` does). Add the `PageTabs`/`LEADS_TABS` bar to the mobile Pipeline
   layout so the three tabs are reachable on a phone, matching Organic and Paid Ads.

### Organic page (`routes/sales/LeadsOrganic.tsx`, new)

- Data: `useLeadsHub()`, filtered to `source === "form" || source === "chat"`.
- Sub-tabs: **Estimate Forms** (`form`) and **Chat** (`chat`), internal component
  state (not a route). Default to Estimate Forms. Each sub-tab groups New / Earlier
  using the existing `isNew` helper.
- Rows reuse the existing list-row visual language (avatar, name, preview/intent,
  timestamp, New badge). List only, no conversation pane, no Next-step button.
- Row click: `navigate('/conversations/' + lead.contactId)` when a `contactId` is
  present; the `/conversations/:contactId` route opens the full Inbox conversation
  on mobile and desktop. Demo rows have no `contactId` (see Edge cases).
- Empty / not-connected: reuse `NotConnectedNotice` + the empty-state block from the
  current hub, scoped to organic copy.
- Renders inside `Shell` with `PageTabs tabs={LEADS_TABS}` at the top.

### Paid Ads page (`routes/sales/LeadsPaidAds.tsx`, new)

- Data: `useLeadsHub()`, filtered to `source === "ad"`.
- Simple list: avatar, name, ad name (`lead.ad`), timestamp (`lead.when`), status
  pill (reuse the hub `StatusPill` mapping). Newest first. No grouping required, but
  a "Needs a human" / "Working" split is optional polish (skip for v1).
- Row click: `navigate('/lead/' + lead.id)`.
- Empty / not-connected state reused, scoped to paid-ads copy.
- Renders inside `Shell` with `PageTabs tabs={LEADS_TABS}` at the top.

### Retirement

- Delete `routes/sales/LeadsHub.tsx` in the same commit the new pages ship (per the
  "delete built plans / dead code immediately" hygiene rule). Its two-pane
  conversation, reply composer, and Next-step booking flow
  (`SlotPickerModal` / `DateTimeModal` / `confirmBooking`) are removed from the
  Leads section. Those modals remain available to any other caller (they are shared
  components); this only removes their use from the leads worklist.
- `lib/leadsHub.ts` (types, `buildLeadsHub`, `DEMO_LEADS`, `SOURCE_META`,
  `STATUS_META`, `isNew`, `newCount`) is kept; both new pages import from it.
- The orphaned `routes/sales/EstimateForms.tsx` and `routes/sales/ChatWidget.tsx`
  (already unrouted) are left as-is unless they reference removed exports; delete
  only if they become dead imports.

## Data flow

`useLeadsHub()` already returns `HubLead[]` with a tagged `source` (`ad` / `form` /
`chat`) and, for real leads, a `contactId`. Real merged leads come from
`GET /api/sales/leads`; demo/preview returns `DEMO_LEADS`. No backend change: the
split is a pure client-side filter on the existing feed.

The Inbox handoff uses the existing `useConversationsQuery` feed keyed by
`contactId`; a form/chat lead that has a conversation resolves to it. This is a
UI-only restructure. No new automations (consistent with the pages-before-
automations rule).

## Error / edge cases

- **Demo rows have no `contactId`.** In demo/preview the Organic row click cannot
  resolve a real Inbox conversation. Handle by navigating to `/conversations`
  (the Inbox list) when `contactId` is absent, so the click is never dead. Real
  sessions always carry a `contactId`.
- **Lead has no conversation yet.** `/conversations/:contactId` renders the detail
  shell with an empty thread and the contact name; acceptable, matches current
  Inbox behavior.
- **Empty feed / not connected.** Each page shows its own empty state; no crash on
  zero leads.
- **Loading / error.** Reuse the existing query loading + error affordances from the
  current hub and board.

## Testing

- `nav.test.ts`: assert `/sales/leads`, `/sales/leads/organic`, `/sales/leads/paid-ads`
  resolve; assert the redirects above; assert `LEADS_TABS` routes exist and do not
  collide with sidebar rows.
- New unit tests for source filtering: given a mixed `HubLead[]`, Organic keeps
  `form`+`chat` and Paid Ads keeps `ad`; ordering newest-first holds. Put helpers in
  `lib/leadsHub.ts` (e.g. `organicLeads(leads)`, `paidAdsLeads(leads)`) so they are
  testable without rendering.
- Typecheck + build clean.

## Out of scope

- No changes to the pipeline board internals.
- No new booking/automation surfaces.
- No backend/API changes.
- Estimate-form and chat feeds beyond what `/api/sales/leads` already returns.
