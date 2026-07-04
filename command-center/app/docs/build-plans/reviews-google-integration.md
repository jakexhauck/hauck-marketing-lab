# Reviews page: finishing the Google integration (spec + plan)

Status: IN PROGRESS. Google Business Profile API access request SUBMITTED 2026-07-03,
awaiting approval (0 -> 300 QPM). Places interim built but dead for Willis (see
below). Owner: Jake + builder.

## Goal / definition of done

The client Google Reviews page shows a real star rating, every review, a working
reply box, and real trends for a connected client, in a fully white-labeled UI
(Google's data, never GHL/vendor branding). "Done" = Overview hero, All Reviews
(with reply), and What's working all read/write live Google data in a real
session, with honest not-connected states until a client's Google profile is
connected.

## Where we are now

**Live already (do not rebuild):**
- Overview funnel (asked -> clicked -> left a review -> caught privately): GHL
  review pipeline, `functions/api/reviews/funnel.ts`.
- Ask for Reviews tab: completed-jobs list + start-campaign tag,
  `functions/api/reviews/index.ts`.

**Built but NOT the path (Places interim, uncommitted in working tree):**
- Migration `0023` (`tenants.google_place_id`), `functions/api/reviews/summary.ts`,
  `useReviewsSummary`, the Overview rating hero + recent-reviews wiring, an admin
  "Reviews (Google)" place_id card, and `summary.test.ts` (6 tests, all pass).
- REALITY: Willis is a **service-area business** and does not appear in the Google
  Places index at all (verified: no result by name, phone, or nearby search). So
  the Places hero returns not-connected for Willis and cannot list reviews or
  reply regardless. Places was the wrong tool for the actual goal (reply + all
  reviews). KEEP the Places code as a harmless cheap-hero fallback for future
  clients that ARE in Places, but it is NOT how we finish this page. GBP supplies
  the hero too, so GBP is the single source of truth once connected.

**The blocker (external, submitted):**
- Google Business Profile API access approval. Project 691475481242. New projects
  start at 0 QPM; nothing returns until Google approves. One approval covers the
  whole agency roster.

## The path: Google Business Profile API v4

The only API that reads all reviews AND posts replies, works for service-area
businesses, and is free per call. Reviews live only on the legacy v4 host.

- List: `GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews`
  (`pageSize` max 50, `pageToken`, `orderBy=updateTime desc`). Response: `reviews[]`
  with `reviewId`, `reviewer`, `starRating` (enum ONE..FIVE), `comment`,
  `createTime`, `updateTime`, optional `reviewReply`; top-level `averageRating`,
  `totalReviewCount`, `nextPageToken`.
- Reply upsert: `PUT .../reviews/{reviewId}/reply` body `{ "comment": "..." }`.
- Delete reply: `DELETE .../reviews/{reviewId}/reply`.
- Scope: `https://www.googleapis.com/auth/business.manage` (read + write).
- Discovery (to map tenant -> location): `GET .../v4/accounts` then
  `GET .../v4/accounts/{accountId}/locations`.

## Plan (phased)

### Phase 0: Approval + connection (Jake, in progress)
- [x] Build the OAuth consent-screen app + add `business.manage` scope (Data Access).
- [x] Submit the Business Profile API access request form (project 691475481242).
- [ ] Await approval email; verify quota flips to 300 QPM in Cloud Console.
- [ ] Create the OAuth Web client (Clients tab) -> Client ID + secret to builder;
      builder returns the exact redirect URI.
- [ ] Keep the app in Testing mode with the agency Google account as a test user
      (avoids a separate OAuth verification review for the restricted scope).

### Phase 1: OAuth connect + connection storage (builder; buildable now, no approval needed)
- Reuse the existing agency Google OAuth client (same project as Drive/Calendar),
  or a dedicated one. Store the agency refresh token, mirroring the existing
  `drive_connection` pattern (see the admin Assets Drive OAuth).
- New: `functions/api/admin/reviews/oauth/start` + `/callback` (admin-only), and a
  `google_reviews_connection` row (refresh token, connected account email).
- Admin UI: a "Connect Google reviews" button in the admin (agency-wide, one-time).

### Phase 2: Per-tenant location mapping (builder; buildable now)
- Add `tenants.google_location` (the `accounts/{a}/locations/{l}` resource) via a
  new migration, alongside `google_place_id`. Env fallback `GOOGLE_LOCATION` for
  single-tenant.
- Admin discovery: `functions/api/admin/reviews/locations` lists the connected
  account's GBP locations so the admin picks Willis's from a dropdown. Extend the
  admin "Reviews (Google)" card (already built) to set the location, not place_id.
- Wire `google_location` through env.ts / tenantResolve.ts / _middleware.ts,
  exactly like `google_place_id` / `meta_ad_account_id`.

### Phase 3: GBP server lib + endpoints (builder; code now, lights up at approval)
- `functions/lib/gbp.ts`: refresh-token -> access-token, v4 fetch helper,
  `starRating` enum -> number, review normalizer. Unit-tested.
- `functions/api/reviews/list.ts`: GET, paginated reviews for the tenant location +
  aggregates (average, total, replied count). KV/in-memory cache ~15 min.
- `functions/api/reviews/reply.ts`: PUT (upsert reply) / DELETE (remove reply).
- Not-connected + demo shapes mirror the funnel/summary pattern.

### Phase 4: Wire the front-end tabs (builder)
- Overview rating hero + recent reviews: read from GBP (supersedes the Places
  summary for connected clients; Places stays a fallback only).
- All Reviews (`ReviewsAll.tsx`): replace `ReviewsComingSoon` with the live queue;
  make the reply drawer POST to `/api/reviews/reply` (drop the local
  optimistic-only reply); filters (all / 5 / 4 / 1-3 / needs reply) run on real data.
- What's working (`ReviewsInsights.tsx`): real rating-over-time from review
  timestamps + real reply rate; DROP the "where reviews start" source bars (not
  derivable from review data).
- Demo (`?demo=1`) layouts stay intact throughout.

### Phase 5: Polish, tests, ship (builder + Jake gate)
- Optional: AI-suggested reply drafts (the reply drawer already has the UI). Wire
  "Suggested reply" / Regenerate to a Claude draft. Can defer.
- Loading / empty / error states; desktop + mobile parity.
- Unit tests (gbp lib, list aggregation, reply body).
- Verify live in Jake's browser (real rating + a test reply), then autopilot ship.
- Update `docs/connections/` reviews doc.

## Optional parallel track: Make.com bridge (only if the approval wait is unacceptable)

Rides Make's own Google approval, so it skips our approval gate. Agency connects
Willis's Google to Make once (agency owns the profile, so the client never sees
the "Make" consent screen).
- Builder generates a Make **blueprint** (JSON) for list-reviews + reply; Jake
  imports it and connects Google (~10 min).
- Builder builds our webhook endpoints + review sync into Supabase; the same
  Phase 4 UI reads from our store instead of GBP.
- Cut over to the direct API (Phases 1-3) when approval lands; drop Make.
- Cost: Make subscription + per-operation; "new review" trigger is flaky (reply
  action is solid). Only worth it if a week's wait genuinely blocks the client.

## Open decisions

1. Connection model: agency-wide single Google connection (recommended, since the
   agency manages all client profiles) vs per-client self-serve OAuth (ties into
   the planned self-serve Connections wizard). Recommend agency-wide for v1.
2. Ship the Make bridge now, or wait on approval? Recommend: wait, build Phases
   1-4 now so it's ready.
3. AI-suggested replies in v1 or deferred? Recommend defer to a fast-follow.
4. Keep or delete the Places interim? Recommend keep (harmless fallback), GBP wins.

## Jake's action items

1. Await the Google approval email; forward it / confirm to builder. Check quota
   (Cloud Console -> My Business API -> Quotas: 0 -> 300 QPM).
2. Create the OAuth Web client (Clients tab); send builder the Client ID (secret
   privately); builder returns the redirect URI to paste.
3. Confirm Willis's agency Google account is an owner/manager on Willis's GBP (so
   discovery finds the location).
4. Decide the Make-bridge question (only if you want it live before approval).

## Notes
- Never name GoHighLevel in client-facing copy; not-connected says "connect your
  Google profile", never the vendor.
- No em dashes anywhere.
