# Mobile Direction B — build plan (spec + implementation)

Status: building on branch `feat/mobile-direction-b`.
Design reference: the interactive prototype (Artifact "full-proto-v2-reviewed"). Sample data throughout; this plan wires it to the real app.

## Goal / definition of done

Give phone users of the client app the "Direction B" shell:

1. A five-item bottom bar: **Today · Inbox · All features (center) · Contacts · Chat**.
2. An **All features** grid: every live feature as a labelled tile, grouped Get customers / Sell & book / Run the business, driven off `nav.ts` so it can never drift.
3. A **Today** home: a priority feed (leads to reply, jobs today, reviews to answer, messages waiting) + a week KPI row, replacing the phone "More list" home. Desktop `HomeDesktop` untouched.
4. The bottom bar is **persistent** on every phone route (so tapping into a feature keeps the bar), with the active tab derived from the URL.
5. Light and dark both correct. Desktop (`lg+`) unchanged. Demo-aware where sample data is shown.

Non-goals: no backend changes; no new feature screens (every section already renders on phone via the shared `PageTabs` bar); the two coming-soon placeholders (Sales Scripts, Reports) stay out.

## Current state (from audit, base `6fe19a8`)

- `nav.ts` is the single source of truth: 2 sections (Marketing, Company) + Home + phone-only Chat. 14 destinations. Sub-pages render via the shared, device-agnostic `components/PageTabs.tsx` (scrollable underline bar), so **feature screens already work on phone**; the gap Direction B fixes is the phone **entry point** (Paid Ads, Reviews, Website, Jobs have none today).
- Bottom bar `components/BottomNav.tsx` reads `flattenNav(NAV).filter(bottomNav)`, up to 5 items; active tab is passed by prop (`ROUTE_BY_KEY`), not the URL; it is `lg:hidden` and rendered **per-page** (only Home, Conversations, Leads, Contacts, Comms, Automations, ComingSoon), so most routes have no bar.
- Phone home lives in `routes/Home.tsx` (below `lg`): NavyHero + `newToday`/`unread` KPIs (`useSummaryQuery`), Revenue card, Most-active pipeline, All pipelines, a "More" menu, Recent activity (`useActivityQuery`). Desktop is `HomeDesktop`.
- Shared primitives: `components/ui` (`Panel`, `Badge`, `EmptyState`, `Segmented`, ...), `lib/layout.ts` `PAGE_CONTAINER`, `demo/demoMode`.

## Phases

### Phase 1 — All features grid + bottom-bar item  (runnable slice)
- `nav.ts`: add phone-only item `{ to: "/apps", label: "All features", shortLabel: "All", icon: LayoutGrid, bottomNav: true, sidebarHidden: true }` inserted **after Inbox** in Company so the bottom-bar flatten order is `Home, Inbox, Apps, Contacts, Chat` (Apps centered). Remove `bottomNav` from Leads. Add `shortLabel: "Today"` to Home.
- New `routes/AllFeatures.tsx`: grid grouped Get customers / Sell & book / Run the business, tiles built from `filterNav(flattenNav(NAV))` by route, linking to `item.to` with `item.label`/`item.icon`. Permission-gated automatically (staff without Team/Revenue don't see them).
- `App.tsx`: add `/apps` protected route.
- `BottomNav.tsx`: interim — add `apps` to `NavKey`/`ROUTE_BY_KEY` (removed in Phase 4 when active goes URL-based).
- `nav.test.ts`: bottom-bar test now asserts order `[/home, /conversations, /apps, /contacts, /comms]` and that `/sales/leads` is not on it.

### Phase 2 — Center raised "All" button
- `BottomNav.tsx`: render the `/apps` tab as the raised gradient square (prototype's signature), others as normal tabs.

### Phase 3 — Today home
- Reshape the `routes/Home.tsx` phone block into the priority feed + week KPIs. Real data: `newToday` -> "New leads to reply", `unread` -> "Messages waiting". Sample+gated (via `demoMode()`), until their feeds exist: "Jobs today", "Reviews to answer". Keep Revenue tap-through. `HomeDesktop` untouched.

### Phase 4 — Persistent bottom bar
- Render `<BottomNav/>` once in `Shell.tsx` (already `lg:hidden`); remove the per-page instances (Home, Conversations, Leads, Contacts, Comms, Automations, ComingSoon). Switch active detection to `useLocation()` prefix-match on `item.to`; drop `ROUTE_BY_KEY`/`active` prop.

### Phase 5 — Verify
- `tsc --noEmit` + `npm run build`; run `?demo=1` at phone width in light and dark; screenshot Today, grid, a feature drill-in, back. Update/added tests green (`vitest run`).

### Phase 6 — Ship
- Commit per phase; PR/merge to main; watch Cloudflare Pages; smoke-test live at phone width. Update memory + `docs/connections/` for any sampled Today feeds.

## Grid groups (from current nav.ts)
- Get customers: `/marketing/paid-ads`, `/marketing/reviews`, `/marketing/campaigns`, `/marketing/website`, `/marketing/social`
- Sell & book: `/sales/leads` (hosts New Leads / Pipeline tabs), `/sales/jobs`
- Run the business: `/conversations`, `/contacts`, `/calendar`, `/billing`, `/company/documents`, `/team`

## Risks
- Persistent-bar refactor touches ~7 pages that render `BottomNav` today (remove) + safe-area/padding at the bottom of scroll columns; verify no double bar and no content hidden behind the bar.
- `nav.test.ts` and any snapshot of the bottom bar need updating.
