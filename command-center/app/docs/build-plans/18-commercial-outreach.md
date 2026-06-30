# 18 — Commercial Outreach (done-for-you, monitor-only)

Status: **structure agreed, build pending**
Owner: Jake
Pattern source: the Social Media surface (`/marketing/social`, see `src/routes/social/`)

## What this is

Commercial Outreach is the **B2B outreach machine the Hauck team runs for the client**
to win them *new commercial accounts* (cold email to commercial businesses). Unlike
Email Campaigns (to customers), the client does **not** operate this — Jake's team does.

So this surface is **monitor-only**. It is a read-only window with exactly three jobs:

1. **The emails we are sending** — the outreach copy/sequence going out on their behalf.
2. **The results** — opened, replied, meetings booked.
3. **The businesses we are targeting** — the prospect list the outreach runs against.

No composer, no "create campaign", no editing. Every page is a clean status view. This
is its own sidebar item, completely separate from Email Campaigns.

## Pages (monitor-only, 4 pages)

| # | Page | Route | What it does |
|---|---|---|---|
| 1 | **Overview** (Glance) | `/marketing/outreach` | At-a-glance: headline numbers, what's going out next, recent activity. Parent row lands here. |
| 2 | **Emails** | `/marketing/outreach/emails` | The outreach emails/sequence your team is sending, read-only. "Here's exactly what we're sending on your behalf." |
| 3 | **Targets** | `/marketing/outreach/targets` | The businesses being targeted: the prospect list, read-only (name, type, location, status in the sequence). |
| 4 | **Results** | `/marketing/outreach/results` | Performance: prospects emailed, opened, replied, meetings booked. The "What's working" equivalent. |

### Number set

- Overview / Results KPIs: **Prospects emailed · Opened · Replied · Meetings booked.**

## What makes this different from Email Campaigns (build it in, don't skip it)

- **No create/compose buttons anywhere.** Where Social/Email have "New post / New
  email", Commercial Outreach has nothing — or at most a passive "Your team runs this"
  note. The viewer watches; they do not act.
- **Read-only target list.** Targets is a table, not an editor. No add/remove rows.
- **Framing copy makes ownership obvious.** Headers and empty states say "we" / "your
  team", e.g. "Emails we're sending for you", "Businesses we're targeting for you", so
  it never reads as something the client is expected to run.

## Sidebar / nav change

`src/lib/nav.ts` → add a **new** item in the Marketing section, directly after Email
Campaigns, as an expandable row (same `children` machinery as Social/Email):

```
{
  to: "/marketing/outreach",
  label: "Commercial Outreach",
  shortLabel: "Outreach",
  icon: Send,                       // import Send from lucide-react
  children: [
    { to: "/marketing/outreach",         label: "Overview", icon: LayoutDashboard },
    { to: "/marketing/outreach/emails",  label: "Emails",   icon: Mail },
    { to: "/marketing/outreach/targets", label: "Targets",  icon: Building2 },
    { to: "/marketing/outreach/results", label: "Results",  icon: BarChart3 },
  ],
}
```

Marketing section order becomes: Paid Ads · Google Reviews · Email Campaigns ·
**Commercial Outreach** · Website · Social Media. No `nav.ts` machinery changes.

## Routes

`src/App.tsx` — add four routes pointing at the new `src/routes/outreach/` files, same
shape as the Social/Paid Ads route blocks.

## Files to create (mirror `src/routes/social/`)

```
src/routes/outreach/
  shared.tsx              // NotConnectedNotice (reworded), OUTREACH_CONTAINER, status pills
  OutreachOverview.tsx    // Glance
  OutreachEmails.tsx      // the emails we're sending (read-only)
  OutreachTargets.tsx     // businesses we're targeting (read-only table)
  OutreachResults.tsx     // performance
```

`shared.tsx`:
- `NotConnectedNotice` reworded for the done-for-you case ("Your outreach campaign is
  being set up by your team" rather than "connect your account").
- `OUTREACH_CONTAINER` scroll container (copy `SOCIAL_CONTAINER`).
- Small `StatusPill` for a prospect's place in the sequence (Queued / Emailed / Opened
  / Replied / Meeting) — reused on Targets and Overview.

## Golden rule (inherited from Social)

A real client never sees fabricated content. Pages render the designed, populated
layout only in demo/preview (`?demo=1`); a real session shows the zeroed state + the
reworded "being set up" notice until the team's outreach data is wired. Build with
placeholder/demo data first; wire real data later.

## Open questions for Jake

- **Where does the outreach data live?** GHL sub-account (its own pipeline), or the
  team's separate cold-email tool (e.g. Instantly/Smartlead) that we'd pull from? This
  decides the Targets + Results plumbing. (Demo data first either way.)
- Label check: "Emails / Targets / Results" — happy with those, or prefer "Messages /
  Businesses / Performance"?
