# 05 Social Media

Routes: `command-center/app/src/routes/social/` — `SocialOverview`, `SocialIdeas`, `SocialCalendar`, `SocialPosts`, `SocialInsights`, `shared.tsx`.
Components (UI done, backend gated): `SocialComposerDialog`, `PlanMonthDialog`, `NewIdeaDialog`.

**Area status:** 5 pages, all fully designed, all demo-only. **Largest backend lift of the five areas.** No `/api/social/*` endpoints, no social Supabase tables, no GHL Social Planner wiring, no Claude wiring, no account-link flow. The composer/plan/idea dialogs are fully built but their Save/Schedule/Generate actions are disabled outside demo. Do this area last.

**Area-wide dependencies:** F1 + F3 (GHL Social Planner client), F2 (Meta insights for engagement), Claude (ideas + insight text), Supabase `posts` + `post_ideas` + `post_engagement`, a GHL account-link flow.

**Platforms:** Instagram, Facebook, Google Business Profile (`ig | fb | gb` in `shared.tsx`).

**Prerequisite that gates everything:** the "Connect accounts" flow. `NotConnectedNotice` currently says "coming soon" with no auth flow, no callback, no token storage. Until accounts connect, nothing publishes. Build this first within the area.

---

## Page: Overview (`/marketing/social`)

**Current:** designed; demo shows KPI cards (posts this month, calls & messages, people reached, scheduled), "up next", "recently posted" with engagement, "ideas for you", an upsell banner. Real session zeroed.

**Information needed:** posts published this month, engagement (calls/messages, reach), scheduled count, next scheduled posts, recent posts with engagement, idea suggestions.

**Connections:** Supabase `posts` (counts, schedule), GHL Social Planner (publish state), Meta insights via F2 (reach/engagement), Claude (ideas).

**APIs / endpoints:** `GET /api/social/overview` aggregating the above.

**Backend:** `functions/api/social/overview.ts`; `posts` + `post_engagement` tables.

**Open questions:** "calls & messages" attributed to a post is an attribution problem (F4-style) and may not be reliably linkable. Decide whether to show reach (reliable from Meta) only, and defer call attribution.

---

## Page: Ideas (`/marketing/social/ideas`)

**Current:** designed; demo shows 6 idea cards (category, title, why, platforms, "Write it" → composer). `NewIdeaDialog` UI is complete but actions disabled. Real session "ideas are on the way".

**Information needed:** generated, contextual post ideas — each with kind, title, rationale, target platforms, optional suggested time.

**Connections:** Claude API (generation) fed by GHL data (recent completed jobs, recent 5-star reviews) and insights (top post types); Supabase `post_ideas` (persistence).

**APIs / endpoints:** `POST /api/social/ideas/generate` (calls Claude, stores ideas), `GET /api/social/ideas` (list unused).

**Backend:** `functions/api/social/ideas/`; `post_ideas` table (`tenant_id`, `kind`, `title`, `why`, `platforms`, `used`, `created_at`).

**Open questions:** Claude prompt design and what client context to feed it. Reuses the existing Claude wiring in the app. Good first page once accounts connect, since it does not require publishing.

---

## Page: Calendar (`/marketing/social/calendar`)

**Current:** designed; demo shows a fixed June-2026 month grid with 7 sample events, click-to-add and click-to-edit, non-functional month nav. Real session empty.

**Information needed:** scheduled posts keyed by date + platform, for a navigable month.

**Connections:** Supabase `posts` (scheduled), GHL Social Planner (the schedule of record).

**APIs / endpoints:** `GET /api/social/calendar?month=YYYY-MM`, `POST /api/social/posts/schedule` (save + push to GHL Social Planner).

**Backend:** `functions/api/social/calendar.ts`; shared `posts` table. Add real month state + prev/next navigation in the UI (currently visual only) and a locale-driven month label.

**Open questions:** GHL Social Planner is the publishing system of record; decide whether Supabase mirrors it or GHL is queried live. Recommend mirror in `posts`, push to GHL on schedule.

---

## Page: My Posts (`/marketing/social/posts`)

**Current:** designed; demo shows Scheduled/Drafts/Posted tabs with post rows, edit (composer) and delete (local state only). Real session empty.

**Information needed:** all posts by status with title, content, platforms, schedule/posted time, and engagement for posted items.

**Connections:** Supabase `posts` + `post_engagement`; GHL Social Planner (publish/schedule/delete); Meta insights (engagement for posted).

**APIs / endpoints:**
- `GET /api/social/posts?status=...`, `POST /api/social/posts` (create draft), `PUT /api/social/posts/:id` (edit), `DELETE /api/social/posts/:id` (remove from Supabase + GHL), `POST /api/social/posts/:id/publish`, `POST /api/social/posts/:id/schedule`.

**Backend:** `functions/api/social/posts/`; `posts` + `post_engagement` tables. Enable the composer Save/Schedule actions; wire photo upload (currently stubbed — needs Drive or storage) and AI rewrite (currently stubbed — Claude).

**Open questions:** image hosting for post media (Drive vs Supabase storage). Engagement refresh cadence (on load vs background job).

---

## Page: What's working (`/marketing/social/insights`)

**Current:** designed; demo shows a plain-English summary, 4 stat cards (published, calls & messages, reach, best time), a "calls by post type" bar chart, top posts list.

**Information needed:** posts published, engagement totals, best posting time, calls/engagement grouped by post type, top posts.

**Connections:** `posts` + `post_engagement` (aggregation), Meta insights (reach), Claude (the summary line). "By post type" needs each post linked to its idea's `kind` (`posts.idea_id` → `post_ideas.kind`).

**APIs / endpoints:** `GET /api/social/insights/summary`, `GET /api/social/insights/posts`, `GET /api/social/insights/by-type`.

**Backend:** `functions/api/social/insights/`; aggregation over `post_engagement`, kept fresh by a webhook or scheduled fetch from GHL + Meta.

**Open questions:** "calls by post type" is the hardest claim (links a phone call to a specific post). Lead with reach + engagement (reliable) and treat call-by-type as best-effort. Same honesty caveat as Overview.

---

## Area build order

1. **Connect-accounts flow** (gates everything). 2. `posts` table + composer CRUD → **My Posts** + **Calendar** (draft/schedule, push to GHL Social Planner). 3. Claude → **Ideas**. 4. Meta insights + `post_engagement` → **Overview**. 5. **Insights** last (needs engagement history + post-type linkage).
