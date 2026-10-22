# Hermes Agent Ops

Agreed with Jake 2026-10-22 (session that watched "10 Hermes Agent Skills You NEED To Install Today", Sharbel A.). Jake: "go ahead and build everything". Separate from the Mission Control brief build, because this is per-agent configuration.

## Why

The five Hermes agents (manager, csm, research, ghl, ads) are live on the VPS but not yet in real use. Jake wants them fully working, with the skills from the video, before anything else. On top of that: the Ads chat curates the Ads brief as Jake approves, the Manager reaches Jake on Telegram only when something needs him, and each agent has its own settings (cost, health, memory, schedules).

## Decisions (Jake's)

- Skills in: Defuddle, Caveman, Codebase Memory (Claude Code CLI, not Hermes), Agent Reach, Marketing Skills, Composio, Superpowers. Out: Humanizer, Nova (YouTube), OpenMontage.
- Oh My Claude Code: not installed; its verify step is the pattern to copy (Claude's call, Jake did not object).
- Ads chat: brief on the right; approval happens IN THE CHAT on a card (mockup option A, `.superpowers/brainstorm/2165-1792694488/content/ads-chat-brief.html`). The brief shows only what Jake approved.
- Telegram, through the Manager. ONLY when something needs to be seen or approved. No daily brief, no summaries.
- Cost, health, memory and schedules are per agent.

## Claude's calls (Jake may overrule)

- Skills install with Hermes's own installer from each source repo at a pinned commit. Nothing third party is copied into this repo; the repo holds the manifest (which agent gets which skill, at which commit).
- The 53 bundled Hermes skills (apple, devops, python debuggers...) are switched off on every profile except a short keep list. The video's own takeaway: do not bury the good skills under 40 you never use.
- Caveman: chat replies only, for manager/csm/research/ghl. Never Ads (writes copy), never cards, brief, lessons or anything a client reads (Caveman's own rules exempt anything persisted).
- Marketing Skills subset, by agent:
  - ads: ads, ad-creative, copywriting, copy-editing, marketing-psychology, offers, cro
  - research: customer-research, competitor-profiling, competitors, marketing-psychology
  - csm: offers, marketing-plan, marketing-psychology
- Superpowers subset for the Manager: brainstorming, writing-plans, verification-before-completion.
- Defuddle and Agent Reach run in the runner as MCP bridge tools (profiles have no shell by design). Agent Reach: only the channels that need no login (web pages, YouTube transcripts, GitHub, RSS). Reddit and X wait for burner accounts (Jake's step).
- Composio through the bridge, an allowlist of tool slugs per agent, read or draft only. No send, no delete.
- The verify pattern: before a card reaches Jake, the agent re-reads its own card against the brief and the request (a checklist line in `_protocol.md`), not a second agent. A second-agent verifier waits until there is real traffic to justify the cost.
- Memory: the existing Brain lessons gain a type (fact, decision, lesson) and a source (Jake said, agent learned). An edit marks the old lesson replaced instead of deleting it.

## Phase 1: skills (runner + VPS)

1. `projects/agent-runner/deploy/vps/skills.json`: `{ "keep": [...bundled names kept], "install": [{ "agent", "source", "path", "commit" }] }`.
2. `deploy/vps/skills.sh` (run by `setup.sh`): per profile, `hermes skills opt-out` of bundled seeding, disable bundled skills not on the keep list, `hermes skills install <raw SKILL.md URL at commit> --yes` for each manifest entry, under `HERMES_HOME=/opt/data/profiles/<agent>`. Idempotent.
3. Runner bridge tools (`src/mcpBridge.ts` + new `src/webTools.ts`):
   - `read_page(url)`: fetch the page, run it through `defuddle` (npm, node build) to clean Markdown, cap 200 KB. research, ads, csm, manager.
   - `reach(channel, query|url)`: Agent Reach style reads with no login: `youtube_transcript` (yt-dlp captions), `github` (REST), `rss`. research, ads.
   - `composio(tool, args)`: per-agent allowlist (`src/composioTools.ts`), called with `COMPOSIO_API_KEY` from Doppler and the agency's connected account.
   All carry the turn id like every other bridge tool.
4. `agents/_protocol.md`: a "Before you post a card" checklist (re-read the card against the ask and the brief; numbers have a source; nothing invented). `agents/*.md`: one line per agent naming its skills and tools.
5. `profiles.py` SOUL.md: the Caveman line for the four agents that get it.
6. Codebase Memory: installed for Claude Code on Jake's PC (user MCP), not on Hermes.

## Phase 2: Ads chat curates the brief (app)

1. Card kind `brief` from research or ads: `payload.pageOps` (list) + `payload.plan`. Ops: `set` (a campaign field: offer, objective, dailySpend, budgetType, launchDate), `add` (adSet, creative, angle, ad, headline), `update` (match by name), `remove` (by name). Campaign named by `campaign`; a missing campaign is created by `add` with `kind: "campaign"`.
2. `src/lib/briefPageOps.ts`: pure `applyPageOps(page, ops) -> { page } | { error }`, unit tested. Added items land with status `approved`.
3. `decideItem`: on Approve of a `brief` card (agent research or ads, at a client), apply the ops to `client_brief_pages` with the version lock, retrying once on a conflict; same pattern as the Manager's `taskOps`. The follow-up tells the agent what landed.
4. Agent page, research and ads at a client: the right side's Brief tab shows that agent's Mission Control page (`AdsPage` / `ResearchPage` from `components/admin/brief/`), refetching on approve, newest change highlighted. Other agents keep the section brief.
5. `ItemCard`: a `brief` card shows each op as a line (what will be added or changed) above Approve / Change.
6. `agents/ads.md` + `agents/research.md`: propose additions as `brief` cards; the ```page block stays for status moves (live, not_made) only.

## Phase 3: Telegram, through the Manager (app)

1. Secrets (Doppler `hauck-command-center/prd`, CF Pages): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`. Jake makes the bot in BotFather.
2. `functions/lib/telegram.ts`: send, edit, answer callback; message text built by a pure `approvalMessage(item)`.
3. Send when a card becomes `needs_ok` (new, or rewritten) and when a request waits on Jake. Buttons: Approve, Change, Open. Callback data carries item id + payload hash.
4. `functions/api/telegram/webhook.ts`: checks the secret header and the chat id. Approve -> `decideItem` (same rules as the app, a changed card answers "changed, look again"). Change -> asks for the note (force reply), the reply -> `decideItem(change)`. Before `TELEGRAM_CHAT_ID` is set, `/start` answers with the chat id so Jake can paste it.
5. Alerts (the "needs to be seen" kind): runner offline over 10 minutes, an agent turn failing twice in a row. Sent from the health cron path, at most once per incident.
6. Decided in the app or in Telegram, the other side updates (the Telegram message is edited to "Approved in the app").

## Phase 4: agent settings (runner + app)

1. Runner collector (`src/agentOps.ts`), every 10 minutes, per Hermes agent, over the gateway with that profile's key: `/api/sessions` (tokens, estimated cost per session), `/health/detailed`, `/api/jobs`. Posts to `POST /api/agent-runner/agent-ops`.
2. Migration: `agent_ops` (agent, health jsonb, jobs jsonb, skills jsonb, collected_at) and `agent_usage_daily` (agent, day, sessions, turns, input/output/cache tokens, est_cost_usd), unique (agent, day).
3. `GET /api/admin/agents/ops?agent=` and `POST .../ops/job` (pause, resume, run) relayed to the runner through a queued command the collector picks up.
4. Agent page: a Settings tab with Health (gateway, runner, last turn, last error), Cost (today, 7 days, 30 days, tokens, estimated dollars; the VPS runs on Jake's Claude subscription, so dollars are Hermes's estimate), Skills (from the manifest and Hermes's list), Memory (the Brain lessons with type, source, replaced), Schedules (Hermes jobs + the runner's own, pause/run).
5. Lessons: migration adds `kind`, `source`, `replaced_by` to the lessons table; an edit from the app writes a new lesson and marks the old one replaced.

## Ship

Release note per admin-facing change (`releaseNotes.ts`), blueprint updated, migrations via `npm run db:migrate`, push main, watch CF deploy, VPS: pull in the runner container, `setup.sh`, restart, real chat per agent.

## Jake's steps (filled in at ship)
