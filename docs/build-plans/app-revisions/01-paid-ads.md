# Paid Ads — Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` in this folder for shared ground rules (app location, run/verify commands, no-em-dash + never-name-GHL rules, data contract). This plan is self-contained otherwise.

**Goal:** Reshape the Paid Ads section so the client sees only live ads, an in-depth Meta-stats tab (replacing "What's working"), an ads-phase indicator, a funnel "coming soon" page, and (best-effort) a Meta media library and per-ad placement previews.

**Scope:** Pages-first. UI plus read-only Meta data (Meta is already the source via `/api/ads/insights`). No automations, no write-back.

## Current state (audited)
- Routes: `src/App.tsx:437-441` — `/marketing/paid-ads` → `AdsOverview`, `/creatives` → `AdsCreatives`, `/insights` → `AdsInsights`, `/leads` redirects to `/sales/leads?source=ads`.
- Components: `src/routes/paid-ads/AdsOverview.tsx`, `AdsCreatives.tsx`, `AdsInsights.tsx`, `shared.tsx` (demo data, `NotConnectedNotice`, platform glyphs). `AdsLeads.tsx` is dead (route redirects away).
- Tabs: `src/lib/pageTabs.ts:13-20` (`PAID_ADS_TABS`) — **Overview / Your Ads / What's working**.
- Data: one hook `useAdsInsights` → `GET /api/ads/insights` (`src/hooks/useAdsInsights.ts`). Handler: `functions/api/ads/insights.ts`. `configured:false` → not-connected notice; real+zero → honest zeros.
- Overview KPI tiles already show all six requested metrics (`AdsOverview.tsx:43-50`): Spent on ads, New leads, Cost per lead, New customers, Revenue from ads, Your return (ROAS). **Item 3 in the doc is effectively done — just verify wiring.**
- "Your Ads" (`AdsCreatives.tsx`) shows active AND paused ads (pill at line 49) and per-ad "leads from this ad" + "people reached" (lines 104-112). No click-through, no placement views.
- Header descriptions: Overview `AdsOverview.tsx:70`, Your Ads `AdsCreatives.tsx:44`, Insights `AdsInsights.tsx:46`.
- There is an ORPHANED demo dashboard at `/paid-ads` (`src/routes/PaidAds.tsx` + `src/components/ads/*`: `MetricBand`, `DeliveryTrend`, `AdFunnel`, `CampaignsTable`) and an unused `src/components/ads-tracker/*`. These are reference material for the in-depth tab and the funnel; do NOT wire them as-is (100% demo).

## Final tab set (target)
`Overview` / `Your Ads` / `Ad Stats` / `Funnel` / `Media` — where `Ad Stats` replaces `What's working`, `Funnel` is a coming-soon page, and `Media` is the Meta media library page.

---

### Task 1: Remove the Overview header description (doc #9)
**Files:** `src/routes/paid-ads/AdsOverview.tsx` (the `description` string ~line 70, passed to `PageBar`).
- [ ] Delete the description text so `PageBar` renders no subtitle for Paid Ads Overview (pass `description={undefined}` or remove the prop, matching how `PageBar` handles an absent description).
- [ ] `npm run typecheck` clean.
- [ ] Commit: `feat(paid-ads): drop overview header description`.

### Task 2: Your Ads = live ads only, and remove the two per-ad stats (doc #6, #8)
**Files:** `src/routes/paid-ads/AdsCreatives.tsx`.
- [ ] Filter the ad list to active/live only. The data already distinguishes active vs paused (the pill at ~line 49 counts both). Filter out paused before render; update or remove the "{activeCount} active, {pausedCount} paused" pill so it reads only the live count (e.g. "{n} ads running now").
- [ ] Remove the two per-card stats "leads from this ad" and "people reached" (~lines 104-112). Leave the creative thumbnail, headline, copy, and platform badges.
- [ ] Confirm the empty state still reads correctly when there are zero live ads (honest empty, not demo).
- [ ] `npm run typecheck` + walk `?demo=1` on Your Ads.
- [ ] Commit: `feat(paid-ads): show live ads only, remove per-ad reach/leads stats`.

### Task 3: Ads-phase indicator, Learning / Scaling (doc #2)
**Files:** `src/routes/paid-ads/AdsOverview.tsx`; possibly `functions/api/ads/insights.ts` + `src/hooks/useAdsInsights.ts` if you derive phase from Meta.
- [ ] Add a small labeled badge near the Overview title/hero: "Phase: Learning" or "Phase: Scaling".
- [ ] Source of the phase value, in priority order:
  1. If the Meta insights response exposes an ad-set learning status (Meta field `learning_stage_info` / `learning_stage` on the ad set), map `LEARNING` → "Learning" and `SUCCESS`/`LEARNING_LIMITED` → "Scaling", and surface it through `/api/ads/insights` as `phase: "learning" | "scaling" | null`. Extend the handler read-only (no writes).
  2. If that is not readily available, read an optional tenant field `ads_phase` (`"learning" | "scaling"`) and render the badge only when set. Do not invent a value.
- [ ] Hide the badge entirely when phase is unknown/null (no fabricated state).
- [ ] `npm run typecheck`; walk `?demo=1` (demo can hardcode "Scaling").
- [ ] Commit: `feat(paid-ads): add learning/scaling phase indicator`.

### Task 4: Replace "What's working" with an in-depth "Ad Stats" tab (doc #1)
Jake: show the real Meta stats that actually apply to our use case (local service lead-gen). Keep it read-only.
**Files:** `src/lib/pageTabs.ts:13-20`, `src/lib/nav.test.ts`, `src/App.tsx:437-441`, rename `src/routes/paid-ads/AdsInsights.tsx` → `AdsStats.tsx` (or repurpose in place), `functions/api/ads/insights.ts` + `src/hooks/useAdsInsights.ts` if new fields are needed.
- [ ] In `pageTabs.ts`, rename the `What's working` tab to `Ad Stats` and its route from `/insights` to `/stats` (update label + `to`).
- [ ] Update the route in `App.tsx` and the component import.
- [ ] Update `nav.test.ts` for the new route/label.
- [ ] Build the Ad Stats view showing the applicable Meta metrics for lead-gen, grouped and plain-labeled (no jargon dumps). Target metric set (include those the endpoint returns; extend the read-only endpoint for any missing that Meta provides):
  - Spend, Impressions, Reach, Frequency
  - Link clicks, CTR, CPC, CPM
  - Leads, Cost per lead
  - New customers, Revenue, ROAS
  - Optional per-campaign / per-ad breakdown table (reference `src/components/ads/CampaignsTable.tsx` for layout only; wire to real data).
- [ ] Real session with no data shows honest zeros / not-connected notice (reuse `shared.tsx` `NotConnectedNotice`). Demo shows a populated sample.
- [ ] `npm run typecheck` + `npm test` (nav test) + walk `?demo=1`.
- [ ] Commit: `feat(paid-ads): replace whats-working with in-depth Ad Stats tab`.

### Task 5: Funnel "coming soon" page (doc #4)
Every client starts on lead forms, so this ships as a coming-soon shell now.
**Files:** `src/lib/pageTabs.ts` (add `Funnel` → `/funnel`), `src/lib/nav.test.ts`, `src/App.tsx`, create `src/routes/paid-ads/AdsFunnel.tsx`.
- [ ] Add the `Funnel` tab + route.
- [ ] `AdsFunnel.tsx` renders a coming-soon state explaining that when we run traffic to a funnel it will appear here (customer language, no GHL terms). Reference the visual of `src/components/ads/AdFunnel.tsx` only if you want a preview graphic; keep it clearly labeled as a preview / coming soon.
- [ ] Update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`.
- [ ] Commit: `feat(paid-ads): add funnel coming-soon page`.

### Task 6: Meta media library page (doc #5) — best-effort
**Files:** `src/lib/pageTabs.ts` (add `Media` → `/media`), `src/lib/nav.test.ts`, `src/App.tsx`, create `src/routes/paid-ads/AdsMedia.tsx`; optional new handler `functions/api/ads/media.ts` + hook.
- [ ] Add the `Media` tab + route.
- [ ] Attempt a read-only Meta media fetch: the ad account's ad images/videos via the Graph API (`/{ad_account_id}/adimages`, `/advideos`) using the existing System User token (same token `insights.ts` uses). If reachable, render a simple grid gallery.
- [ ] If the Graph media endpoints are not reachable with the current token/permissions, ship a coming-soon shell instead and leave a TODO documenting the missing permission. **Do not fabricate media.**
- [ ] Update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`; note for Jake whether real media loaded in a Willis session.
- [ ] Commit: `feat(paid-ads): add Meta media library page (best-effort)`.

### Task 7: Click into an ad to see placement previews (doc #7) — best-effort
**Files:** `src/routes/paid-ads/AdsCreatives.tsx` (make cards open a detail view), create `src/components/ads/AdPreviewModal.tsx`; optional handler `functions/api/ads/preview.ts` + hook.
- [ ] Make each live ad card clickable, opening a detail modal.
- [ ] In the modal, show the ad across placements (feed / story / reel / Instagram) using Meta's ad preview API (`/{ad_id}/previews?ad_format=...` or `generatepreviews`) via the existing token. Render the returned preview iframes/images, one per format.
- [ ] If preview generation is not available with the current token, show the creative thumbnail plus a clear "full placement previews coming soon" note. **No fabricated previews.**
- [ ] `npm run typecheck` + walk `?demo=1` (demo can show static placement mockups).
- [ ] Commit: `feat(paid-ads): per-ad placement preview modal (best-effort)`.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` all clean.
- Walk every Paid Ads tab at `?demo=1`.
- Report to Jake what needs a real Willis session to confirm: phase value, Ad Stats real numbers, media library, placement previews.

## Out of scope / deferred
- Any automation, lead write-back, or funnel wiring.
- Deleting the orphaned `/paid-ads` dashboard + `components/ads/*` + `components/ads-tracker/*` — leave for a separate cleanup pass; only borrow layout ideas here.
