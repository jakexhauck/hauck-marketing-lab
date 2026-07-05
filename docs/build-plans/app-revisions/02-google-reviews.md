# Google Reviews - Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` for shared ground rules (app location, run/verify commands, no-em-dash + never-name-GHL rules, data contract). Self-contained otherwise.

> **SCAFFOLD ALREADY DONE - do not touch shared files.** The nav, routes, and in-page tabs (`src/lib/nav.ts`, `src/lib/pageTabs.ts`, `src/App.tsx`, `src/lib/nav.test.ts`) plus placeholder components for this section already exist on your branch (`rev/reviews`). The "What's working" tab is already renamed to "Reputation Report" (route `/marketing/reviews/report`) and a "Review Pipeline" tab + placeholder already exist. Any step below that says add/rename a tab or route is ALREADY DONE: skip it. Replace the body of your section's components with the real UI, and only edit files inside your section.

**Goal:** Fix the Overview formatting bug, give the review pipeline its own page (read-only), rename "What's working" to a more professional overview, remove the top-right action buttons and the tagline, and wire the correct data into Overview.

**Scope:** Pages-first. UI plus real data where the source exists (Google Places for rating/recent; the review pipeline funnel is already real). No automations, no triggers. Pipeline page is **read-only**.

## Current state (audited)
- Routes: `src/App.tsx:442-445`, base `/marketing/reviews`.
- Tabs: `src/lib/pageTabs.ts:22-27` (`REVIEWS_TABS`) - **Overview / Ask for Reviews / All Reviews / What's working**. Section label at `pageTabs.ts:65`.
- Pages: `src/routes/reviews/ReviewsOverview.tsx`, `ReviewsRequests.tsx`, `ReviewsAll.tsx`, `ReviewsInsights.tsx`, `shared.tsx` (`StarRating`, `NotConnectedNotice`, `ReviewsComingSoon`).
- Overview description (to remove): `ReviewsOverview.tsx:387` "Your reputation at a glance. Ask for new ones and reply to the rest."
- Top-right buttons (to remove): `ReviewsOverview.tsx:388-402` - "Reply to reviews" (→ `/marketing/reviews/all`) and "Ask for a review" (→ `/marketing/reviews/requests`).
- Rating hero + recent reviews: real via `useReviewsSummary` → `GET /api/reviews/summary` (Google Places; needs `GOOGLE_PLACES_API_KEY` + tenant `google_place_id`).
- Review funnel (request → click → review): real, read-only, already on Overview - `ReviewsFunnelView`, `ReviewsOverview.tsx:97-269`, via `useReviewsFunnel` → `GET /api/reviews/funnel` (`functions/api/reviews/funnel.ts`, resolves the review pipeline by name).
- The 2x2 Overview stat chips (Total reviews / New this month / Requests sent / Reply rate) are DEMO-only hardcoded (`ReviewsOverview.tsx:47-90, 418-591`).
- "What's working" = `ReviewsInsights.tsx`, demo-only; real session shows `ReviewsComingSoon`. Description `ReviewsInsights.tsx:92`.
- "Ask for Reviews" (`ReviewsRequests.tsx`) already lists completed-job contacts with a Start Campaign button (real via `GET/POST /api/reviews`). The completed-job trigger is deferred to the automation phase; leave this tab as-is.

---

### Task 1: Fix the Overview formatting bug (doc #1, Jake: button cut off)
On the Willis preview, the "ask for a review" button under the reputation score is getting cut off.
**Files:** `src/routes/reviews/ReviewsOverview.tsx` (rating hero area, around the reputation-score block and its action button).
- [ ] Reproduce at `?demo=1` at a narrow/desktop width; identify the container clipping the button (likely an `overflow-hidden`, fixed height, or flex/padding constraint on the hero card).
- [ ] Fix so the button is fully visible and not clipped across mobile and desktop widths. Prefer a layout fix (padding / min-height / remove overflow clip) over shrinking the button.
- [ ] Note: Task 3 removes the top-right buttons; this button under the reputation score is the in-hero one, distinct from those. Confirm which survives (the in-hero call-to-action stays unless Jake says otherwise).
- [ ] Walk `?demo=1` at mobile + desktop widths and confirm no clipping.
- [ ] Commit: `fix(reviews): overview reputation-score button no longer clipped`.

### Task 2: Remove the top-right buttons and the tagline (doc #4, #5)
**Files:** `src/routes/reviews/ReviewsOverview.tsx:387-402`.
- [ ] Remove the "Reply to reviews" and "Ask for a review" buttons from the `PageBar` actions (`:388-402`).
- [ ] Remove the Overview description "Your reputation at a glance. Ask for new ones and reply to the rest." (`:387`) so no subtitle renders.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(reviews): remove overview action buttons and tagline`.

### Task 3: Give the review pipeline its own page, read-only (doc #2, Jake: separate page)
Move the existing read-only funnel off Overview into its own tab. Show a "not started" state if no campaign has run for the sub-account.
**Files:** `src/lib/pageTabs.ts:22-27`, `src/lib/nav.test.ts`, `src/App.tsx:442-445`, create `src/routes/reviews/ReviewsPipeline.tsx`, edit `src/routes/reviews/ReviewsOverview.tsx`.
- [ ] Add a `Pipeline` tab (label suggestion: "Review Pipeline") → route `/marketing/reviews/pipeline`.
- [ ] Create `ReviewsPipeline.tsx` that renders the funnel using the SAME `useReviewsFunnel` hook and the funnel view currently at `ReviewsOverview.tsx:97-269`. Extract `ReviewsFunnelView` into a shared component if it is not already exported, and reuse it (DRY, do not copy-paste the JSX).
- [ ] Keep it strictly **read-only** (no drag, no stage-move controls).
- [ ] When the funnel is empty / the review pipeline has not been run for this sub-account, show an honest "We haven't started collecting reviews for you yet" state (customer language, never name the pipeline/GHL).
- [ ] Remove the funnel from Overview (or leave a compact summary link to the new page - confirm with Jake; default: remove it from Overview since it now has its own page).
- [ ] Update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`.
- [ ] Commit: `feat(reviews): dedicated read-only review pipeline page`.

### Task 4: Rename "What's working" to a professional overview name (doc #3, Jake: I name it)
Chosen name: **"Reputation Report"** (route `/marketing/reviews/report`). Alternatives if Jake prefers: "Results", "Performance".
**Files:** `src/lib/pageTabs.ts:22-27`, `src/lib/nav.test.ts`, `src/App.tsx`, rename `src/routes/reviews/ReviewsInsights.tsx` → `ReviewsReport.tsx` (or repurpose in place).
- [ ] Rename the tab label `What's working` → `Reputation Report` and its route `/insights` → `/report`.
- [ ] Update the route + import in `App.tsx` and `nav.test.ts`.
- [ ] Update the page's own description to match the professional framing (plain English, no vanity-metric tagline). Keep the real-session `ReviewsComingSoon` behavior until real insight data exists.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`.
- [ ] Commit: `feat(reviews): rename whats-working to Reputation Report`.

### Task 5: Wire the correct data into Overview (doc #6)
The 2x2 stat chips are demo-only. Make a real session show real numbers or honest empties, never fabricated.
**Files:** `src/routes/reviews/ReviewsOverview.tsx`; reuse `useReviewsSummary` (`/api/reviews/summary`) and `useReviewsFunnel` (`/api/reviews/funnel`).
- [ ] Map each Overview stat to a real source where one exists:
  - Total reviews / average rating / recent reviews → `useReviewsSummary` (Places).
  - Requests sent / asked / clicked / left-a-review → `useReviewsFunnel`.
- [ ] For any chip with no real source yet (e.g. reply rate), either hide it in a real session or show an honest empty; do NOT show the demo number to a connected client.
- [ ] Keep the demo (`?demo=1`) layout populated and unchanged.
- [ ] `npm run typecheck` + walk `?demo=1`; note for Jake which chips need a Willis session to confirm.
- [ ] Commit: `feat(reviews): wire real data into overview stat chips`.

## Deferred (documented, do NOT build here)
- **Doc #7** (ask-for-reviews direct trigger on job completion): the completed-jobs list already exists; the trigger is an automation-phase item. Leave `ReviewsRequests.tsx` as-is.
- **Doc #8** (full Google Business Profile backend view + public preview): blocked on the Google Business Profile API approval (submitted, pending). Optionally add a placeholder "Your Google Business Profile" tab with a coming-soon shell, but do not attempt GBP data until approval lands. Confirm with Jake before adding even the shell.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Walk every Reviews tab at `?demo=1`; confirm the button-clip fix at mobile + desktop.
- Report which data needs a real Willis session.
