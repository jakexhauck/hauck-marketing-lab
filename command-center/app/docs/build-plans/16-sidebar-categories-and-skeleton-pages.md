# 16 — Sidebar categories + skeleton pages + chat-to-agency relocation

## Frame

**What:** Reorganise the client-facing desktop sidebar into five inline (non-collapsible)
category headers, stub out the remaining product surfaces as "coming soon" pages, and move
the agency chat out of the docked right rail into a top-right header icon.

**Why:** Get the full desktop information architecture in place first (skeleton), so every
surface has a home before we fill them in. Mobile polish comes after.

**Done when:**
- Sidebar shows five static category headers (Sales, Operations, Marketing, Company) plus a
  pinned Home, no chevrons / no collapse.
- Every new surface exists as a route and renders a centered "coming soon" screen.
- The agency chat is a top-right icon (opens the single Hauck thread); the right-rail channel
  list is gone; desktop content is centered.
- `tsc` + `vite build` pass.

## Final sidebar map

```
Home                         /home                 (existing)

SALES
  Sales Overview             /sales/overview        coming soon
  Form Submissions           /sales/forms           (existing)
  Pipeline                   /leads                 (existing)
  Reactivation               /sales/reactivation    coming soon
  Chat Widget                /sales/chat-widget      coming soon
  Sales Scripts              /sales/scripts         coming soon

OPERATIONS
  Inbox                      /conversations         (existing)
  Contacts                   /contacts              (existing, moved here)
  Calendar                   /calendar              (existing)
  Reports & Analytics        /operations/reports    coming soon
  Activity                   /activity              (existing)

MARKETING
  Paid Ads                   /marketing/paid-ads    coming soon (old /paid-ads retired from sidebar)
  Google Reviews             /marketing/reviews     coming soon
  Email Campaigns            /marketing/email       coming soon
  Website                    /marketing/website     coming soon
  Social Media               /marketing/social      coming soon

COMPANY
  Billing                    /billing               (existing)
  Documents & Resources      /company/documents     coming soon
  Team                       /team                  (existing, owner-only)

(footer) Settings            /settings              (existing)
(mobile bottom bar only) Chat /comms                (existing, sidebarHidden)
```

11 new coming-soon pages. New pages have no `capability` → visible to everyone for now.

## Decisions (from Jake)

- Categories are inline headers, **not** dropdowns.
- New pages show to everyone now with a "coming soon" screen.
- Contacts moves to Operations.
- Marketing Paid Ads is a **new** coming-soon page; the existing `/paid-ads` page is retired
  from the sidebar (route + component still exist).
- Reports/Analytics lives under Operations.
- Agency chat → top-right icon, no channels sidebar, content centered.

## Plan (file by file)

1. **`src/lib/nav.ts`** — Replace collapsible `NavGroup` with static `NavSection` ({id, label,
   items}). Add `comingSoon?` and `sidebarHidden?` to `NavItem`. Rebuild `NAV` per the map.
   `flattenNav` walks sections + standalone items (incl. hidden). `visibleNav` drops
   `sidebarHidden` items and empty sections.
2. **`src/components/Sidebar.tsx`** — Replace `NavGroupSection` with a static section: a small
   uppercase kicker label + its item links. Remove chevron / localStorage / open-state logic.
3. **`src/components/BottomNav.tsx`** — Make `active` optional (coming-soon pages have no
   matching tab). No other change; it still reads the `bottomNav` flag.
4. **`src/routes/ComingSoon.tsx`** — New reusable page. Mobile: NavyHero + centered message.
   Desktop: `DesktopPage` + centered message. Takes `title` (+ optional `blurb`).
5. **`src/components/comms/ChatLauncher.tsx`** — New top-right icon button. On open, calls
   `useOpenHauck()` to resolve the agency channel, then renders `Conversation` in a popover.
   No `ChannelList`, no `Roster`.
6. **`src/components/desktop/DesktopPage.tsx`** — Render `<ChatLauncher />` in the header
   control row, beside the notification bell.
7. **`src/components/Shell.tsx`** — Remove `RightRail` (content re-centers via DesktopPage's
   `max-w-[1220px] mx-auto`).
8. **`src/routes/Comms.tsx`** — Update the stale desktop message to point at the top-right icon
   (mobile path unchanged).
9. **`src/App.tsx`** — Import `ComingSoon`; add the 11 new routes wrapped in `ProtectedRoute`.

## Verify

- `npx tsc --noEmit` and `npx vite build` clean.
- Manual: sidebar shows the five groups, every new row opens a centered "coming soon", the
  top-right chat icon opens the Hauck thread, no right rail, content centered.

## Revision (after first pass)

- **Automations** (Operations) is **built**, not a stub: a read-only command view of
  follow-up sequences + database reactivation, signature element = a channel-coded sequence
  flow. Sample data via `src/lib/automations.ts`, clearly labelled with the sample-data
  banner; no fabricated performance figures. Files: `routes/Automations.tsx`,
  `components/automations/{AutomationsDesktop,AutomationCard,SequenceFlow}.tsx`.
- **Reactivation** leaves Sales (folded into Automations).
- **Form Submissions + Chat Widget → "New Inquiries"** (`/sales/inquiries`), one friendly
  coming-soon page, kept out of the Pipeline. Existing `/sales/forms` page retired from the
  sidebar (route/component still exist).
- **Website** stays coming soon; its blurb now says funnels/landing pages live there.
- **Google Reviews** keeps its name (no rename).

## Out of scope (later)

- Filling in any coming-soon page's real content.
- Mobile bottom-bar / mobile polish pass.
- Per-page capability gating for the new surfaces (currently open to everyone).
