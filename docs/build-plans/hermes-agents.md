# Hermes Agents (VPS brains) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app's agents stop being one-off `claude -p` calls on Jake's PC and become five Hermes profiles on the VPS, each with its own memory, skills and past sessions, still driven from the app's chats and still behind every approval card and gate.

**Architecture:** The app side (CF Pages, `apps/command-center`) stays as it is: a queue of agent messages plus server-side write gates. The runner (`projects/agent-runner`) gets a second engine: instead of spawning `claude -p` it posts the turn to the Hermes API server on the VPS (`/p/<agent>/v1/chat/completions`, streamed, the bundle as the system message, the chat's Hermes session id in `X-Hermes-Session-Id`). A copy of the runner runs on the VPS in its own container beside Hermes and claims the agents that live there. The PC runner keeps claiming the Ads agent, unchanged, until Phase 2. The app's GHL and Meta tools reach Hermes as one MCP server the runner serves over HTTP, so no agent ever gets a shell or a secret.

**Tech Stack:** Node 24 + TypeScript + vitest (runner), Cloudflare Pages Functions + Supabase (app), Hermes Agent v0.22 in Docker (`ghcr.io/hostinger/hvps-hermes-agent`), Docker Compose on Hostinger, rclone (Drive), Doppler (secrets).

**Spec:** this document (spec and plan in one, per Jake's rule).

## Spec

### Why
Jake wants each agent to have "a brain of its own": remember past conversations, learn and reuse skills, and later work on its own. Hermes gives that per profile (memory, skills, session search, cron). He talks to them through the app, not Hermes Desktop.

### Decided by Jake
- Hermes replaces the agent engine. Not side by side.
- Five brains: `manager`, `csm`, `research`, `ads`, `ghl`. One brain per role across every client, keeping per-client notes inside it. No per-client profiles.
- The brains live on the VPS (Hostinger `2.25.213.136`, Hermes container `hermes-agent-jz7z-hermes-agent-1`).
- Option 2 split: thinking and memory on the VPS; heavy PC-only jobs (video renders, landing deploys) stay on the PC and only run while it is on.
- Manager will later also answer Jake's text messages with the same memory. Not in this build; the Manager profile must just be reachable by a Hermes gateway platform later.
- Autonomous work (cron) is not in this build.

### Goals
- Chats with Manager, CSM, Research and GHL in the app are answered by their Hermes profile on the VPS, with the PC off.
- Each profile keeps Hermes memory, skills and session search; a chat resumes its own Hermes session.
- Every existing gate holds: GHL writes still pass `writeAllowed` in the app, Meta stays read-only for these four, cards, brief, tasks, lessons and requests all work through the same fenced blocks.
- Brain.md lessons keep working and keep showing in the Brain tab, now written and pushed from the VPS.
- The CSM can read the client's Drive folder and write its monthly report there.

### Non-goals (this build)
- Moving the Ads agent (Phase 2, separate plan: Ads brain on Hermes, PC becomes a job worker for video and deploys).
- Texting the Manager, cron jobs, Hermes Desktop access to these profiles.
- Any change to the app's UI beyond what already shows (chat, cards, Brain tab, runner online dot).

### Anti-goals
- An agent that can read a secret (runner secret, Doppler token, Claude login) or run arbitrary shell. No `terminal` toolset on any profile.
- A gate that moves from the server into the prompt. Every write is still re-checked by the app.
- Two runners answering the same message, or a message nobody claims.

### Constraints
- VPS: 1 vCPU, 3.8 GB RAM, no swap. One turn at a time on the VPS runner. Add a 2 GB swap file.
- All five profiles share Jake's one Claude subscription (`claude-subscription-directsdk-experimental`, Claude Code at `/opt/data/.local/bin/claude`).
- Never use em dashes in any output, prompt, comment or UI text.
- Secrets live in Doppler `hauck-command-center/prd`. The VPS runner reads them with a Doppler service token, never a file in the Hermes data dir.
- The Hostinger template may rewrite `/docker/hermes-agent-jz7z/docker-compose.yml`, so the runner gets its own compose dir and joins Hermes's network as external.

### Calls I made (Jake can overrule)
- HTTP API (`api_server` with `gateway.multiplex_profiles`) over `docker exec hermes chat`: keeps the runner in its own container, away from Hermes's files.
- Hermes native memory is the brain; Brain.md lessons stay as the shared, Jake-editable per-client notes and are still put in the system message every turn.
- Brain commits are pushed to `origin main` from the VPS (pull --rebase first). Jake's checkout gets them on his next pull.
- Drive on the VPS: rclone copy down before a turn, copy back after (never delete), CSM and Research only.

## Global Constraints
- Node `>=24`, TypeScript strict, vitest, match the runner's comment style (why-comments, no em dashes).
- Engine is chosen by env `AGENT_ENGINE=claude|hermes` (default `claude`, so the PC is untouched until told).
- Agents a runner claims: env `AGENT_AGENTS` comma list; unset means all (today's behaviour).
- Hermes base URL env `HERMES_API` (VPS: `http://hermes-agent:8642`), key env `HERMES_API_KEY` (= Hermes `API_SERVER_KEY`, also stored in Doppler as `HERMES_API_SERVER_KEY`).
- MCP bridge listens on `0.0.0.0:8700` inside the runner container, path `/mcp`, one bearer token per profile (Doppler `HERMES_MCP_TOKEN_<AGENT>`).
- Hermes profiles: names exactly `manager`, `csm`, `research`, `ghl` (and `ads` created now, unused until Phase 2).

## Review Focus
- A Hermes turn that errors or times out mid-stream: the message must end `error` with the reason, never stay `running` (stale reclaim is 10 min). Test in Task 3.
- A chat whose stored session id no longer exists in Hermes (profile reset): fall back to a fresh session with history, like the claude engine. Test in Task 3.
- An MCP call when no turn is active for that agent, or with another profile's token: refused. Test in Task 4.
- PC runner and VPS runner both online: each claims only its agents; an Ads message is never claimed by the VPS. Test in Task 2.
- Two brain writers (VPS pushes, PC commits locally): a push that is rejected must pull --rebase and retry once, then log and leave the commit local, never lose a lesson. Test in Task 5.

---

### Task 1: Spike and fixtures (throwaway, no product code)

**Files:**
- Create: `projects/agent-runner/test/fixtures/hermes-stream.sse` (captured)
- Create: `projects/agent-runner/test/fixtures/hermes-notes.md` (what was learned; deleted at ship, facts moved into code comments)

- [ ] **Step 1:** On the VPS, enable multiplexed profiles: in `/opt/data/config.yaml` set `gateway.multiplex_profiles: true` (back up first to `config.yaml.bak-hermes-agents`). Create profiles: `hermes profile create <name> --clone --description "<one line from agents/<name>.md>"` for manager, csm, research, ghl, ads. Restart the container. Check `hermes profile list` shows all five on model `opus`.
- [ ] **Step 2:** From inside the Hermes container, `curl -N` a streamed `POST http://127.0.0.1:8642/p/csm/v1/chat/completions` with a system message and a user message that forces one tool call. Save the raw SSE to the fixture. Note: event names for text deltas, tool progress, final, errors.
- [ ] **Step 3:** Test whether a caller-chosen `X-Hermes-Session-Id` (a fresh uuid) creates a session or is refused. Note the answer: it decides Task 3's session handling (caller-chosen if accepted; otherwise read the id from the response header and store it).
- [ ] **Step 4:** Test an HTTP MCP server entry in a profile (`mcp_servers.hauck.url` + `headers.Authorization`) against a dummy server; note whether headers are supported and how tool names appear in the stream.
- [ ] **Step 5:** Confirm `toolsets` per profile can be restricted in that profile's `config.yaml` (no `terminal`, no `code_execution`) and that a prompt asking to run `cat /opt/data/.env` is refused. Note it.
- [ ] **Step 6:** Commit fixtures on the worktree branch.

### Task 2: Claim filter by agent

**Files:**
- Modify: `apps/command-center/functions/lib/agentRunner.ts` (`claimNext`, ~`:229-244`)
- Modify: `apps/command-center/functions/api/agent-runner/claim.ts`
- Modify: `apps/command-center/src/lib/agentWire.ts` and `projects/agent-runner/src/wire.ts` (`ClaimRequest.agents?: AgentId[]`)
- Modify: `projects/agent-runner/src/api.ts` (`claim(host, agents?)`), `src/config.ts` (`CLAIM_AGENTS` from `AGENT_AGENTS`), `src/main.ts`
- Test: `functions/lib/agentRunner.test.ts`, `projects/agent-runner/test/api.test.ts`

**Interfaces:**
- Produces: `claimNext(db, host: string, agents?: AgentId[])` claims only messages whose chat's agent is in `agents` (all when absent). Invalid agent names: 400.

- [ ] **Step 1: failing tests** `claims only listed agents` (queued csm + ads, agents `["csm"]` returns csm, ads stays queued), `no list claims all`, `unknown agent is a 400`, and `reclaimStale only touches this host's rows` still passes.
- [ ] **Step 2:** run `npx vitest run functions/lib/agentRunner.test.ts`, expect FAIL.
- [ ] **Step 3:** implement; runner sends `agents` from `AGENT_AGENTS`.
- [ ] **Step 4:** both suites PASS, `npm run typecheck` clean in both packages.
- [ ] **Step 5:** commit `feat(agent-runner): claim by agent list`.

### Task 3: Hermes engine

**Files:**
- Create: `projects/agent-runner/src/hermes.ts`
- Modify: `src/runner.ts` (session-not-found fallback also matches Hermes's error), `src/main.ts` (`run` = `runHermes` when `AGENT_ENGINE=hermes`), `src/bundle.ts` (`Bundle.systemPrompt` text read from the file; tool lines for Hermes name MCP tools, not scripts)
- Modify (only if Task 1 Step 3 says Hermes picks the id): `wire.ts` both sides + `applyReply` to accept `sessionId` and store it in `agent_chats.claude_session_id`
- Test: `projects/agent-runner/test/hermes.test.ts`

**Interfaces:**
- Consumes: `RunOptions`, `Bundle` from `src/claude.ts`.
- Produces: `runHermes(opts: RunOptions & { agent: AgentId; fetchImpl?: typeof fetch }): Promise<{ text: string; tools: string[]; sessionId: string }>` and `createHermesParser(): StreamParser` (same `StreamParser` shape as `claude.ts`).

- [ ] **Step 1: failing tests** against the Task 1 fixture: `parses text deltas into text`, `collects tool names`, `final text wins over deltas`, `posts to /p/<agent>/v1/chat/completions with system = bundle prompt and X-Hermes-Session-Id`, `progress throttled to PROGRESS_MS`, `HTTP 5xx rejects with status and body tail`, `stream ending without a final event rejects`, `missing session error text matches the runner's fallback regex`.
- [ ] **Step 2:** run, expect FAIL.
- [ ] **Step 3:** implement with global `fetch` and a line reader over the SSE body; reuse `throttle` from `claude.ts`. Timeout: abort after 15 min.
- [ ] **Step 4:** `npx vitest run` whole runner suite PASS (the claude engine tests must not change).
- [ ] **Step 5:** commit `feat(agent-runner): Hermes engine`.

### Task 4: MCP bridge (the app's tools for Hermes)

**Files:**
- Create: `projects/agent-runner/src/mcpBridge.ts`, `projects/agent-runner/src/appOps.ts` (shared call code lifted out of `bin/ghl.mjs` and `bin/meta.mjs`; the scripts import it so the PC path keeps working)
- Modify: `src/main.ts` (start the bridge when `AGENT_ENGINE=hermes`; set the active turn around `handleClaim`)
- Test: `projects/agent-runner/test/mcpBridge.test.ts`

**Interfaces:**
- Produces: `startBridge({ port, tokens: Record<AgentId,string>, api }): { setTurn(agent, turn: { tenantId: string | null; messageId: string } | null): void; close(): Promise<void> }`. MCP streamable HTTP, JSON-RPC `initialize`, `tools/list`, `tools/call`. Tools: `meta_insights` (manager, csm, ads), `ghl` (ghl at a client). Same args as the scripts.

- [ ] **Step 1: failing tests** `tools/list is per agent token`, `wrong token is 401`, `call with no active turn is refused with a plain message`, `ghl call forwards tenant and messageId from the active turn, never from args`, `manager gets no ghl tool`.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement (no SDK dependency; the protocol subset is small). **Step 4:** PASS + `node bin/ghl.mjs` script tests still PASS. **Step 5:** commit `feat(agent-runner): MCP bridge for Hermes`.

### Task 5: VPS paths, Drive and brain push

**Files:**
- Modify: `src/config.ts` (`REPO_DIR`, `WORK_DIR`, `DRIVE_ROOT` overridable by env), `src/git.ts` (`pushBrains`: `git pull --rebase` then `git push`, one retry, only when `AGENT_GIT_PUSH=1`), `src/main.ts`
- Create: `src/drive.ts` (`pullDrive(folder)`, `pushDrive(folder)` wrapping `rclone copy`, enabled when `AGENT_DRIVE=rclone`)
- Test: `test/git.test.ts`, `test/drive.test.ts`

- [ ] **Step 1: failing tests** `push retries once after a rejected push with pull --rebase`, `push failure keeps the commit and logs`, `drive copy never passes a delete flag`, `drive is skipped for manager and ghl`.
- [ ] **Step 2-4:** fail, implement, pass. **Step 5:** commit `feat(agent-runner): VPS paths, rclone Drive, brain push`.

### Task 6: Profiles and the runner container on the VPS

**Files:**
- Create: `projects/agent-runner/deploy/vps/Dockerfile` (node:24-slim + git + rclone + doppler CLI; copies the runner; `npm ci`)
- Create: `projects/agent-runner/deploy/vps/docker-compose.yml` (service `hauck-agent-runner`, external network `hermes-agent-jz7z_default`, volumes: repo clone, `/docker/hermes-agent-jz7z/data/work:/work`, rclone config; env from Doppler service token)
- Create: `projects/agent-runner/deploy/vps/profiles.sh` (idempotent: per profile write `SOUL.md` from `agents/<name>.md`, set toolsets, add the `hauck` MCP entry with that profile's token)
- Modify: `projects/agent-runner/README.md` (VPS section)

Toolsets per profile (no terminal anywhere):
| profile | toolsets |
|---|---|
| manager | memory, session_search, skills, file (read), hauck MCP |
| csm | memory, session_search, skills, file, hauck MCP |
| research | memory, session_search, skills, file, web |
| ghl | memory, session_search, skills, hauck MCP |

- [ ] **Step 1:** add 2 GB swap on the host (`/swapfile`, fstab).
- [ ] **Step 2:** run `profiles.sh`; check each profile's tool list with `hermes -p <name> tools list`.
- [ ] **Step 3:** clone the repo on the host with a deploy key (Jake adds it on GitHub, write access), build and start the container with `AGENT_ENGINE=hermes AGENT_AGENTS=manager,csm,research,ghl AGENT_GIT_PUSH=1 AGENT_DRIVE=rclone`.
- [ ] **Step 4:** `docker logs` shows `watching for agent messages` and the app's runner dot is online.
- [ ] **Step 5:** commit the deploy files.

### Task 7: Cutover and live proof

- [ ] **Step 1:** PC runner: set `AGENT_AGENTS=ads` in its logon task env, restart it. Both hosts online.
- [ ] **Step 2:** In the app (prod), one chat each with Manager, CSM (Made Better), Research, GHL (Willis, read-only op). Each answers, shows tool steps, `docker logs` shows the VPS claimed it, PC log shows nothing.
- [ ] **Step 3:** Memory proof: tell CSM a fact, open a new CSM chat, ask for it. Hermes memory answers.
- [ ] **Step 4:** Gate proof: in a GHL Director trigger chat (not live) ask for a write; the app refuses it. A lesson block lands in Brain.md on `origin main` and in the Brain tab.
- [ ] **Step 5:** PC off (stop the runner): a Manager chat still answers.
- [ ] **Step 6:** `RELEASES` entry in `src/lib/releaseNotes.ts`, blueprint update, memory update, delete this plan and `hermes-notes.md`, add Jake's owed steps to his action items. Commit, push, watch deploy, smoke-test.

## Jake owes (collected for the checklist at the end)
1. Add the VPS deploy key to the GitHub repo with write access.
2. Create a Doppler service token for `hauck-command-center/prd` for the VPS.
3. Run `rclone config` once on the VPS for Google Drive (I'll give the exact command).
