# Outreach IA Split (Commercial Outreach / Reactivation / Group Outreach) - Implementation Plan

> **THIS PLAN IS ABSORBED INTO THE SCAFFOLD. DO NOT RUN IT.** Every nav/route/tab change and every shell described below was already implemented by the scaffold commit on `main` (Commercial Outreach, Reactivation, and Group Outreach sections all exist, with placeholder "in the works" pages). This file is kept only as a record of what the scaffold did. The remaining Reactivation content work lives in `07-reactivation.md`.

**Goal:** Split the current single "Campaigns" Marketing section into three top-level Marketing sections: **Commercial Outreach** (rename of Campaigns, shells only, "in the works", nothing configured), **Reactivation** (promote the existing real component to its own section), and **Group Outreach** (new, "in the works" shell).

**Scope:** Nav + routes + shell pages only. Commercial Outreach and Group Outreach are NOT live services yet (Jake: "we aren't doing this as a service yet so don't configure anything on the page"), so their pages are coming-soon / "in the works" shells with no real wiring. Reactivation keeps its existing real data; its inner pages are built in plan 07.

## OPEN QUESTION FOR JAKE (do not guess - confirm before Task 3)
The current Campaigns section contains a **real, working "Audiences"** feature (`campaigns/CampaignsAudiences.tsx` → `GET /api/campaigns/audiences`) and demo customer-messaging views (Overview / Campaigns list / What's working). When Campaigns becomes B2B "Commercial Outreach", what happens to the customer-messaging concept and Audiences?
- Default assumed here: keep the Audiences endpoint intact, but do NOT surface customer-messaging demo content under Commercial Outreach (it is B2B now). Park Audiences (route kept alive, not linked) until Jake says where it lives.
- Confirm with Jake whether Audiences should live under Reactivation, stay hidden, or be removed.

## Current state (audited)
- Nav: `src/lib/nav.ts` - Marketing section; the "Campaigns" row is at `nav.ts:90`.
- Tabs: `src/lib/pageTabs.ts:29-35` (`CAMPAIGNS_TABS` = Overview / Campaigns / Audiences / Reactivation / What's working); `sectionLabel()` :62-70.
- Routes: `src/App.tsx:446-449` + `:432`; legacy redirect `/sales/reactivation` → `/marketing/campaigns/reactivation` at `:431`.
- Components: `src/routes/campaigns/CampaignsOverview.tsx` (demo), `CampaignsList.tsx` (demo), `CampaignsAudiences.tsx` (**real**), `CampaignsInsights.tsx` (demo), `src/routes/sales/Reactivation.tsx` (**real**, `GET /api/campaigns/reactivation`), `src/routes/campaigns/shared.tsx` (demo data + `NotConnectedNotice`).
- Shared header: `src/components/PageBar.tsx`. Guard test: `src/lib/nav.test.ts`.

## Target Marketing nav (after this plan)
Paid Ads / Google Reviews / **Commercial Outreach** / **Reactivation** / **Group Outreach** / Website / Social Media.

---

### Task 1: Add the three new tab arrays and section labels (testable)
**Files:** `src/lib/pageTabs.ts:29-35, 62-70`, `src/lib/nav.test.ts`.
- [ ] Replace `CAMPAIGNS_TABS` with three arrays:
  - `COMMERCIAL_OUTREACH_TABS`: `Overview` (`/marketing/outreach`), `Schedule` (`/marketing/outreach/schedule`), `Emails Sent` (`/marketing/outreach/emails`), `Full Data` (`/marketing/outreach/data`), `SMS` (`/marketing/outreach/sms`).
  - `REACTIVATION_TABS`: `Overview` (`/marketing/reactivation`), `Pipeline` (`/marketing/reactivation/pipeline`), `Full Data` (`/marketing/reactivation/data`), `Messages` (`/marketing/reactivation/messages`).
  - `GROUP_OUTREACH_TABS`: `Overview` (`/marketing/groups`) only.
- [ ] Add each to `sectionLabel()` returning "Commercial Outreach", "Reactivation", "Group Outreach".
- [ ] Update `nav.test.ts` to expect the new routes/labels and no `CAMPAIGNS_TABS`.
- [ ] `npm test` (nav test) + `npm run typecheck`.
- [ ] Commit: `feat(marketing): define Commercial Outreach / Reactivation / Group Outreach tabs`.

### Task 2: Swap the nav rows (testable)
**Files:** `src/lib/nav.ts:90` (and surrounding Marketing section), `src/lib/nav.test.ts`.
- [ ] Replace the single "Campaigns" Marketing row with three rows in this order after Google Reviews: Commercial Outreach (`/marketing/outreach`), Reactivation (`/marketing/reactivation`), Group Outreach (`/marketing/groups`). Pick sensible icons consistent with the existing set.
- [ ] Update `nav.test.ts`.
- [ ] `npm test` + `npm run typecheck`.
- [ ] Commit: `feat(marketing): three nav rows replace Campaigns`.

### Task 3: Commercial Outreach shells (doc: rename + "in the works", nothing configured)
**Files:** create `src/routes/outreach/OutreachOverview.tsx`, `OutreachSchedule.tsx`, `OutreachEmails.tsx`, `OutreachData.tsx`, `OutreachSms.tsx`, `shared.tsx` (a shared `InTheWorks` coming-soon component); `src/App.tsx`.
- [ ] Build a shared `InTheWorks` component: a clean coming-soon panel ("This is in the works. We'll switch it on when it's ready.") in customer language, matching the app's visual style.
- [ ] Each Commercial Outreach page renders `InTheWorks` with a short page-specific line (Schedule / Emails Sent / Full Data / SMS). No real data, no forms, nothing configured.
- [ ] Add routes in `App.tsx` for all five Commercial Outreach paths, each inside the `PageBar` with `COMMERCIAL_OUTREACH_TABS`.
- [ ] Do NOT carry over the old customer-messaging demo content. (See the open question re: Audiences.)
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(outreach): Commercial Outreach section with in-the-works shells`.

### Task 4: Promote Reactivation to its own section
**Files:** `src/App.tsx`, `src/routes/sales/Reactivation.tsx` (keep the component; it is real), redirects.
- [ ] Mount the existing `Reactivation` component at `/marketing/reactivation` (the Reactivation "Overview" tab) inside a `PageBar` with `REACTIVATION_TABS`.
- [ ] Add placeholder routes for `/marketing/reactivation/pipeline`, `/data`, `/messages` (plan 07 fills these). For now they can render a small "in the works" shell so the tabs do not 404.
- [ ] Redirects: `/marketing/campaigns/reactivation` → `/marketing/reactivation`; update `/sales/reactivation` (App.tsx:431) → `/marketing/reactivation`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`; confirm Reactivation still shows its real data.
- [ ] Commit: `feat(reactivation): promote Reactivation to its own Marketing section`.

### Task 5: Group Outreach shell (doc: standalone FB group outreach, "in the works")
**Files:** create `src/routes/groups/GroupOutreachOverview.tsx`; `src/App.tsx`.
- [ ] Route `/marketing/groups` renders the `InTheWorks` shell (reuse the component from Task 3), framed as Facebook group outreach, customer language.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(groups): Group Outreach in-the-works section`.

### Task 6: Retire the old Campaigns routes safely
**Files:** `src/App.tsx:446-449, 432`, old `src/routes/campaigns/*` components.
- [ ] Redirect `/marketing/campaigns` and `/marketing/campaigns/all` and `/marketing/campaigns/insights` → `/marketing/outreach`.
- [ ] Keep `/marketing/campaigns/audiences` reachable (real endpoint) per the open question, but unlinked, until Jake decides its home. Do not delete `CampaignsAudiences.tsx` or `/api/campaigns/audiences`.
- [ ] Remove the now-unused demo components (`CampaignsOverview.tsx`, `CampaignsList.tsx`, `CampaignsInsights.tsx`) only if nothing else imports them; otherwise leave and note.
- [ ] `npm run typecheck` + `npm test` + `npm run build`.
- [ ] Commit: `chore(marketing): retire old Campaigns routes with redirects`.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Walk the three new sections at `?demo=1`; confirm old `/marketing/campaigns/*` links redirect and nothing 404s.
- Report the Audiences open question to Jake before considering this done.
