# Social Media — connections backlog

What the Social section needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

## Task 0 spike — PROVEN LIVE (2026-07-03)

Probed the GHL Social Planner API with the live Willis tenant token (Doppler `GHL_TOKEN`, `pit-e920e3…`, carrying the `socialplanner/*` scopes). Results, for the handlers to build against:

- `GET /social-media-posting/{locationId}/accounts` → **200**. Connected accounts are under `results.accounts` (NOT a top-level `accounts` array as first guessed); an empty list means nothing connected yet. Willis currently returns `{ results: { accounts: [], groups: [] } }`.
- `GET /users/?locationId=` → **200** (needed to resolve the `userId` the OAuth start requires).
- `GET /social-media-posting/oauth/{facebook|instagram|google}/start?locationId=&userId=` → **302** to the provider's own consent page (facebook.com/dialog/oauth for FB+IG, accounts.google.com for Google). White-label safe.
- `POST /social-media-posting/{locationId}/posts/list` → authorized (returned 422 only because `limit`/`skip` must be passed as **number strings**, e.g. `"5"`, not numbers). Confirms the posts list is reachable for the social-wiring build.
- Version header `2021-07-28` works for all of the above.

## Connect accounts — SHIPPED (Connections hub)
- ✅ **Connect accounts** (Facebook, Instagram, Google Business) — self-serve OAuth from the client app at `/company/connections`. New `functions/api/connections/oauth/[platform]/start.ts` proxies the GHL OAuth-start 302; `functions/api/connections/status.ts` reads live connection state; `src/routes/connections/ConnectionsHub.tsx` is the hub. The Social section's "Connect accounts" button now routes here. Calendar / email domain / A2P cards from the wider wizard plan are deferred.
- ❌ **List scheduled / published posts** — powers My Posts (Scheduled/Posted), Calendar, Overview "Up next" / "Recently posted".
- ❌ **Create / schedule / publish a post** — powers the composer's Schedule / Post now and "Add drafts".
- ❌ **Post analytics** (reach, clicks, engagement) — powers What's working + Overview stats.
- ❌ **Pull past posts** — feeds the AI voice profile (below).

## AI — Claude (server-side only)
- ❌ **Caption generation in the client's voice** — composer "Write it". Suggested model: Opus 4.8 (single) / Sonnet 4.6 (batch).
- ❌ **Idea generation** — Ideas feed + "New post idea" describe-it.
- ❌ **Batch generation** — "Plan my month".
- ❌ **Rewrite / tone** — composer tone chips + Rewrite.
- Voice profile = client's past posts (via GHL) + vault `Profile.md`/`Memory.md`. Replicate the `copywriter` skill's voice rules in the system prompt. Prompt-cache the voice profile across generations.

## Backend endpoints to build (Pages Functions, the bridge)
- ❌ `/api/social/accounts` — list/connect status.
- ❌ `/api/social/posts` — list scheduled/drafts/published.
- ❌ `/api/social/schedule` (+ publish) — create/schedule/publish via GHL.
- ❌ `/api/social/generate` — caption/idea/batch via Claude.

## Auth / identity
- ✅ Session model exists (live/test cookie). The Worker injects the active mode's GHL location + token per request — extend the same pattern to the social endpoints.

## Secrets / env vars (Cloudflare Pages)
- ❌ `ANTHROPIC_API_KEY` — new, for AI.
- ✅ `GHL_LOCATION_ID` / `GHL_TOKEN` (+ `TEST_*`) — exist; confirm the GHL token scope covers Social Planner.
- ❌ Per-platform OAuth credentials for account connect (handled through GHL).

## Webhooks
- ⚠️ Optional: post-published / post-failed callbacks to refresh status without polling.

## Persistence
- ❌ Draft store — only needed if drafts must persist before they're pushed to GHL (decide: store in GHL as drafts vs our own store).

## Per-action gating (flip on when its connection lands)
- Connect accounts → account OAuth.
- Save draft / Schedule / Post now → `/api/social/schedule` + accounts connected.
- Write it / Rewrite / New post idea / Plan my month → `/api/social/generate` (AI).
- Real numbers everywhere → analytics + list endpoints.

## Also brings
- **Voice-onboarding screen** (connect accounts + "teach the AI your voice") — build with this work; it's the front door, dead without the connections above.
