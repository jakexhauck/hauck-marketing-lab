# Shell restructure: icon rail + merged Clients/Ads sub-app

Picked direction: Variation A (48px left-side icon rail, Linear/Slack style). Mockup lives at `mockups/shell-restructure/variation-A-icon-rail.html`. Delete that mockup on ship.

## Why

Today the sidebar is one flat list (Dashboard / Agency / Workspace). Ads Manager + Clients Hub are two surfaces that constantly need to be cross-referenced. This restructure makes each Agency item a "sub-app" that takes over the sidebar, and merges Ads Manager into Clients Hub since every client we run ads for.

## Target architecture

**Sub-apps (top-bar switcher):**
- Dashboard, Clients, Outreach, Sales Pipeline, Onboarding, Workspace, Settings

**Clients sub-app:**
- Landing: simplified Variation-B cross-client explorer (6-7 cols, sparklines, breathing room)
- Sidebar: filter chips + flat client list. Active client expands inline with nested tabs (Dashboard / Ads / Onboarding / Service Delivery / Profile / Memory).
- Replaces the standalone `AdsManagerWorkspace`.

**Workspace sub-app:**
- Calendar, Tasks, Revenue, Recordings, SOPs, Resources, Personal Hub (all moved INTO this sub-app)

**Icon rail (48px, far left, always visible):**
- Brand mark at top, then primary sub-apps (Dashboard, Clients, Outreach, Sales, Onboarding), a divider, then Workspace. Settings pushed to the bottom.
- Active icon shows a left accent bar plus a tinted background.
- Tooltip on hover with name + sub-line + Cmd 1..6 kbd hint.

**Top bar:** unchanged. Breadcrumb left, right-cluster (clock, sync, notifications, settings, new) untouched.

## Chunks

### Chunk 1: Foundation (DONE)
- `app/src/lib/navigation.ts`: `SubApp` type + `SUB_APPS` const + `viewToSubApp` + `subAppToDefaultView`.
- `app/src/components/MainDashboard/IconRail.tsx`: 48px rail with brand mark, primary sub-apps, divider, Workspace, settings at bottom. Tooltip on hover. Cmd+1..6 shortcuts.
- `app/src/components/MainDashboard/index.tsx`: derives `currentSubApp` from view, mounts IconRail before AppSidebar in the shell grid.
- `app/src/styles/design-system.css`: 3-col shell grid (48px + sidebar + main), full `.hml-rail-*` styles.

### Chunk 2: Per-sub-app sidebars
- Split `AppSidebar.tsx` into a thin shell that renders one of:
  - `sub-apps/ClientsSidebar.tsx` (filter chips + client list + inline-expanded active client)
  - `sub-apps/WorkspaceSidebar.tsx` (Calendar/Tasks/Revenue/Recordings/SOPs/Resources/Personal)
  - `sub-apps/OutreachSidebar.tsx` (Overview/Lead Scraper/Web Designer/Sequence/DMs/Prospects)
  - No-sidebar variants for Dashboard, Sales, Onboarding (single-page).
- Dashboard and Settings sub-apps render with the sub-app sidebar hidden (or a slim summary panel — TBD).

### Chunk 3: Clients landing
- `app/src/components/MainDashboard/pages/ClientsLanding.tsx`: new component. Cross-client KPI strip + simplified explorer table. Same data source as `AdsManagerWorkspace` (Meta Ads insights from `clients.yaml` per memory).
- Delete `AdsManagerWorkspace.tsx` once its surface is migrated. Keep `AdsManagerPage.tsx` (per-client) — that's still used inside the client's Ads tab.

### Chunk 4: Verify + delete
- Run app, click through every sub-app, drill into a client, switch back via dropdown.
- Delete:
  - `mockups/shell-restructure/variation-B-top-switcher.html`
  - This plan file
  - `AdsManagerWorkspace.tsx` (after migrating)
- Append Jake action items to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` if any remain.

## Out of scope

- Sales / Onboarding internal restructures (they stay as single pages inside their own sub-apps).
- Settings sub-app internals (settings still opens via the gear icon for now).
- Cmd-K palette (already a placeholder, not blocking).
