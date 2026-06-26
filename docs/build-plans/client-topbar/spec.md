# Spec: Kit App Structure (Global Topbar) for the Desktop Client

Date: 2026-06-26
Status: Design approved (Jake), plan pending
Scope: client desktop (lg+) only

## What and why

The Modern Motion design kit (`design-kit.html`, "Full Shell Layout") defines an app
structure of `sidebar | main-col`, where `main-col` is a **global glass topbar**
(search pill, notifications bell, avatar) sitting above the page content. The live
client desktop app already has the glass sidebar + gradient nav, but has **no global
topbar**: instead each page renders its own `DesktopPage` header (title/subtitle/
actions), and the notifications bell is passed into that header's `actions` slot on
~10 pages.

This brings the kit's topbar structure into the desktop client: one merged glass
topbar carrying the page title plus the global controls (search, bell, avatar menu),
with page-specific buttons kept as page actions.

Definition of done: every desktop (lg+) page shows the merged glass topbar with a
working search (routes to Leads), the notifications bell with unread badge, and an
avatar menu (Settings, theme, Sign out); the redundant per-page bell is removed; the
app builds, typechecks, and is visually verified in light and dark, then shipped live.

## Locked decisions (from brainstorming)

1. **One merged bar**: a single glass topbar = page title (left) + search + bell +
   avatar (right), with page actions kept in the bar. Not two stacked bars.
2. **Search** routes to the Leads page with the query prefilled (`/leads?q=...`).
   Not a command palette, not a dead placeholder.
3. **Bell** navigates to `/notifications` with an unread-count badge (reuse the
   existing `NotificationBell` `surface` variant).
4. **Avatar** opens a dropdown menu: Settings, theme toggle, Sign out.

## Architecture

Evolve `DesktopPage` (the shared chrome rendered by all ~10 desktop page variants)
into the merged topbar. Because every desktop page already renders `DesktopPage`,
one change propagates everywhere. The per-page `actions` prop is reduced to
page-specific buttons; the globally-relevant bell moves into `DesktopPage` itself.

Topbar layout, left to right:

```
[ title (+subtitle) ]  [ flexible gap ]  [ search pill ]  [ page actions ]  [ bell ]  [ avatar menu ]
```

No backend, routing, schema, or data-model changes. Search uses a URL query param
plus the existing Leads query; the bell uses the existing `useNotificationsQuery`;
the avatar menu uses the existing auth + theme contexts.

## Components

### DesktopPage.tsx (modify)
The merged glass topbar. New internal structure inside the existing
`<header class="glass sticky ...">`:
- Left: `title` (font-display 22) + optional `subtitle`.
- Middle/right: `<GlobalSearch />`, then the page `actions`, then
  `<NotificationBell enabled={Boolean(session)} variant="surface" />`, then
  `<AvatarMenu />`.
- Reads `useAuth()` for `session` (bell enabled) and reuses contexts via the child
  components. Keep the `title`/`subtitle`/`actions`/`children` prop API unchanged so
  no page call site needs to change except removing its own bell.

### GlobalSearch.tsx (new)
Kit search pill: a rounded-full control on `surface-2` with a search icon and a text
input ("Search leads, contacts..."). Behavior:
- Local `q` state. On submit (Enter) navigate to
  `/leads?q=${encodeURIComponent(q.trim())}` when non-empty; Esc clears and blurs.
- Width ~ 280px on wide screens; hidden below a medium breakpoint (e.g. `hidden xl:flex`)
  so narrow desktops do not crowd. Title remains visible.
- No network. Purely a typed-query to Leads.

### AvatarMenu.tsx (new)
A button rendering the gradient `Avatar` (brand initials from `useClient().client.brand`
for client sessions, or admin initials), opening a small dropdown popover:
- **Settings** (NavLink to `/settings`)
- **Theme** toggle (`useTheme().toggle`, label reflects current)
- **Sign out** (`useAuth().signOut`)
Closes on outside-click and Esc; popover anchored to the avatar, right-aligned,
`surface` background with border + `shadow-lg`. Keyboard accessible (button + menu).

### NotificationBell.tsx (reuse, no change)
Rendered once by `DesktopPage` with `variant="surface"` and
`enabled={Boolean(session)}`. Already shows the unread badge and routes to
`/notifications`.

### Leads.tsx / LeadsDesktop.tsx (modify)
Read `?q` via `useSearchParams` on mount and prefill the existing search state, so the
topbar search lands on filtered results. If Leads has no search state to seed, seed
the desktop list filter input. Leave the param in the URL (no rewrite needed).

### ~10 desktop page files (modify)
Remove `<NotificationBell ... variant="surface" />` from each page's `actions` (now
rendered globally by `DesktopPage`). Where `actions` was only the bell, drop the
`actions` prop entirely; where it had other buttons, keep those. Affected (from grep):
ActivityDesktop, PaidAdsDesktop, BillingDesktop, CalendarDesktop, ContactsDesktop,
ConversationsDesktop, ConversationDetailDesktop, DashboardDesktop, HomeDesktop,
LeadsDesktop (and any other `DesktopPage` consumer that passes the bell).

## Out of scope (deferred)

- **Sidebar nav count pills** (kit shows e.g. "Pipeline 12"): needs per-nav-item count
  plumbing (open leads, unread inbox). Deferred as a follow-up; `NavItem` stays as-is.
- **Mobile**: the kit topbar is a desktop (lg+) structure. Mobile keeps its existing
  `AppHeader` + `BottomNav` untouched.

## Testing and verification

- `pnpm run typecheck` and `pnpm run build` pass; `pnpm run test` stays green.
- Run in demo mode; screenshot Home, Leads, and one more desktop page in light + dark
  showing the merged topbar with search + bell + avatar.
- Search: type a query, Enter, confirm it lands on Leads with results filtered.
- Avatar menu: opens, Settings navigates, theme toggles, Sign out works; closes on
  outside-click/Esc.
- Bell: badge reflects unread, click routes to `/notifications`.
- No duplicate bell remains on any page.

## Risks

- Removing the per-page bell from ~10 files: mechanical but must not drop other page
  actions. Verify each edited page still renders its non-bell buttons.
- `DesktopPage` gains context dependencies (auth/theme/client). These contexts already
  wrap the desktop tree (the sidebar uses them), so no provider changes are needed;
  confirm during build.
- Live app for Willis: build on a branch, verify both themes, ship in one merge.
