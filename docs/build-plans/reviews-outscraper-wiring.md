# Reviews page: real Google reviews via Outscraper (read) + deep-link reply

Combined spec + implementation plan. Wires the client Reviews page end to end on
real Google review data for a location-less service-area business, without the
Google Business Profile (GBP) API.

## Frame (what / why / done)

**What.** Make the client Reviews page production-real for Willis Windows LLC:
the rating hero, All Reviews queue, and Insights trend all run on Willis's real
Google reviews (full history), and any review with no owner reply surfaces in a
"Needs reply" view with a button that deep-links to Google so Willis replies
manually.

**Why.** Willis is a service-area business with a hidden address and no map pin.
The Google Places API cannot find them by search, and the CID/place-details path
returns nothing usable (retired CID endpoint). The GBP API v4 is the only
official reply-capable path but has NOT been applied for and is deprioritized.
Outscraper reads the full review history via the CID we already resolved, with no
approval gate. Verified by the deep-research run (`whgm4exka`).

**Known identifiers (Willis Windows LLC).**
- CID (decimal): `1368936548853897480`
- Feature ID: `0x68ecf23f1419c605:0x12ff7089ca7c5908`
- Knowledge Graph MID: `/g/11z8bsnmpz`
- Outscraper accepts any of these as its `query`. We store the CID.

**Definition of done.**
1. Overview hero shows Willis's real Google average + total review count.
2. All Reviews shows the full real review list, filterable (All / 5 / 4 / 1-3 /
   Needs reply). "Needs reply" = reviews with no owner response.
3. Each needs-reply review has a "Reply on Google" button that opens Google's
   owner review management in a new tab.
4. Insights shows a real rating-over-time trend and real headline stats.
5. Golden rule intact: a real client only ever sees real data. No CID / no key /
   no scraped data => honest not-connected state, never fabricated or zeroed
   numbers presented as real. Demo (`?demo=1`) unchanged.
6. No GBP API dependency anywhere. Replies are manual via deep-link.

**Out of scope (Phase 2, noted at end).** Programmatic reply posting, AI
suggested replies, scheduled auto-refresh, GBP API application.

## Reality check (current state)

| Surface | File | Element | State |
|---|---|---|---|
| Overview | `ReviewsOverview.tsx` | Rating hero + recent | REAL via Places (`/api/reviews/summary`), but Places can't resolve Willis => always not-connected |
| Overview | `ReviewsOverview.tsx` | Request → review funnel | REAL (GHL, `/api/reviews/funnel.ts`) — keep as-is |
| Overview | `ReviewsOverview.tsx` | Ready-to-ask, stat chips | DEMO only |
| All Reviews | `ReviewsAll.tsx` | Review queue + AI reply drawer | DEMO only; real session = `ReviewsComingSoon` |
| Insights | `ReviewsInsights.tsx` | Trend, stats, sources | DEMO only; real session = `ReviewsComingSoon` |
| Requests | `ReviewsRequests.tsx` | Ask flow | REAL — unaffected |

## Architecture decisions

1. **Reads never hit Outscraper.** Outscraper is paid-per-call, async, and a ToS
   gray-area scrape with occasional null/missing rows. So: scrape on a **refresh**
   into Supabase, and every page read serves from Supabase (fast, free, stable).
2. **One refresh path.** A `POST /api/reviews/refresh` calls Outscraper, upserts
   the store. v1: triggered manually (admin button) and lazily on first load if
   the store is empty. Phase 2: scheduled daily (trigger.dev / cron).
3. **Tenant reference column.** Add `tenants.google_reviews_ref` holding the CID/
   place-id/feature-id passed to Outscraper. Mirrors the existing
   `google_place_id` + `GOOGLE_PLACE_ID` env-fallback pattern. Willis =
   `1368936548853897480`. Single-tenant env fallback `OUTSCRAPER_PLACE_REF`.
4. **Secret.** `OUTSCRAPER_API_KEY` in Doppler (`hauck-command-center`/`prd`),
   pushed to CF via `cf-rebind --from-doppler`.
5. **Not-connected contract.** No `google_reviews_ref` (and no env fallback), or
   no `OUTSCRAPER_API_KEY`, or empty store => `{ configError: "not_connected" }`.
   Every surface shows its not-connected / coming-soon state, never zeros as real.
6. **Reply deep-link.** Google exposes no stable per-review reply URL for owners.
   The button opens the owner review manager: `https://business.google.com/reviews`
   (new tab). Copy sets the expectation ("opens your Google reviews to reply").
   Replies posted on Google flow back into the app on the next refresh (the
   review's `owner_answer` populates and it leaves "Needs reply").

## Data model

**Migration `0027_google_reviews.sql`:**
- `alter table tenants add column google_reviews_ref text;`
- `create table google_reviews (`
  - `tenant_slug text not null,`
  - `review_id text not null,`      -- Outscraper's stable review id
  - `author_name text,`
  - `rating int not null,`
  - `body text,`
  - `review_at timestamptz,`        -- review_datetime_utc
  - `relative_when text,`           -- Google's "2 weeks ago" label
  - `owner_answer text,`            -- null => needs reply
  - `owner_answer_at timestamptz,`
  - `raw jsonb,`
  - `fetched_at timestamptz not null default now(),`
  - `primary key (tenant_slug, review_id)`
  - `);`
- index on `(tenant_slug, review_at desc)`.
- Seed Willis ref: `update tenants set google_reviews_ref = '1368936548853897480' where slug = 'willis-windows';`
  (or set via admin field, see step 8).

## File-by-file plan

### Backend

1. **`functions/lib/env.ts`**
   - Add to `Env`: `OUTSCRAPER_API_KEY?: string;` `OUTSCRAPER_PLACE_REF?: string;`
   - Add to tenant type: `google_reviews_ref?: string;` (with the same fallback
     comment style as `google_place_id`).

2. **`functions/lib/outscraper.ts`** (new)
   - `fetchGoogleReviews(ref, key, opts)`: submit the Outscraper reviews request
     (`GET https://api.app.outscraper.com/maps/reviews-v2?query=<ref>&reviewsLimit=<n>&async=false`
     for small pulls; async submit + poll for large history), return normalized
     rows. Handle the async results-location flow and a bounded poll.
   - `shapeReview(raw)`: normalize one Outscraper review → store row shape
     (author, rating, body, review_at, relative_when, owner_answer,
     owner_answer_at). Pure + unit-testable.

3. **`functions/lib/reviewsStore.ts`** (new, or inline in endpoints)
   - `readReviews(supabase, slug)` → rows ordered newest-first.
   - `upsertReviews(supabase, slug, rows)` → bulk upsert on `(tenant_slug, review_id)`.
   - `deriveSummary(rows)` → `{ average, total, recent[] }`.
   - `deriveTrend(rows)` → monthly average for the trend chart.
   - `needsReply(row)` => `!row.owner_answer`.

4. **`functions/api/reviews/summary.ts`** (rework)
   - Drop the Places call. Read from the store via `reviewsStore`. Keep the exact
     `ReviewSummaryData` shape (average, total, recent, configError) so the
     Overview hero + `RealRecentReviews` keep working unchanged.
   - not-connected when unconfigured or store empty.

5. **`functions/api/reviews/all.ts`** (new)
   - `GET` → `{ average, total, reviews[], needsReplyCount, trend[], configError? }`.
   - `reviews[]`: `{ id, author, initials, rating, body, when, ownerAnswer, needsReply }`.
   - Serves All Reviews queue + Insights from one payload.

6. **`functions/api/reviews/refresh.ts`** (new)
   - `POST`, admin/internal auth only. Resolves the tenant `google_reviews_ref`
     (env fallback), calls `fetchGoogleReviews`, upserts the store, returns
     `{ upserted, total }`. Never called from the client read path.

7. **Tests**
   - `functions/lib/outscraper.test.ts`: `shapeReview` normalization (incl. a
     review with an existing owner_answer, and a missing-fields row).
   - `functions/api/reviews/all.test.ts`: `deriveSummary` / `deriveTrend` /
     needs-reply split; not-connected path. Mirror `summary.test.ts`.

### Frontend

8. **`src/lib/reviewsAll.ts`** (new)
   - `ReviewItem` + `ReviewsAllData` types (mirror `all.ts`).
   - `DEMO_REVIEWS_ALL` (reuse the existing `SAMPLE_REVIEWS` shape).
   - `ownerReplyUrl()` → `https://business.google.com/reviews`.

9. **`src/hooks/useReviewsAll.ts`** (new) → `GET /api/reviews/all`, 15-min stale.

10. **`src/demo/handlers/reviewsAll.ts`** (new) → serve `DEMO_REVIEWS_ALL`
    (match `/api/reviews/all`), mirroring `reviewsSummary.ts`.

11. **`src/routes/reviews/ReviewsAll.tsx`** (rework real path)
    - Real session: `useReviewsAll()` instead of `ReviewsComingSoon`.
    - Render the existing `ReviewRow` list from real data.
    - Replace the AI suggested-reply drawer (real session) with a **"Reply on
      Google"** anchor: `<a href={ownerReplyUrl()} target="_blank" rel="noopener">`.
      Keep the "Replied" badge for reviews that already have `ownerAnswer` (show
      the owner's posted reply read-only).
    - Segmented filters driven by real counts; "Needs reply" = `needsReply`.
    - Demo path unchanged.

12. **`src/routes/reviews/ReviewsInsights.tsx`** (rework real path)
    - Real session: build the trend + stats from `useReviewsAll()` (`trend[]`,
      average, total, new-this-month, reply rate = replied / total) instead of
      `ReviewsComingSoon`. Demo unchanged.

13. **`src/routes/reviews/ReviewsOverview.tsx`** (light touch)
    - Hero + `RealRecentReviews` already consume `ReviewSummaryData`; now real via
      the repointed summary endpoint. No structural change.
    - Update the GBP-pending copy ("reading each review... lands once your Google
      Business Profile is connected") since replies now deep-link to Google today.
    - Keep the real GHL funnel exactly as-is.

14. **`src/routes/reviews/shared.tsx`** — no change required;
    `ReviewsComingSoon` stays as the not-connected fallback.

### Admin / infra

15. **Admin tenant config** — add a `google_reviews_ref` field + a "Refresh
    reviews" button (calls `/api/reviews/refresh`), alongside the existing
    `meta_ad_account_id` / `ga4_property_id` editors. (v1 can set the ref via the
    migration seed and trigger refresh manually; the admin field is the clean
    finish.)

16. **Doppler / CF** — add `OUTSCRAPER_API_KEY`; `cf-rebind --from-doppler`.

## Gaps this closes

- All Reviews: demo-only → real full history.
- Insights: demo-only → real trend + stats.
- Overview hero: Places (dead for SAB) → real Outscraper store.
- Reply: no path → manual deep-link, with replies flowing back on refresh.

## Verify

- **Local:** unit tests (outscraper shaping, all-endpoint derivations,
  not-connected).
- **Live (Jake's authed browser):** Overview hero shows Willis's real rating +
  count; All Reviews lists the full history; "Needs reply" filters correctly;
  "Reply on Google" opens `business.google.com/reviews`; Insights trend renders.

## Ship

Standard autopilot once Jake verifies: commit, push origin main, watch CF deploy
(`hauck-dashboard`), grep the live JS bundle to confirm the new build serves.
Apply migration `0027` via `pnpm db:migrate` before/at ship, or the store reads
500.

## Open decisions for Jake

1. **Refresh cadence (v1):** manual admin button + lazy-seed on empty store
   (recommended), vs. wait and do scheduled cron now. Recommend manual for v1.
2. **AI suggested replies:** drop for v1 (no programmatic post anyway; deep-link
   only), add later via the copywriter voice. Confirm OK to drop.
3. **Reference column:** new `tenants.google_reviews_ref` (recommended) vs. reuse
   `google_place_id`. Recommend new column (semantically a different id).

## Phasing

- **Phase 1 (this plan):** schema + Outscraper client + store + refresh +
  repointed summary + `/all` endpoint + Overview/All/Insights wired + manual
  refresh. Manual reply via deep-link.
- **Phase 2 (later):** scheduled refresh (trigger.dev), AI suggested replies,
  admin ref editor polish, and — only if ever wanted — GBP API v4 for in-app
  reply posting.

## Risks / caveats

- Outscraper is a ToS gray-area scrape; occasional null/missing rows. Mitigate:
  keep last-good store, refresh retries, never wipe on a bad pull.
- No stable per-review owner reply deep-link; button opens the reviews list.
- Trend accuracy depends on Outscraper's `review_datetime_utc`.
- Cost is per-refresh only (reads are free from Supabase).

## Jake's action items

1. Create an **Outscraper account**, get the API key, add `OUTSCRAPER_API_KEY` to
   Doppler (`hauck-command-center`/`prd`). Tell me the key name only, not the value.
2. Answer the 3 open decisions above (refresh cadence, drop AI replies, new column).
3. That's it for build inputs — the CID is already resolved.
