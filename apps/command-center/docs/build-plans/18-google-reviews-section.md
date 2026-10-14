# 18. Google Reviews: expand into a 4-page section

> Companion to `17-google-reviews.md`. That doc built the single "Ask for Reviews"
> page. This doc turns Google Reviews into a dropdown section that mirrors Social
> Media (parent + children under one route prefix).
> Status: PLAN. Design direction locked from mockups (see `docs/mockups/reviews-v1/`).

## Objective

Give Google Reviews the same nested-sidebar shape Social Media has: one parent
nav row (`Google Reviews`) that expands to its sub-pages, all living under
`/marketing/reviews`. The page that exists today becomes the "Ask for Reviews"
child; a new Overview becomes the landing page.

## Design direction (locked from mockups)

Jake reviewed three full-section mockups and chose per page. Build each page to
its chosen variant:

| Page | Chosen variant | Mockup file |
|---|---|---|
| Overview | **C — Editorial Bold** (huge gradient rating, stat chips, quote-card recents) | `variant-c-editorial-bold.html` |
| Ask for Reviews | **A — Glance Dashboard** (calm, clean completed-jobs list) | `variant-a-glance-dashboard.html` |
| All Reviews | **B — Reputation Cockpit** (inbox work-queue, filter bar, inline AI reply drawer) | `variant-b-reputation-cockpit.html` |
| What's working | **C — Editorial Bold** (rating-trend chart, source bars) | `variant-c-editorial-bold.html` |

**Showcase is cut.** Not built. (It overlapped Social and Jake dropped it.)

## The four pages

Parallel to Social Media (Overview / ... / What's working):

| Page | Route | Icon | What it does | Status today |
|---|---|---|---|---|
| **Overview** | `/marketing/reviews` | `LayoutDashboard` | The glance. Hero with average rating + stars, KPI chips (Total reviews, New this month, Requests sent). "Ready to ask" + "Recent reviews". | New |
| **Ask for Reviews** | `/marketing/reviews/requests` | `Send` | Completed jobs, one tap sends the review request (adds the `request review` tag). The page from doc 17, moved under the section. | Built (move) |
| **All Reviews** | `/marketing/reviews/all` | `MessageSquare` | Every Google review as a work queue. Filter chips, per-row reply state, inline AI-drafted reply the client edits and posts. | New |
| **What's working** | `/marketing/reviews/insights` | `BarChart3` | Rating trend, ask-to-review conversion, reply rate, best source. | New |

### Page detail

**Overview (`/marketing/reviews`)** — Variant C layout:
- Hero: large gradient average-rating number (Poppins black), gold star row, one
  line of context, flanked by clean stat chips (Total reviews, New this month,
  Requests sent).
- "Ready to ask" panel: newest completed jobs (reuse `/api/reviews`), one-tap ask
  inline, `See all -> Ask for Reviews`.
- "Recent reviews" panel: latest reviews as compact quote cards, `See all -> All
  Reviews`.
- Primary action: `Ask for a review` -> Ask for Reviews.
- Demo vs real (golden rule): populated layout only under `?demo=1`; a real
  session with nothing connected shows zeroed stats + a not-connected banner.

**Ask for Reviews (`/marketing/reviews/requests`)** — the current
`GoogleReviews.tsx`, behavior unchanged (Variant A is essentially today's page).
Only its file location, route, and `PageHeader` title change (see "File moves").

**All Reviews (`/marketing/reviews/all`)** — Variant B cockpit:
- Inbox-style list of pulled Google reviews: stars, reviewer, date, body, reply
  state (Replied / Needs reply).
- Persistent filter bar (segmented): All / 5★ / 4★ / 1-3★ / Needs reply.
- Inline reply drawer per row with a `copywriter`-voiced AI draft the client
  edits and posts. v1 may be draft-only (copy / open in GHL) if the GHL reply
  write is not yet wired (see Data).
- Real/empty: empty state until reviews are pulled; designed list under demo.

**What's working (`/marketing/reviews/insights`)** — Variant C:
- Rating trend (CSS/SVG line), ask-to-review conversion, reply rate, best source
  bars. Leans on `data-analyst` for plain-English read-outs later.
- Populated under demo; honest empty state in a real session until data exists.

## Nav change (`src/lib/nav.ts`)

Replace the single Reviews item (line ~96) with a parent + children block,
identical in shape to Social Media. Import `Send`, `MessageSquare` (Star,
BarChart3, LayoutDashboard already imported):

```ts
{
  to: "/marketing/reviews",
  label: "Google Reviews",
  shortLabel: "Reviews",
  icon: Star,
  children: [
    { to: "/marketing/reviews", label: "Overview", icon: LayoutDashboard },
    { to: "/marketing/reviews/requests", label: "Ask for Reviews", shortLabel: "Ask", icon: Send },
    { to: "/marketing/reviews/all", label: "All Reviews", shortLabel: "Reviews", icon: MessageSquare },
    { to: "/marketing/reviews/insights", label: "What's working", shortLabel: "Insights", icon: BarChart3 },
  ],
},
```

No change needed to `Sidebar.tsx`, `flattenNav`, or the bottom bar: they already
handle `children`. The parent's own route (`/marketing/reviews`) is the Overview
child, so it is not a duplicate leaf (same as Social).

## File moves and new files

Mirror the `routes/social/` folder layout with a `routes/reviews/` folder.

Move:
- `src/routes/GoogleReviews.tsx` -> `src/routes/reviews/ReviewsRequests.tsx`
  (rename the default export to `ReviewsRequests`, change the `PageHeader` title
  to "Ask for Reviews"; keep all hook/logic untouched).

New:
- `src/routes/reviews/shared.tsx` — `StarRating`, `RatingBadge`, a reviews
  `NotConnectedNotice` ("we still need to connect your Google profile through
  GoHighLevel"), and `REVIEWS_CONTAINER` (copy `SOCIAL_CONTAINER`).
- `src/routes/reviews/ReviewsOverview.tsx` — the glance (Variant C).
- `src/routes/reviews/ReviewsAll.tsx` — All Reviews (Variant B).
- `src/routes/reviews/ReviewsInsights.tsx` — What's working (Variant C).

Update `src/App.tsx` imports (drop `GoogleReviews`, add the four) and routes:

```tsx
<Route path="/marketing/reviews" element={<ProtectedRoute><ReviewsOverview /></ProtectedRoute>} />
<Route path="/marketing/reviews/requests" element={<ProtectedRoute><ReviewsRequests /></ProtectedRoute>} />
<Route path="/marketing/reviews/all" element={<ProtectedRoute><ReviewsAll /></ProtectedRoute>} />
<Route path="/marketing/reviews/insights" element={<ProtectedRoute><ReviewsInsights /></ProtectedRoute>} />
```

## Data sources

- **Ask for Reviews:** unchanged. `/api/reviews` (doc 17) + existing hooks
  `useReviewsQuery` / `useStartReviewCampaign`.
- **Overview KPIs + Recent reviews + All Reviews:** need a reads source for actual
  Google reviews. **Phase 0 unknown to verify first:** does the client's GHL
  reputation API expose listing reviews (rating, author, body, date, reply state)
  and posting a reply? Same role GHL's social API played for Social. If
  reviews-read is available, wire a new `functions/api/reviews/list.ts` GET. If
  not, Overview "recent reviews" and All Reviews ship as connected-but-empty
  (designed layout under demo only) until the read is available; the section is
  still useful via Overview stats derived from `/api/reviews` (requests sent) +
  Ask for Reviews.
- **What's working:** no new backend in Phase 1 (demo layout + empty real state).
  Phase 2 wires insights off the reviews list once Phase 0 confirms it.

Golden rule (from Social `shared.tsx`): a real, connected client never sees
fabricated content. Every new page renders its populated layout only under
`?demo=1`; a real session shows the zeroed / empty state plus the not-connected
banner until the Google profile is linked in GHL.

## Phases

**Phase 0 — Verify GHL reputation reads.** Confirm list-reviews and post-reply
coverage. Decide whether All Reviews replies are post-capable or draft-only in v1.

**Phase 1 — Structure + all four pages (ship-able).**
- Nav change to parent + children.
- Folder move (Requests page) + route rewire.
- `shared.tsx`.
- Overview (C), All Reviews (B), What's working (C) built to their chosen mockup
  layouts, with demo data populated and honest empty states in a real session.
- Done when: the dropdown opens to four pages, every one navigates, nothing
  crashes, and a real session shows honest empty states.

**Phase 2 — Live data.** Wire `/api/reviews/list` (if Phase 0 green): real reviews
in Overview + All Reviews, real filters, AI-drafted replies, real insights.

## Acceptance criteria

- [ ] Google Reviews renders as an expandable group with four children, auto-open
      on any child route (matches Social Media behavior).
- [ ] `/marketing/reviews` lands on Overview; the old single page is now
      `/marketing/reviews/requests` with identical Ask behavior.
- [ ] Each page matches its chosen variant (Overview C, Ask A, All Reviews B,
      What's working C).
- [ ] Real session with nothing connected shows zeroed stats + a not-connected
      note on every new page; populated layouts appear only under `?demo=1`.
- [ ] No hardcoded pipeline/stage IDs (Ask for Reviews keeps name-resolution).
- [ ] No em dashes in code, comments, or UI copy.

## Rollback

The nav change is one block; revert it to the single item to collapse the section.
The moved Requests page can keep its old route as a redirect during transition.
New endpoints are additive and read-only (plus the existing idempotent tag write).
No migrations.

## Open questions (decide before Phase 2)

- All Reviews replies in v1: post directly via GHL, or draft-only (copy / open in
  GHL)? Depends on Phase 0.
- Does Reviews earn a phone bottom-nav tab, or stay sidebar/menu only?
  (Recommendation: stay off, like Social and the current Reviews.)
