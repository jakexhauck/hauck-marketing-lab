# Social Media — connections backlog

What the Social section needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

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
