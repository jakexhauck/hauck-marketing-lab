# Website - Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` for shared ground rules (app location, run/verify commands, no-em-dash + never-name-GHL rules, data contract). Self-contained otherwise.

> **SCAFFOLD ALREADY DONE - do not touch shared files.** The nav, routes, and in-page tabs (`src/lib/nav.ts`, `src/lib/pageTabs.ts`, `src/App.tsx`, `src/lib/nav.test.ts`) already exist on your branch (`rev/website`). The "What's working" tab is already renamed to "Insights"; the "Request a Change" tab is already removed and `/marketing/website/request` already redirects to `/pages`. Any step below that says add/rename/remove a tab or route is ALREADY DONE: skip it. Your remaining work is component-level (fold the pin-drop into Pages, phone frame, clean Overview, Insights data). Only edit files inside your section.

**Goal:** Make Overview a clean full-site preview with a realistic phone mockup and no data row; fold Request-a-Change into the Pages tab as an in-place per-page pin drop; turn "What's working" into a data page that adds chat-widget and estimate-form numbers (from GoHighLevel) to the GA4 data; remove the tagline and the top Overview "request a change" button.

**Scope:** Pages-first. UI plus real data where the source exists (GA4 already wired; chat-widget + estimate-form counts come from GoHighLevel, read-only). No automations.

## Current state (audited)
- Routes: `src/App.tsx:450-453` - `/marketing/website` → `WebsiteOverview`, `/pages` → `WebsitePages`, `/request` → `WebsiteRequestChange`, `/insights` → `WebsiteInsights`.
- Tabs: `src/lib/pageTabs.ts:37-42` - **Overview / Pages / Request a Change / What's working**.
- Components under `src/routes/website/`: `WebsiteOverview.tsx`, `WebsitePages.tsx`, `WebsiteRequestChange.tsx`, `WebsiteInsights.tsx`, `shared.tsx` (`BrowserFrame`, `SiteMock`, `LiveSiteFrame`, `DeviceToggle`).
- Overview: full live preview hero (real via `client.websiteUrl`); `DeviceToggle` at `WebsiteOverview.tsx:168` wraps mobile to `max-w-[390px]` (:171); KPI data row (4 tiles); demo-only hero chips (:187); description "Your storefront is open... Rivertown..." (:125, hardcoded city); two top buttons "Request a change" (:132) and "View live site" (:140). Data via `useWebsiteAnalytics` → `GET /api/website/analytics` (GA4).
- Pages: `WebsitePages.tsx`; per-page preview with a "Request a change to this page" button that NAVIGATES to `/marketing/website/request` (:173-179); pages from `useWebsitePages` → `GET /api/website/pages`.
- Request a Change: `WebsiteRequestChange.tsx`; click-to-drop-pin (:84-108) but always previews the HOME page (`PAGE = "home"`, :32); persists via `useWebsiteRequests` → `GET/POST /api/website/requests`; right rail "Your requests" list.
- What's working: `WebsiteInsights.tsx`; real GA4; description at :68.

## Final tab set (target)
`Overview` / `Pages` / `Insights` - Request-a-Change is folded into Pages; "What's working" becomes "Insights" (the data page).

---

### Task 1: Clean up Overview (doc #1 partial, #4, #5)
**Files:** `src/routes/website/WebsiteOverview.tsx`.
- [ ] Remove the KPI data row (the 4 tiles) so Overview is the site preview, not a data page (data lives on Insights).
- [ ] Remove the demo-only floating hero chips (:187).
- [ ] Remove the description "Your storefront is open..." (:125) so no subtitle renders. (This also removes the hardcoded "Rivertown".)
- [ ] Remove the top "Request a change" button (:132). Keep "View live site" (:140).
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(website): overview is clean site preview, drop data row/tagline/request button`.

### Task 2: Realistic phone mockup for the mobile preview (doc #1)
Jake wants the mobile view to look like a real phone with the site on it.
**Files:** `src/routes/website/shared.tsx` (the `DeviceToggle` / `BrowserFrame` area) and/or a new `PhoneFrame` component; used by `WebsiteOverview.tsx` and `WebsitePages.tsx`.
- [ ] When the device toggle is set to mobile, wrap `LiveSiteFrame` in a realistic phone shell: rounded bezel, subtle notch/speaker, device shadow, correct phone aspect ratio (not just a `max-w-[390px]` clip).
- [ ] Keep it responsive and theme-aware (light/dark). Reuse this `PhoneFrame` on the Pages tab preview too (DRY).
- [ ] Consider using the `impeccable` skill for the visual polish pass.
- [ ] `npm run typecheck` + walk `?demo=1` in both device modes.
- [ ] Commit: `feat(website): realistic phone frame for mobile preview`.

### Task 3: Fold Request-a-Change into Pages as an in-place per-page pin drop (doc #3)
Jake: the "request a change to this page" button on the Pages tab should let them drop a pin on THAT specific page, in place, not navigate away.
**Files:** `src/routes/website/WebsitePages.tsx`, `src/routes/website/WebsiteRequestChange.tsx` (source the pin-drop logic), `src/lib/pageTabs.ts:37-42`, `src/lib/nav.test.ts`, `src/App.tsx:450-453`.
- [ ] Move the pin-drop interaction (currently `WebsiteRequestChange.tsx:84-108`) into the Pages tab so clicking "Request a change to this page" activates pin-drop mode on the currently-selected page preview (pass the selected page id/slug instead of the hardcoded `PAGE = "home"`).
- [ ] Extract the pin-drop canvas + note composer into a shared component so Pages consumes it (DRY, do not duplicate). Keep persistence via `useWebsiteRequests` (`GET/POST /api/website/requests`), and include the selected page in the saved request payload.
- [ ] Move the "Your requests" list (from `WebsiteRequestChange.tsx`) into a side panel on the Pages tab so clients still see submitted requests and their status.
- [ ] Remove the standalone "Request a Change" tab + route (it is now folded in). Add a redirect from `/marketing/website/request` → `/marketing/website/pages` so old links do not 404.
- [ ] Update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`: select a non-home page, drop a pin, add a note, see it in the requests list.
- [ ] Commit: `feat(website): in-place per-page change requests on Pages tab`.

### Task 4: Turn "What's working" into the Insights data page (doc #2)
Add chat-widget and estimate-form numbers (from GoHighLevel) to the existing GA4 data.
**Files:** `src/lib/pageTabs.ts:37-42`, `src/lib/nav.test.ts`, `src/App.tsx`, `src/routes/website/WebsiteInsights.tsx`; extend or add a handler for the GHL-sourced counts (e.g. extend `functions/api/website/analytics.ts` or add `functions/api/website/engagement.ts`) + a hook.
- [ ] Rename the tab label `What's working` → `Insights` (keep route `/insights`).
- [ ] Keep all existing GA4 data (visitors, page views, time on site, top page, sources, trend).
- [ ] Add two real, read-only data groups sourced from GoHighLevel:
  - **Estimate form**: number of estimate-form submissions (and trend if easy).
  - **Chat widget**: number of chat-widget conversations/messages.
  Pull these read-only from GHL (reuse the conversation/contact APIs the app already uses; resolve by source/tag). Surface them through a Pages Function; the client UI must never name GHL.
- [ ] Real session with no data shows honest zeros / not-connected, never demo numbers. Keep `?demo=1` populated.
- [ ] Update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`; note for Jake to confirm the chat-widget + form numbers in a Willis session.
- [ ] Commit: `feat(website): Insights data page adds chat-widget + estimate-form numbers`.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Walk Overview / Pages / Insights at `?demo=1`, both device modes.
- Report what needs a real Willis session (GA4 + GHL-sourced counts).

## Out of scope / deferred
- Any automation. The estimate-form + chat-widget numbers are read-only reporting, not new triggers.
