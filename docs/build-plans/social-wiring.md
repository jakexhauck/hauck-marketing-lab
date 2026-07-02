# Social wiring: client Social section to real GHL Social Planner

Combined spec + plan. PLAN ONLY. No app code changes until this is approved and Task 0 passes.

Scope: wire the client app's Social section (Overview, Ideas, Calendar, My Posts, What's working) to real GoHighLevel Social Planner data. Facebook, Instagram, and Google Business are already connected for the client, so accounts exist in the sub-account. Today every Social surface shows hand-authored demo content in preview and a zeroed "Not connected yet" state in a real session. This replaces the real-session empty states with real posts, accounts, and (where the API allows) analytics.

AI generation (captions, ideas, "Plan my month", Rewrite) is explicitly OUT of scope for this build. Those stay gated. This is the read + schedule data layer only. See `docs/connections/social.md` for the full backlog including the AI half.

## 1. Goal + Definition of Done

Goal: a real (connected) client sees their actual connected accounts, their real scheduled and published posts, a real posting calendar, and can create/schedule a real post from the composer. No fabricated posts ever appear in a real session.

Done when:
- Overview: KPIs, "Up next", and "Recently posted" come from real GHL posts for a live session (zeroed honest empty state if the client genuinely has none, never demo rows).
- My Posts: Scheduled / Drafts / Posted tabs list real posts by status; counts are real.
- Calendar: month grid renders real scheduled + published posts on their dates.
- Composer: platform toggles reflect the client's actually-connected accounts; "Schedule" / "Save draft" create a real GHL post; success refetches the lists. Terminal actions are gated + demo-aware (demo still just toasts, never calls GHL).
- What's working (Insights): shows real analytics IF Task 0 confirms an analytics endpoint exists; otherwise this surface keeps its honest empty state and is explicitly deferred (documented, not faked).
- Demo/preview (`?demo=1`) is unchanged: same sample data, all writes are in-memory toasts.
- The wiring contract holds: real -> `api('/api/social/...')` -> Pages Function -> GHL; demo -> `handleDemoRequest()`.
- A real session with zero posts shows the empty state, not an error and not demo content.

Non-goals: AI caption/idea generation, photo/media upload pipeline, per-account OAuth connect flow (accounts already connected), the "Plan my month" batch generator, the "voice onboarding" screen.

## 2. Sub-pages and what each needs

Routes (from `src/lib/pageTabs.ts` SOCIAL_TABS, mounted in `App.tsx`):

- Overview `/marketing/social` (`SocialOverview.tsx`)
  - KPIs: posts this month, scheduled count, people reached (only if analytics exists, else drop or show "-"), calls/messages (attribution, likely deferred with Insights).
  - "Up next": next N scheduled posts (soonest schedule date first).
  - "Recently posted": last N published posts.
- Ideas `/marketing/social/ideas` (`SocialIdeas.tsx`)
  - AI-driven. OUT of scope. Leave demo + not-connected empty state as-is. No endpoint work here.
- Calendar `/marketing/social/calendar` (`SocialCalendar.tsx`)
  - Real month grid: scheduled + published posts placed on their dates, colored by platform. Needs a date-ranged post list for the visible month.
- My Posts `/marketing/social/posts` (`SocialPosts.tsx`)
  - Three status buckets: Scheduled, Drafts, Posted. Each lists real posts with platform glyph, title/summary, schedule-or-posted time, status badge. Delete row -> real DELETE (gated).
- What's working `/marketing/social/insights` (`SocialInsights.tsx`)
  - Real reach/engagement per post + rollups. GATED ON TASK 0: GHL Social Planner has no reliably documented public analytics endpoint. If Task 0 finds none, this page stays on its honest empty state and is marked deferred in `docs/connections/social.md`. Do not synthesize numbers.

Shared: `src/routes/social/shared.tsx` (`NotConnectedNotice`, `PlatformGlyph`, `Platform` = "ig" | "fb" | "gb"). The composer `src/components/social/SocialComposerDialog.tsx` is the write surface (Save draft / Schedule buttons, currently `disabled={!demo}` and toast-only).

## 3. GHL Social Planner endpoints (Pages Functions to build under functions/api/social/*)

Base: `https://services.leadconnectorhq.com`, called via `ghlFetch` / `ghlJson` in `functions/lib/ghl.ts` (adds `Authorization: Bearer {ctx.data.tenant.ghl_token}` and `Version: 2021-07-28`). Location id = `ctx.data.tenant.ghl_location_id`.

EVERY endpoint below is a SPIKE. The exact paths, request/response shapes, required OAuth scopes, and the Version header value must be confirmed against the live tenant token in Task 0 before any handler is written. GHL's Social Media Posting API family is the target; the shapes below are the best-known guesses and MUST NOT be trusted until probed.

Candidate GHL endpoints (verify each):

- List connected accounts (SPIKE): `GET /social-media-posting/{locationId}/accounts`
  - Expected: connected account + group records with platform, name, id, avatar. Maps GHL platform names (facebook, instagram, google/gmb) onto our `Platform` = fb | ig | gb.
- List / search posts (SPIKE): `POST /social-media-posting/{locationId}/posts/list`
  - Expected body: filters like `{ type, accounts, fromDate, toDate, skip, limit }`. Returns posts with id, summary/caption, status (scheduled/published/draft/failed), scheduleDate/publishedDate, accountIds, media. This one endpoint powers My Posts, Calendar, and Overview.
  - VERIFY: whether status filtering is server-side or we filter client-side; whether it is `posts/list` (POST) or a `GET /posts` with query params. Confirm date-range params for the calendar month window.
- Get single post (SPIKE, optional): `GET /social-media-posting/{locationId}/posts/{postId}`.
- Create / schedule / publish a post (SPIKE): `POST /social-media-posting/{locationId}/posts`
  - Expected body: `{ accountIds: string[], summary: string, scheduleDate?: ISO, status: "scheduled"|"draft"|"published", type, media?: [] }`. Draft = no scheduleDate; Schedule = future scheduleDate; Post now = immediate/published.
  - VERIFY: exact status enum, whether media is required, timezone handling for scheduleDate, and which account-id shape it wants (per-account ids from the accounts endpoint).
- Edit post (SPIKE, optional for v1): `PUT /social-media-posting/{locationId}/posts/{postId}`.
- Delete post (SPIKE): `DELETE /social-media-posting/{locationId}/posts/{postId}` (powers the My Posts trash action).
- Post analytics / insights (SPIKE, HIGH RISK): no well-documented public GHL analytics endpoint is known. Task 0 must determine if one exists (e.g. an insights/statistics path) OR if reach/engagement is simply absent from the API. If absent, Insights is deferred and Overview drops the reach/calls KPIs rather than faking them.

OAuth scopes to confirm the tenant token carries (SPIKE): `social-media-posting.readonly` and `social-media-posting.write`. If the current Willis token lacks them, listing/creating posts will 401/403 and the token scope must be widened before this build proceeds.

## 4. File-by-file steps

Do NOT start until Task 0 (section 6) passes and the real shapes are recorded here.

### Backend (Pages Functions)

1. `functions/lib/social.ts` (new): typed helpers + shared types, mirroring how `functions/lib/ghl.ts` shapes leads.
   - `SocialAccount` (id, platform: "fb"|"ig"|"gb", name, avatar), `SocialPost` (id, summary, status, scheduleAt, publishedAt, platforms, mediaUrls, analytics?).
   - `fetchSocialAccounts(gctx)`, `fetchSocialPosts(gctx, { from?, to?, status? })`, `createSocialPost(gctx, input)`, `deleteSocialPost(gctx, id)`. Each wraps `ghlJson`. A platform-name normalizer maps GHL platform strings to our fb/ig/gb union and drops any platform we do not render.
   - Confirm-first: fill these bodies with the shapes proven in Task 0.
2. `functions/api/social/accounts.ts` (new): `onRequestGet` -> `fetchSocialAccounts`. Returns `{ accounts, connected: boolean }`. `connected` = at least one fb/ig/gb account, so the frontend can decide empty-vs-populated without guessing.
3. `functions/api/social/posts/index.ts` (new):
   - `onRequestGet`: query params `status`, `from`, `to`; returns `{ posts, total }`. Powers My Posts, Calendar, Overview (all read the same endpoint with different params).
   - `onRequestPost`: create/schedule/publish. Body `{ platforms, summary, scheduleAt?, status }`. Maps our fb/ig/gb + selected accounts to GHL account ids, calls `createSocialPost`. Returns `{ post }`. This is a terminal write: no retry (ghlFetch already refuses to retry POST).
4. `functions/api/social/posts/[postId].ts` (new): `onRequestDelete` -> `deleteSocialPost`. (Add `onRequestPut` for edit only if v1 needs it; otherwise skip.)
5. Insights endpoint `functions/api/social/insights.ts` (new) ONLY IF Task 0 proves an analytics source. Otherwise do not create it; Insights stays deferred.

All routes read `ctx.data.tenant` (set by `functions/api/_middleware.ts`); no new auth. No new env vars for this build (token + location already injected). Confirm scope in Task 0.

### Frontend (lib + hooks + routes)

6. `src/lib/social.ts` (new): client-side `SocialAccount` / `SocialPost` types matching the API, plus small pure mappers (post -> Up-next row, post -> My-Posts row, posts -> calendar cells keyed by day, posts -> KPI counts). Keep the demo constants where they are; these mappers run on real data only.
7. `src/hooks/useSocial.ts` (new): react-query hooks, each demo-aware via `api()` (which already routes to `handleDemoRequest` when `demoMode()` is on):
   - `useSocialAccounts()` -> `GET /api/social/accounts`.
   - `useSocialPosts({ status?, from?, to? })` -> `GET /api/social/posts`.
   - `useCreatePost()` mutation -> `POST /api/social/posts`; on success invalidates the posts queries.
   - `useDeletePost()` mutation -> `DELETE /api/social/posts/:id`.
8. `src/routes/social/SocialOverview.tsx`: in a real session, replace `EMPTY_KPIS` / demo `UP_NEXT` / `RECENT` usage with hook data. Keep `demo` branch exactly as-is. Real session with zero posts keeps `NotConnectedNotice` wording softened to "connected, nothing scheduled yet" once accounts are confirmed connected (accounts endpoint says connected=true but posts empty), so the banner is honest instead of saying "not connected" when they are.
9. `src/routes/social/SocialPosts.tsx`: real session reads `useSocialPosts` per status tab instead of the empty `rows = []`. Wire `removePost` to `useDeletePost` (gated: only fire the real DELETE in a live session; demo keeps the in-memory filter + toast).
10. `src/routes/social/SocialCalendar.tsx`: real session builds `CELLS` from `useSocialPosts({ from, to })` for the visible month instead of the hard-coded June fixture. Keep demo fixture for preview.
11. `src/components/social/SocialComposerDialog.tsx`: platform toggles seed from `useSocialAccounts` (only show/enable fb/ig/gb that are connected). "Save draft" -> `useCreatePost({ status: "draft" })`; "Schedule" -> `useCreatePost({ status: "scheduled", scheduleAt })`. GATING: keep the demo path (toast only) unchanged; in a live session the buttons enable only when at least one connected platform is selected and (for Schedule) a datetime is set. On success: toast, close, invalidate lists. Media upload stays out of scope (button stays a "arrives with the backend" toast).
12. `src/routes/social/SocialInsights.tsx`: only touch if Task 0 unlocked analytics. Otherwise leave as-is (demo populated, real session honest empty) and note deferral.

### Demo handler

13. `src/demo/handler.ts`: add cases so demo never falls through to a 404 once the frontend starts calling the new paths:
    - `GET /api/social/accounts` -> `{ accounts: [ig, fb, gb sample], connected: true }`.
    - `GET /api/social/posts` (respect `status` query param) -> the existing hand-authored sample posts (reuse the arrays currently living in the route files; consider centralizing them into `src/lib/socialDemo.ts` so both the routes' demo branch and the handler share one source).
    - `POST /api/social/posts` -> `{ post: {...} }` echo, no store mutation needed (or push into a small in-memory list for the tab's lifetime, matching the reviews pattern).
    - `DELETE /api/social/posts/:id` -> `{ ok: true }`.
    Keep the demo route branches rendering their own constants; the handler cases exist so any hook that runs in demo resolves cleanly.

### Per-action gating summary

- Read (accounts/posts lists): safe, always on; empty state when connected-but-empty.
- Create/schedule/delete: terminal. Live session only calls GHL; demo session only toasts/mutates memory. Buttons disabled until inputs valid. No POST retries.
- AI actions (Write it, Rewrite, New idea, Plan my month): remain gated/disabled. Not in this build.

## 5. Verification

- Task 0 evidence first (section 6): raw curl/Node responses for accounts + posts list pasted into this doc before any handler ships.
- Typecheck + build: `npm run build` in `command-center/app` clean.
- Demo unaffected: open each Social tab with `?demo=1`, confirm identical sample content and that Save/Schedule still just toast.
- Live read: with an authed Willis (live-mode) session, hit `/api/social/accounts` and `/api/social/posts` and confirm real JSON (not 401/403/empty). Since the client has real connected accounts, expect real accounts back; posts may or may not exist.
- Live surfaces: Overview / My Posts / Calendar show real posts (or an honest connected-but-empty state), never demo rows.
- Live write (guarded): create one draft via the composer against the test sub-account first, confirm it appears in GHL's Social Planner, then delete it. Do not test-post to Willis's real public accounts without Jake's go.
- Insights: either shows real analytics (if unlocked) or the honest empty state; never fabricated numbers.
- Note: all `/api/*` return 401 unauthenticated, so live-data checks require a real browser session (same caveat as the sales-endpoints wiring).

## 6. Task 0 spike (do this FIRST, before any build)

Confirm the GHL Social Planner API works with the Willis (and test) tenant token before writing a single handler. Use the `ghl` CLI (`gohighlevel-cli/`, run via `ghl.ps1` with `PYTHONUTF8=1`; PIT is Willis-scoped) or a throwaway Node fetch with the tenant token + `Version: 2021-07-28`.

Verify, and record the real shapes in section 3 of this doc:
1. Does the tenant token carry `social-media-posting.readonly` / `.write` scope? (A 401/403 means scope must be widened before proceeding: hard blocker, escalate to Jake.)
2. List connected accounts: confirm the real path, that fb/ig/gb come back, and their id + platform-name shape.
3. List posts: confirm the real path (POST posts/list vs GET posts), the status enum values GHL uses, the schedule/published date fields, and the date-range params for the calendar.
4. Create a post: against the TEST sub-account only, confirm the create body shape (accountIds, summary, scheduleDate, status) by scheduling then deleting a throwaway draft.
5. Analytics: determine whether ANY per-post reach/engagement endpoint exists. If not, mark Insights deferred here and drop the analytics-derived KPIs from Overview.

Only after 1-4 pass (and 5 is answered either way) do we build. If scope is missing (step 1), stop and get the token widened first.
