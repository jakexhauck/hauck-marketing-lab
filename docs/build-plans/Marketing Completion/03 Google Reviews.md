# 03 Google Reviews

Routes: `command-center/app/src/routes/reviews/` — `ReviewsOverview`, `ReviewsRequests`, `ReviewsAll`, `ReviewsInsights`, `shared.tsx`.
Backend already present: `functions/api/reviews/index.ts`.

**Area status:** 4 pages. **Ask for Reviews is LIVE** on a real GHL endpoint. The other three are demo-only and need a Google review feed.

**Area-wide dependencies:** F5 (Google Business Profile API, or GHL reputation as the alternative), F1 (`google_business_location_id`), Supabase `google_reviews` + `review_replies`.

**Key decision (make once, affects three pages):** pull reviews **direct from Google Business Profile** (full control, more OAuth work) vs **via GHL's reputation module** (GHL already aggregates Google reviews and sends review-request SMS/email; less work, less control). Recommend GHL reputation if it exposes the read API, since the request side already runs through GHL.

---

## Page: Ask for Reviews (`/marketing/reviews/requests`) — LIVE

**Current:** working in real sessions. `GET /api/reviews` lists completed-job contacts from the GHL Sales pipeline "Job Completed" stage and flags whether the `request review` tag is set. `POST /api/reviews` adds the tag and enrolls the contact in the GHL "Ongoing Review Campaign" workflow. Hook: `useReviewsQuery` / `useStartReviewCampaign`.

**Information needed:** already satisfied.

**Gap to fully done (enhancements, not blockers):**
- Track conversion: of asks sent, how many became reviews (needs the review feed from F5 to close the loop).
- Reflect real campaign status from a GHL workflow-completion webhook instead of just the tag presence.

**Open questions:** none blocking. This page works today.

---

## Page: Overview (`/marketing/reviews`)

**Current:** designed; demo shows average rating, review count, 4 stat chips (total, new this month, requests sent, reply rate), "ready to ask" panel, "recent reviews" panel. Real session zeroed + `NotConnectedNotice`.

**Information needed:** average rating, total reviews, new-this-month, requests sent (already have from the live endpoint), reply rate, latest reviews, completed jobs with no review yet.

**Connections:** F5 (Google reviews feed for rating/count/recent), existing `/api/reviews` (requests sent + ready-to-ask).

**APIs / endpoints:** `GET /api/reviews/stats` (aggregate rating + counts from cached `google_reviews`); reuse `/api/reviews` for the ready-to-ask list.

**Backend:** `functions/api/reviews/stats.ts`; `google_reviews` table + a sync (poll or webhook) from F5.

**Open questions:** "reply rate" needs reply data (see All Reviews). Hide that chip until replies are tracked.

---

## Page: All Reviews (`/marketing/reviews/all`)

**Current:** designed; demo shows a list of reviews with rating/date/body, a reply drawer with an AI-suggested reply, filter bar, and an optimistic (local-only) post-reply. Real session empty.

**Information needed:** full review list (id, author, rating, text, date), reply status + text, AI-suggested reply.

**Connections:** F5 read (list reviews) + F5 write (post reply); optional Claude for suggested replies.

**APIs / endpoints:**
- `GET /api/reviews/all` (cached list from `google_reviews`).
- `POST /api/reviews/:id/reply` (post to Google/GHL, store in `review_replies`). Currently the reply is local-only and never persists.

**Backend:** `functions/api/reviews/all.ts` + reply handler; `google_reviews` + `review_replies` tables; sync webhook for new reviews.

**Open questions:** suggested replies are hardcoded in demo. Decide Claude-generated vs a template library. Claude is the better experience and reuses the existing Claude wiring.

---

## Page: What's working (`/marketing/reviews/insights`)

**Current:** designed; explicitly marked Phase 2. Demo shows rating trend (6 months), ask-to-review conversion, reply rate, new-this-month, "where reviews start" source split, month-at-a-glance table.

**Information needed:** monthly average rating, conversion (reviews / asks), reply rate, source attribution of each review (which ask channel produced it).

**Connections:** `google_reviews` + `review_replies` (trend, reply rate) + the existing request data (conversion denominator) + source tagging.

**APIs / endpoints:** `GET /api/reviews/insights`.

**Backend:** `functions/api/reviews/insights.ts`; aggregation over the cached tables. Needs an event log linking an ask (sent) to the review it produced, for conversion % and source split.

**Open questions:** attributing a review back to the specific ask channel (SMS vs email vs walk-in) needs a recorded link at ask time. Without it, show rating trend + reply rate and defer the source/conversion charts.

---

## Area build order

1. Decide F5-direct vs GHL-reputation. 2. `google_reviews` table + sync → **Overview** + **All Reviews** (read). 3. `review_replies` + reply write → All Reviews reply, Overview reply-rate. 4. **Insights** (last; needs ask-to-review linkage). Ask for Reviews needs no work to function; only the conversion-tracking enhancement once the feed exists.
