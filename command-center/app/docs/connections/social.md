# Social Media — connections backlog

What the Social section needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

## BLOCKER (2026-07-03) — Social Planner scope not on the Doppler token

Probed the live GHL Social Planner API with the production `GHL_TOKEN` (Doppler `hauck-command-center`/`prd`, token `pit-7794b1…`, a Willis sub-account Private Integration Token):

- `GET /social-media-posting/{locationId}/accounts` → **401** `{"message":"The token is not authorized for this scope."}`
- `POST /social-media-posting/{locationId}/posts/list`, `GET .../tags`, `GET .../categories` → **401** (same)
- Control: `GET /opportunities/search` on the same token → **200**. Token is valid; it just lacks the `socialplanner/*` grant.

NOT a PIT limitation: GHL docs confirm a sub-account PIT with `socialplanner/post.write` + `socialplanner/account.readonly` (etc.) CAN call this API, and editing a PIT's scopes applies live without regenerating. So the fix is a scope/token reconciliation: the `socialplanner/*` scopes must be checked on the **exact** private integration whose token is in Doppler (the Willis sub-account one, `pit-7794b1…`), not the agency integration or a different sub-account's. After the scopes land, a client still has to OAuth-connect their FB/IG/Google accounts (self-serve Connections wizard, currently unbuilt) before real data appears. Until then demo-only + "Not connected yet" is the correct shipped state.

Re-probe to confirm the fix: `GET /social-media-posting/{loc}/accounts` returns 200, not 401.

## Data source — GoHighLevel Social Planner
- ❌ **Connect accounts** (Facebook, Instagram, Google Business) — OAuth per platform via GHL; powers everything. The "Connect accounts" button.
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
