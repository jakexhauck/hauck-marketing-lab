# Social (GHL Social Planner) connection

Status 2026-07-05: READ + WRITE wiring SHIPPED and LIVE. Willis has Google
Business ("Willis Windows LLC") + Facebook ("Willis Window Washing") linked in
the Social Planner; the accounts endpoint returns both (`connected: true`).
Instagram not yet connected. Zero posts so far. Write path (create/delete) not
yet fired against the real account.

## What is wired

- `GET /api/social/accounts` -> the client's Social-Planner-linked accounts,
  normalized to fb/ig/gb, plus `connected: boolean`.
- `GET /api/social/posts?status=&from=&to=` -> real posts (one endpoint powers
  Overview, My Posts, and the Calendar). Status + date filtering is done in the
  Function; date params are NOT sent to GHL (unconfirmed, risked a 422).
- `POST /api/social/posts` -> create a draft or scheduled post. Maps the selected
  fb/ig/gb platforms to the client's connected account ids. Terminal write, no
  retry. Built to GHL's documented body shape; NOT yet fired live (no posts +
  no test sub-account at build time).
- `DELETE /api/social/posts/:id` -> remove a post (My Posts trash action).

Endpoints: `https://services.leadconnectorhq.com/social-media-posting/{locationId}/...`
via the shared `ghlJson` (adds the tenant Bearer token + `Version: 2021-07-28`).
Helpers live in `functions/api/social/_lib.ts` (kept out of `functions/lib/ghl.ts`).

## Confirmed shapes (Task 0, 2026-07-05, live Willis token)

- Accounts: `{ results: { accounts: [], groups: [] } }`.
- Posts list: `POST .../posts/list`, body `{ type, skip, limit }` where **skip and
  limit are STRINGS** and **no locationId in the body** (either triggers a 422).
  Response `{ results: { posts: [], count } }`.
- Scope: the `socialplanner/*` grant is live; endpoints return 200/201, no 401.

Per-account and per-post FIELD NAMES could not be confirmed (zero data to
inspect), so the shapers accept several candidate names defensively.

## Gotcha: Integrations != Social Planner

Accounts connected under GHL **Settings -> Integrations** (used for lead ads,
GBP reviews, etc.) do NOT surface on the Social Planner accounts endpoint. Only
accounts linked **inside the Social Planner tool** appear. Until the client's
FB/IG/Google are linked there, every live Social surface shows the honest
connected-but-empty / not-connected state (never demo rows).

To go live for a client: in their GHL sub-account, open Marketing -> Social
Planner -> connect each account there.

## Deferred (not built)

- **Insights / "What's working" analytics.** DEFERRED but likely REVIVABLE. The
  `/statistics` and `/analytics` location paths 404, but the connected accounts
  report `hasStatisticsPermissions: true` + a `buildingStatistics` flag, so GHL
  does track per-account stats. Couldn't find the right endpoint with zero posts
  to inspect. Revisit once Willis has real posts: probe per-account/per-post
  statistics paths. Until then Insights keeps its honest empty state and Overview
  shows "-" for reach/calls (no faked numbers).
- **AI half** (captions, ideas, Plan my month, Rewrite): out of scope, still
  gated in the composer.
- **Media/photo upload**: still a toast; the create body sends no media.
- **Edit post (PUT)**: composer only creates; no in-place edit in v1.
