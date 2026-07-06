# 10 — Service Simplification

Date: 2026-07-06
Status: SPEC (approved design, pending implementation plan)
Branch (suggested): `rev/simplify`

## Decision

Hauck Marketing is simplifying service delivery down to **four services**. The
client app must mirror exactly those four and nothing else. Everything outside
the four goes on the **back burner**: hidden from the client app, but left in the
codebase so it can be switched back on later with a one-line change. Nothing is
deleted.

### The four services (the only Marketing channels the client sees)

1. **Paid Ads**
2. **Website** (SEO is intertwined, not a separate surface; GA4/analytics inside
   the Website page already covers it. Name stays "Website".)
3. **Google Reviews**
4. **Reactivation**

### Back-burnered (hidden from client app, kept in code)

- **Social Media**
- **Commercial Outreach**
- **Group Outreach**

### Company section — unchanged

All eight day-to-day tools stay exactly as they are: Inbox, Leads, Contacts,
Jobs, Calendar, Revenue, Assets, Team.

## Scope

Two things, one theme (the client-facing app only mentions what we sell):

1. **Nav simplification** — remove the three back-burnered channels from the
   Marketing section so they disappear from every client surface at once.
2. **Reference sweep** — remove copy, widgets, filters, tour steps, and channels
   in the client-facing app that reference social media or any back-burnered
   service. The client app must never surface Instagram/Facebook/Messenger DMs or
   an outreach/groups feature it does not offer.

**Out of scope:** the agency-internal admin app (`routes/admin/**`) and the
agency `Chat`/`Comms` (internal team messaging). Those are Hauck's own tools, not
client-facing, and may still reference back-burnered work. Flagged here so it is
a conscious boundary, not an oversight. Confirm before touching admin.

## Design

### 1. Navigation (`src/lib/nav.ts`)

`nav.ts` is the single source of truth. The desktop sidebar, phone bottom bar,
the `/apps` "All features" grid, and global search all read from `NAV` via
`flattenNav`. Removing the three rows from the Marketing `items` array hides them
from **every** surface simultaneously.

Marketing `items` becomes exactly:

```
Paid Ads       → /marketing/paid-ads
Website        → /marketing/website
Google Reviews → /marketing/reviews
Reactivation   → /marketing/reactivation
```

Remove the rows for `Commercial Outreach` (`/marketing/outreach`),
`Group Outreach` (`/marketing/groups`), and `Social Media` (`/marketing/social`).

**Keep the routes registered** in `App.tsx` (do not delete the route
components). A hidden-but-reachable page never 404s if something deep-links it,
and re-enabling a service is then a single nav line. Add a short comment in
`nav.ts` listing the three back-burnered routes and how to re-enable them.

Update `nav.test.ts` to assert the four-item Marketing section and that the three
back-burnered routes are absent from the flattened nav.

### 2. Inbox — SMS + Email only (`src/lib/inboxFilters.ts` + server mirror)

Good news: the inbox is already SMS + Email at the channel level
(`ChannelKey = "sms" | "email" | "other"`; Instagram/Messenger fold to `other`
and never render as channels). The remaining social leftovers to purge:

- **Drop the `"social"` lead-source origin** ("Social DM", 📷) from `ORIGINS`,
  from `ORIGIN_RULES`, from the `OriginKey` union, and from `countByOrigin`. Any
  contact that used to classify as `social` folds to `other`.
  - Note: the `paid` origin rule legitimately matches `facebook ad` /
    `instagram ad` source strings — that is Paid Ads (a kept service) detecting
    ad sources, **not** social. Leave the `paid` rule intact.
- **Server mirror `functions/lib/origin.ts`** carries the same unions/rules and a
  "keep both in sync" contract. Apply the identical `social` removal there.
- **`ChannelComposer.tsx`** `CHANNEL_LABEL` maps `FB`, `IG`, `GMB`, `WhatsApp`,
  `Live_Chat`, `Custom`. Trim to `SMS` and `Email` only (keep a generic
  passthrough fallback so an unexpected channel string still renders its raw
  name rather than crashing). Inbox pages already lock the composer to one
  channel, so no non-SMS/email chip should ever appear after this.
- Update `inboxFilters.test.ts` accordingly (no `social` origin; counts object
  no longer has a `social` key).

### 3. Reference sweep (client-facing surfaces)

Audit and clean these client-facing areas for links/copy/widgets pointing at the
three back-burnered services. Each is a small edit; the implementation plan will
map exact lines.

- **Home / Today / Dashboard** (`components/home/*`, `components/today/*`,
  `components/dashboard/*`): remove any card, stat, quick-action, or feed row
  that links to Social, Outreach, or Groups.
- **Calendar** (`lib/calendarModel.ts`, `lib/calendarDemo.ts`,
  `hooks/useCalendarItems.ts`, `components/calendar/*`): the calendar carries a
  **social-posts stream**. Remove the social stream (client no longer has a
  social service to schedule). Keep appointment/job/reactivation streams.
- **All features grid** (`routes/AllFeatures.tsx`): confirm it derives from
  `flattenNav` (auto-updates). Remove any hardcoded Social/Outreach/Groups tile.
- **Global search**: confirm it reads `flattenNav` (auto-updates). No hardcoded
  entries for the hidden pages.
- **Product tour** (`context/TourContext.tsx`,
  `components/tour/TourOverlay.tsx`): remove/repoint any tour step that spotlights
  a hidden page, so the walkthrough never lands on a route that isn't in nav.
- **Copy scan**: grep the client-facing tree for `social`, `Instagram`,
  `Facebook`, `Messenger`, `DM`, `Group Outreach`, `Commercial Outreach` and
  remove any user-visible mention that implies we offer it. (Ignore matches
  inside kept-service code, e.g. the Paid Ads FB/IG-ad references.)

### 4. Demo data (optional, low priority)

`src/demo/*` seeds a demo tenant with social/outreach content. Not client-visible
in production. Trim only the social/outreach demo seeds that would surface in a
now-hidden or swept surface; otherwise leave demo data alone. Non-blocking.

## Non-goals

- No new SEO surface. SEO stays folded into Website via existing GA4/analytics.
- No deletion of back-burnered route components, pages, hooks, or libs.
- No changes to the Company section.
- No admin-app or internal-Chat changes (see Scope boundary above).

## Definition of done

- Client Marketing nav shows exactly: Paid Ads, Website, Google Reviews,
  Reactivation — on desktop sidebar, phone bottom bar, and `/apps` grid.
- No client-facing surface links to or names Social Media, Commercial Outreach,
  or Group Outreach.
- Inbox surfaces only SMS and Email; no "Social DM" source; composer offers no
  FB/IG/WhatsApp/GMB channel.
- The three back-burnered routes still resolve if hit directly (no 404), proving
  nothing was deleted.
- `nav.test.ts` and `inboxFilters.test.ts` updated and green; typecheck clean.
- Verified live in Jake's own browser before ship (per finish-page flow).

## Re-enabling a back-burnered service later

Un-comment its row in the Marketing `items` array in `nav.ts` (and restore any
Home/calendar hooks if that service needs them). One line brings the channel and
all its sub-pages back, because the route and page code were never removed.
