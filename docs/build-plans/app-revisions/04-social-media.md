# Social Media — Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` for shared ground rules (app location, run/verify commands, no-em-dash + never-name-GHL rules, data contract). Self-contained otherwise.

**Goal:** Strip all AI from the Social section, remove templated ideas, relabel/trim the KPIs, gate Instagram composing on a real IG connection, turn "What's working" into a data page, and (best-effort) show post comments/likes with the ability to reply.

**Scope:** Pages-first. UI cleanup plus best-effort real engagement data. **Data caveat:** the posting backend (GHL Social Planner) exposes NO reach/engagement/comments API. The full-data page and comment replies therefore depend on a different source (Meta Graph / Google) and are built as UI now, wired best-effort, and honestly empty until the source is confirmed. Jake asked to keep them.

## Current state (audited)
- Routes: `src/App.tsx:454-458`, base `/marketing/social`.
- Tabs: `src/lib/pageTabs.ts:44-50` — **Overview / Ideas / Calendar / My Posts / What's working**. Section label `pageTabs.ts:64`.
- Pages: `src/routes/social/SocialOverview.tsx` (desc :121; KPIs :36-41 = Posts this month / Calls & messages / People reached / Scheduled), `SocialIdeas.tsx` (desc :70; templated ideas :14-51), `SocialCalendar.tsx` (desc :91), `SocialPosts.tsx` (desc :191), `SocialInsights.tsx` (desc :40; stats :11-16). Shared: `shared.tsx`.
- Dialogs: `src/components/social/SocialComposerDialog.tsx` (AI: "In your voice" badge, "Rewrite" button disabled + toast :174-181, tone chips; photo upload toast :219; preview tabs show all 3 platforms regardless of connection :243), `NewIdeaDialog.tsx`, `PlanMonthDialog.tsx`, `SocialDialog.tsx`.
- Hooks: `src/hooks/useSocial.ts`. Backend: `functions/api/social/accounts.ts`, `posts/index.ts`, `posts/[postId].ts`, `_lib.ts`.
- Real: `GET /api/social/accounts`, `GET /api/social/posts`, `POST /api/social/posts` (create; needs connected account ids), `DELETE /api/social/posts/[postId]`. Everything else (reach, calls, ideas, insights charts, AI) is demo-only or unwired.

---

### Task 1: Remove the header description (doc #1)
**Files:** `src/routes/social/SocialOverview.tsx:121` (and confirm no other Social page carries a tagline Jake wants gone; doc says "under the header", i.e. Overview).
- [ ] Remove the Overview description so no subtitle renders.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(social): remove overview header description`.

### Task 2: Relabel and trim KPIs (doc #2)
**Files:** `src/routes/social/SocialOverview.tsx:36-41`, `src/routes/social/SocialInsights.tsx:11-16`.
- [ ] Rename "Calls & messages" → "DMs" everywhere it appears in Social.
- [ ] Remove the "People reached" KPI from Overview and from the What's-working/Insights stats.
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(social): rename calls-and-messages to DMs, drop people-reached`.

### Task 3: Gate Instagram composing on a real IG connection (doc #3)
The composer already filters platform toggles by connected accounts (`SocialComposerDialog.tsx:34-36`), but the live preview tabs still show all three platforms regardless (:243).
**Files:** `src/components/social/SocialComposerDialog.tsx`.
- [ ] Make the preview tabs (IG/FB/Google) respect the connected set the same way the "Post to" toggles do: do not show an Instagram preview/option when IG is not connected (outside demo).
- [ ] Verify: with only FB connected (real session), Instagram is offered nowhere in the composer.
- [ ] `npm run typecheck` + walk `?demo=1` (demo shows all) and reason through the real-session path.
- [ ] Commit: `feat(social): hide Instagram composing when IG not connected`.

### Task 4: Remove templated ideas (doc #4)
**Files:** `src/routes/social/SocialIdeas.tsx:14-51` (the hardcoded idea cards), `src/components/social/NewIdeaDialog.tsx` (keep manual idea entry, remove any AI-suggested content).
- [ ] Remove the templated idea cards. Keep the Ideas tab as a place for manually-added ideas (via `NewIdeaDialog`) only; if nothing remains, show an honest empty state ("No ideas yet").
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(social): remove templated ideas from Ideas tab`.

### Task 5: Remove everything AI across Social (doc #5)
**Files:** `src/components/social/SocialComposerDialog.tsx` (AI badge, Rewrite button + toast :174-181, tone chips), `src/routes/social/SocialOverview.tsx` (any "Ideas for you" AI framing, "Boost it as an ad?" AI nudge), `SocialIdeas.tsx`, `NewIdeaDialog.tsx`, `PlanMonthDialog.tsx` (if AI-driven).
- [ ] Remove the "In your voice" badge, the "Rewrite" button and its toast, and the tone chips (Friendly/Shorter/More fun/Salesy) from the composer.
- [ ] Remove any copy or control that mentions or implies AI anywhere in the Social section (search the `src/routes/social` and `src/components/social` trees for "AI", "rewrite", "in your voice", "generate", "Sparkles").
- [ ] `PlanMonthDialog`: if it is an AI "plan my month" feature, remove its entry point; if it is a plain scheduling helper, keep it minus any AI language.
- [ ] `npm run typecheck` + walk `?demo=1`; confirm no AI affordance remains.
- [ ] Commit: `feat(social): strip all AI features and language from Social`.

### Task 6: Turn "What's working" into a data page (doc #6) — best-effort data
**Files:** `src/lib/pageTabs.ts:44-50`, `src/lib/nav.test.ts`, `src/App.tsx`, `src/routes/social/SocialInsights.tsx`; possibly a new `functions/api/social/engagement.ts` + hook.
- [ ] Rename the tab `What's working` → `Insights` (keep or set a sensible route).
- [ ] Build the data-page UI: posts published, DMs, best time, and per-platform engagement where a real source exists.
- [ ] **Data source:** attempt read-only engagement from Meta Graph (FB/IG) and Google Business using the tokens the app already holds. If reachable, show real numbers; if not, show honest empty + a small "connecting your accounts" note. Do NOT fabricate engagement for a real client. Keep `?demo=1` populated.
- [ ] Update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`; clearly report to Jake which numbers are real vs pending a source.
- [ ] Commit: `feat(social): convert whats-working into Insights data page (best-effort engagement)`.

### Task 7: Comments/likes on My Posts, with replies (doc #7) — best-effort
**Files:** `src/routes/social/SocialPosts.tsx`, a new `src/components/social/PostEngagement.tsx`; possibly `functions/api/social/engagement.ts` (read) and a gated reply endpoint.
- [ ] On a posted item, show its comments and like/engagement counts if fetchable from Meta Graph / Google for that post.
- [ ] Provide a reply affordance on each comment. Since replying is a write to Meta/Google (not the posting backend), gate the send: only enabled when a confirmed write path + permission exists; otherwise show the comment read-only with a "replies coming soon" note. Do not fake sends.
- [ ] Real posts with no fetchable engagement show no fabricated metrics (honest empty).
- [ ] `npm run typecheck` + walk `?demo=1` (demo can show sample comments); report the real-source status to Jake.
- [ ] Commit: `feat(social): view post comments/likes with best-effort reply`.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Walk every Social tab at `?demo=1`; grep the Social tree to confirm zero AI references remain.
- Report to Jake exactly which engagement data is live vs blocked on a source.

## Flag for Jake
Comments/likes/reach are not available from the posting backend. Getting them real needs Meta Graph + Google Business read (and comment-reply write) access wired per tenant. This plan builds the UI and wires what the existing tokens allow; the rest stays honestly empty until those sources are connected.
