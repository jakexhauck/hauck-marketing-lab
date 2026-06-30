# 18 — Campaigns (email + SMS, to customers)

Status: **structure agreed, build pending**
Owner: Jake
Pattern source: the Social Media surface (`/marketing/social`, see `src/routes/social/`)

> **History.** This was "Email Campaigns". It is now **Campaigns**: the client picks
> the channel (Email or SMS) per campaign. The B2B "Commercial Outreach" track is a
> wholly separate sidebar item with its own plan (`18-commercial-outreach.md`).

## What this is

Campaigns is the client's own self-serve outreach to **their existing customer base**:
promos, seasonal offers, win-back, review asks, newsletters, reminders. Each campaign
goes out over a channel the client chooses: **Email** or **SMS**. Goal: repeat jobs,
referrals, reviews.

It mirrors Social Media: one parent sidebar row that expands into child pages. Today it
is a single "coming soon" stub (`App.tsx` → `/marketing/email`). This plan replaces that
stub with the dropdown-of-pages format Social uses, routed under `/marketing/campaigns`.

Scope: **one-off campaigns only** (broadcasts, blasts, promos, single reminders).
Automated drip / multi-day sequences stay in the existing Automations surface.

## Channel is the core concept (the one thing that's new vs Social)

Every campaign has a **channel: Email or SMS**, chosen by the client when they create it.
This shows up everywhere:

- **Create flow** picks channel first (Email | SMS segmented choice), then the relevant
  composer: Email = subject + body + preview; SMS = single message box with a live
  character/segment counter and a "keep it short" hint.
- **A small channel glyph** (envelope = Email / speech bubble = SMS) tags every item on
  Ideas, Calendar, and the Campaigns list, the way Social tags each post with its
  platform glyph.
- **Calendar and Campaigns list** can filter by channel (All · Email · SMS) — same shape
  as a platform filter, not a separate page.
- **No separate "SMS section."** One surface, channel is an attribute of each campaign.

### Per-channel metric sets

- **Email**: Sent · Opened · Clicked · Calls & jobs back.
- **SMS**: Sent · Delivered · Clicked (link) · Replies.
- **Overview** shows a combined headline (total sent, total engaged, calls & jobs back)
  with an Email/SMS split underneath, so both channels read at a glance.

## Pages (1:1 with Social)

| # | Page | Route | Social equivalent | What it does |
|---|---|---|---|---|
| 1 | **Overview** (Glance) | `/marketing/campaigns` | Overview | At-a-glance hub: combined numbers + Email/SMS split, what's going out next, recent sends, a few suggested campaigns. Parent row lands here. |
| 2 | **Ideas** | `/marketing/campaigns/ideas` | Ideas | Suggested campaigns: seasonal promo, win-back, review ask, appointment reminder. Each idea suggests a channel but the client can switch it. |
| 3 | **Calendar** | `/marketing/campaigns/calendar` | Calendar | Calendar of scheduled sends, channel-glyphed, filterable by channel. |
| 4 | **Campaigns** | `/marketing/campaigns/sent` | My Posts | Every campaign sent, channel-glyphed, filterable by channel. |
| 5 | **What's working** | `/marketing/campaigns/insights` | What's working | Performance, split by channel. |

> Note: the parent overview lives at `/marketing/campaigns`, so page 4 (the "all
> campaigns" list) uses `/marketing/campaigns/sent` to avoid colliding with the parent
> route. Mirror however Social handles its overview-vs-posts split.

## Sidebar / nav change

`src/lib/nav.ts` → the Marketing section's Email item is **renamed to Campaigns**,
re-pointed to `/marketing/campaigns`, and gains `children` (drop the `comingSoon` flag),
exactly like the Social item:

```
{
  to: "/marketing/campaigns",
  label: "Campaigns",
  shortLabel: "Campaigns",
  icon: Send,                         // import Send from lucide-react (was Mail)
  children: [
    { to: "/marketing/campaigns",          label: "Overview",       icon: LayoutDashboard },
    { to: "/marketing/campaigns/ideas",    label: "Ideas",          icon: Sparkles },
    { to: "/marketing/campaigns/calendar", label: "Calendar",       icon: CalendarDays },
    { to: "/marketing/campaigns/sent",     label: "Campaigns",      icon: LayoutGrid },
    { to: "/marketing/campaigns/insights", label: "What's working", shortLabel: "Insights", icon: BarChart3 },
  ],
}
```

No changes needed to `nav.ts` machinery — `children`, `flattenNav`, `visibleNav`
already support exactly this (Social proves it).

## Routes

`src/App.tsx` — replace the single `ComingSoon` route at `/marketing/email` with five
routes pointing at the new `src/routes/campaigns/` files, same shape as the five Social
routes (lines ~334-338). Keep an optional redirect from the old `/marketing/email` to
`/marketing/campaigns` if any deep links exist.

## Files to create (mirror `src/routes/social/`)

```
src/routes/campaigns/
  shared.tsx              // Channel type + glyph + channel filter, NotConnectedNotice, CAMPAIGNS_CONTAINER
  CampaignsOverview.tsx   // Glance hub (combined + Email/SMS split)
  CampaignsIdeas.tsx
  CampaignsCalendar.tsx
  CampaignsList.tsx       // the "all campaigns" page (route .../sent)
  CampaignsInsights.tsx
```

`shared.tsx` carries:
- `Channel = "email" | "sms"` + a `<ChannelGlyph/>` (envelope / speech bubble) and a
  `<ChannelFilter/>` (All · Email · SMS) — the email/SMS analog of Social's
  `PlatformGlyph`.
- `NotConnectedNotice` (reworded for email + SMS sending via GHL).
- `CAMPAIGNS_CONTAINER` scroll container (copy `SOCIAL_CONTAINER`).

## Golden rule (inherited from Social)

A connected client never sees fabricated content. Pages render the designed, populated
layout only in demo/preview (`?demo=1`); a real session shows the zeroed state + "not
connected yet" notice until GHL email/SMS sending is wired. Build with placeholder/demo
data first (seed both Email and SMS examples); wire GHL data later.

## Build order

1. `nav.ts` — rename Email → Campaigns, re-point, give it `children`.
2. `src/routes/campaigns/shared.tsx` — Channel glyph + filter + shared bits.
3. `CampaignsOverview.tsx` — the Glance (combined + split).
4. `App.tsx` — swap the stub for the five routes (+ optional `/marketing/email` redirect).
5. Remaining four pages (Ideas, Calendar, Campaigns list, What's working).
6. Demo data with BOTH channels; verify the channel glyph + filter work everywhere and
   the create flow branches Email vs SMS composer.
7. GHL wiring (deferred, separate pass) — email send + SMS send.

## Open questions for Jake

- SMS sending: confirm it goes through the GHL sub-account number (vs a separate SMS
  provider). Affects the send plumbing only; demo data is channel-agnostic.
- Compliance: SMS blasts need an opt-out line ("Reply STOP to unsubscribe"). Auto-append
  it to every SMS campaign? (Recommended yes.)
