# Agents: design

Status: DESIGN APPROVED 2026-10-17 (Jake). Build plan below.
Mockup: `.superpowers/brainstorm/559-1792256193/content/agents-v3.html` (the approved look; build it exactly).

## Why

Jake wants service delivery done by a team of AI agents that are the same for every client, remember everything, and get better over time. Each agent learns per client and across clients, and all of it rolls up into one Mega Brain. The existing admin pages (Meta Data, Dashboard, Creatives, etc.) stay; the agents are a new section that does the work and files the results into those pages.

Success: Jake opens a client, clicks an agent, chats with it, watches it build the thing on the right, approves, and the result lands in the right page. Over weeks the agents visibly cite what they learned ("before/after beats quotes at Willis, and at 4 of 5 home service clients").

## Goals

- Seven agents, in a new **Agents** group in each client's sidebar (and the Manager also in the agency sidebar).
- Each agent page: chat list (New chat, search, grouped by day) | chat | right panel with **Building** and **Brain** tabs.
- Agents remember and learn automatically, in Obsidian vault notes, shown as a graph.
- Agents read each other's work and can send each other requests.
- Agents monitor every client when Jake's PC starts up.
- Finished work, once Jake approves, lands in the matching app page.

## Non-goals (v1)

- No team access. Jake is the only user (store `user_id` on chats anyway so the team can be added later).
- No phone/Telegram/push notifications. The chat and sidebar badges are the only signal.
- No running while the PC is off. No cloud fallback.
- Agent setup responsibilities from the SOP (which agent owns which Full Setup Checklist items) are a LATER step, not v1.
- The old pages are not rebuilt or removed.

## Anti-goals (a failure even if it works)

- Any agent changing anything in Meta Ads Manager. Meta is read-only, always.
- Anything going live, into a client-visible page, or into GHL without Jake's click.
- Agents that feel like one generic chatbot with a label. Each must have its own role, tools and brain.
- Explanatory sub-text under headings (house rule). Heading plus controls only.
- Em dashes anywhere, including agent output.

## The agents

| Agent | Where | Job | Tools / access |
|---|---|---|---|
| Manager | Agency sidebar AND each client | Where each client stands in onboarding, what's left to go live, what's waiting on Jake. Overlooks all accounts. | Reads Full Setup Checklist, Accounts checks, every agent's work. Reads/writes **Mega Brain only**. |
| Market Research | Client | New-client research: audience pain points, angles, TOF/MOF/BOF ad ideas, local competitor research. | Web research, Drive read/write. |
| Ads | Client | Plans ads, writes copy, reads results, recommends changes. Jake pushes everything live in Ads Manager himself. | Meta **read-only** (ad accounts, insights, creatives). Drive. |
| Creative | Client | Makes ad images and videos. | Higgsfield (images), HyperFrames (video, rendered on the PC). Drive (job photos in, finished creatives out). |
| Landing Page | Client | Conversion assets, websites, ad funnels. | Builds code here, deploys to our Cloudflare Pages. Every draft gets its own preview URL shown in the Building panel (real page, not a mock). Approve promotes that page to live. Jake pastes the embed into GHL (or the GHL Agent does it via a request). |
| GHL | Client | Pipelines, stages, custom values, funnels, etc. | GHL Marketplace app with whatever scopes it has (note: message write scopes still missing). Changes only when Jake asks in chat or approves a request. Never acts on its own. |
| Reporting | Client | Monthly results in plain English, explaining why numbers moved using what the other agents did. | Meta read, GHL read, other agents' work, Drive write. |

### Creative Agent replaces the Video Editor page (Jake, 2026-10-17)

The unbuilt `video-editor-page.md` plan is retired and folded in here. There is one PC watcher (the agent watcher), not two. What carries over:

- Edit real talking-head footage into FB ads in the Above All Garage Doors style. Same template for every client, with each client's own brand (vault Profile/Memory, Drive Photos folder, logo).
- Prior art lives in `C:\Users\games\Desktop\aag-video-ads\`: `template/build.mjs` (config to HyperFrames project, auto jump-cuts pauses over 0.45s, pinned `hyperframes@0.8.140`), `template/ads/*.json` configs (segments, zones, beats, overlays anchored to spoken phrases), `work/scripts/transcribe-all.ps1` (parakeet word timings), 9 finished projects. AAG raw footage is in the Drive folder named in `vault/Clients/Above All Garage Doors/Memory.md` (ignore `Raw Footage\Not needed`).
- Flow: pick a clip from the client's Drive footage folder, then proxy, transcribe, frame grabs, Claude drafts the config, low-res preview render, chat tweaks re-render, then a full-quality final. The MP4 plays and downloads in the app (and in Creatives on approval).
- Work and risks: generalise the template (brand as per-client data, Claude sets `zones` from frame grabs; regression check: rebuild AAG ad 5 and compare); `phrase not found` from `build.mjs` goes back to Claude for an automatic retry; previews and finals go in Supabase storage via signed URLs, with old previews pruned.
- Note: the old plan rejected headless Claude on the PC over chat lag. With `claude -p` as the runtime, chat speed is a known risk to watch in the first slice.

### Paid credits (Jake, 2026-10-17)

Before every paid generation (Higgsfield images or video, or any other credit-based tool), the Creative Agent shows the cost in credits on an approval card. Nothing is generated until Jake approves. No automatic spending.

## Brains (Obsidian vault)

Three levels, all markdown in the vault so Jake can read/edit them in Obsidian:

1. **Client brain**: `vault/Clients/<Name>/Brain.md` (or a `Brain/` folder if it grows). Shared by all agents at that client. Offers tested, angles, what won, what flopped, owner preferences.
2. **Agent brain**: `vault/Agents/<Agent>/Brain.md`. That agent's craft knowledge across all clients.
3. **Mega Brain**: everything connected across all clients and agents. The Manager reads and writes only this.

Rules:
- Agents save every lesson automatically, no approval. Each lesson records its source (client, agent, chat or data, date).
- Jake can edit or delete any lesson from the Brain tab (and in Obsidian).
- Cross-client use is reasoned, not automatic: a lesson from one client is a hint; one seen at many clients is a strong recommendation. The agent says why ("worked at 4 of 5 home service clients, Made Better is similar, so test it here").
- The app's Brain tab shows a synced copy (the web app cannot read the PC's files directly).

Brain tab UI (per mockup): Obsidian-style force graph (clients, agents, lessons as nodes; drag, zoom, hover highlights links), a scope switch (this client / this agent / Mega Brain; Manager sees Mega Brain only), then the lesson list with source and edit/delete.

## How it runs

- **Runtime: `claude -p` on Jake's PC**, on his Claude subscription. The app is the window.
- Flow: Jake sends a message in the app, it's stored, a watcher on the PC picks it up, runs `claude -p` for that agent, and the reply (and progress) streams back into the chat. Same pattern as the lead scraper runner and the planned Video Editor watcher.
- **Each agent is a fixed bundle**: its own instructions, its own allowed tools, plus the client brain + its agent brain (Manager: Mega Brain). The sidebar row picked decides the bundle. Each chat keeps its own Claude session so it remembers the conversation.
- **Offline**: the sidebar footer shows "Agents online on Jake's PC" from a watcher heartbeat. When offline, messages queue and run when the PC is back.
- **Monitoring**: runs when the PC starts up (all agents, all clients). Skips if the last run was under 6 hours ago (my call, to save the subscription). Findings post as chats tagged **Auto** in that agent, plus sidebar badges.
- **Usage limits**: the subscription has limits. If monitoring eats too much, move monitoring to the API and keep chats on `claude -p`. Not v1.
- **Access**: Drive read and write for every client folder and the agency SOPs (all in Google Drive), via the existing Composio Drive connection or the `G:` mount on the PC.

## Agents talking to each other

- Agents can read each other's work and send each other requests (e.g. Landing Page Agent, when a page goes live, asks the GHL Agent to put it in the right funnel).
- A request shows up in the receiving agent's chat as a **Request** card (from which agent, the ask, links), followed by the receiving agent's exact planned changes with **Approve / Change it / Decline**. It counts toward that agent's sidebar badge.
- Applies to every client.
- The sender does not wait; it keeps working.

## Where finished work goes

- Drafts stay in the agent's Building panel.
- On Jake's approval, work goes into the matching app page: creatives into **Creatives**, landing pages into **Conversion Assets**, reports into a new Reports page, etc. Add pages where none fit.
- Also saved to the client's Drive folder.

## UI (build exactly as the mockup)

- Admin console look: client strip, glass rail, Poppins/Inter, client-colour gradient on the active row, light and dark.
- Client rail: existing top rows, then **Agents** caption with the seven agents (badges = waiting approvals/requests, green dot = something live/active), then the existing Paid Ads, GHL, Management rows unchanged.
- Agency rail: **Agents** caption with Manager Agent. Its right panel is **Clients** (each client's status, next step, per-agent progress) and **Mega Brain**.
- Agent page: 248px chat list | chat | 420px right panel (520px on Brain). Chat shows "used from brain" chips, "learned" chips, tool steps, request cards and approval cards.
- Building cards per agent: status pill (Building, Needs your OK, Live, Done), steps, previews (thumbnails, live page window, stats).

## Left to the builder

- Database tables for agents, chats, messages, requests, approvals, heartbeats, and how vault brains sync to the app.
- Watcher design, session handling, streaming.
- Exact per-agent instructions and tool allowlists.
- Graph library (mockup uses d3-force).
- Order of build (suggest: shell + one agent end to end, then the rest).

## Decided by me (Jake to check)

- 6-hour minimum gap between startup monitoring runs.
- Preview links via Cloudflare Pages preview deploys, not localhost.
- Work goes into client-visible pages only after approval.
- `user_id` on chats now, for a future team.
- Willis colour in the mockup is a placeholder.
- **Mega Brain** = a computed view over every client brain and agent brain, plus the Manager's own notes in `vault/Agents/Manager/Brain.md`. The cross-client "seen at 4 of 5" counts come from that view, so they don't depend on the Manager running.
- **Landing pages** file into the existing Conversion Assets page and flow on approval. Each client gets one Cloudflare Pages project, with a preview deploy per draft.
- **Brain notes and git**: the watcher commits only brain files (`vault/**/Brain.md`, `vault/Agents/**`) as its own `brain:` commits, using an explicit path list, so Jake's work in the same checkout is never swept in.
- **Startup monitoring**: plain code pulls the numbers (Meta, GHL, checklists) first. Claude only runs for an agent where something changed or crossed a line. Not 7 agents x every client every time.
- **Meta and GHL access from the PC** goes through the app's own endpoints with an agent key. Tokens stay in Cloudflare and Meta read-only is enforced server-side. No credentials are copied onto the PC.

---

# Agents Implementation Plan (Phase 1: the platform)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Agents section end to end: all seven agents in the rail, real chats answered by `claude -p` on Jake's PC, Building cards with approvals, agent-to-agent requests, vault brains with the graph, and startup monitoring. Ads, Reporting and Manager get Meta read in this phase.

**Architecture:** The app (Cloudflare Pages Functions + Supabase) stores chats, messages, items and a mirror of the brains, and serves an agent-runner API behind one secret. A Node watcher on the PC (`projects/agent-runner`) claims queued messages, builds the agent bundle (instructions + brains), runs `claude -p` with a per-chat session, streams progress back, and is the only writer of the vault brain files. The UI copies `agents-v3.html` exactly.

**Tech Stack:** React + Vite + Tailwind (apps/command-center), Pages Functions, Supabase (`npm run db:migrate`), vitest, Node 24 ESM + TypeScript via tsx for the runner, Claude Code CLI 2.1.x, d3-force for the graph.

**Spec:** the design above in this same file, plus `.superpowers/brainstorm/559-1792256193/content/agents-v3.html`.

## Phases (each gets its own plan section when the previous one ships)

1. **Platform (this plan).** All seven agents chat, learn, monitor and send requests. Tools: vault, Drive (`G:` mount), Meta read (Ads, Reporting, Manager).
2. **Landing Page Agent tools.** Per-client CF Pages project, a preview deploy per draft shown in an iframe card, Approve promotes to live and files into Conversion Assets.
3. **Creative Agent tools.** Folded Video Editor pipeline (template generalisation, proxy, transcribe, preview/final render, Supabase storage) plus Higgsfield with credit-cost approval cards. Files into Creatives on approval.
4. **GHL Agent tools.** GHL writes through app endpoints, only from Jake's ask or an approved item. The Landing Page to GHL funnel request becomes real.
5. **Setup responsibilities.** SOP items owned per agent, ticked on Full Setup Checklist. Later, per Jake.

## Global Constraints

- Meta is read-only. No runner endpoint may call a Meta write. Enforced server-side, not by instructions.
- Nothing goes live, into a client-visible page, or into GHL without Jake's click on an item.
- No em dashes in any code, comment, UI text or agent output (instructions tell the agents; the runner strips U+2014 from replies as a backstop).
- No sub-text under headings. Labels are nouns. Reasoning goes in code comments.
- Every new `/api/admin/*` handler checks `ctx.data.admin` itself. The runner API lives outside `/api/admin/` at `/api/agent-runner/*` behind `AGENT_RUNNER_SECRET` (header `x-agent-runner-secret`, min length and `timingSafeEqual` exactly like `isAdsCronRequest` in `functions/lib/adsCron.ts`, exact paths only).
- Secret goes into Doppler `hauck-command-center`/`prd` and is bound with `cf-rebind --add`.
- Startup monitoring minimum gap: 6 hours. Runs only at watcher start (logon).
- Monitoring triggers (constants in `monitorRules.ts`): CPL moved 20% or more vs the last snapshot, frequency at or above 3.0, any lead in New over 48h, any checklist or account check changed.
- Agent ids, fixed: `manager`, `research`, `ads`, `creative`, `landing`, `ghl`, `reporting`.
- Brain paths: `vault/Clients/<Vault Folder>/Brain.md`, `vault/Agents/<Agent Name>/Brain.md` (Manager: `vault/Agents/Manager/Brain.md`).
- Lesson line format (Obsidian block ids): `- [YYYY-MM-DD] (<agent>, <source>) <text> ^l-<8 hex>`.
- Brain git commits: the runner commits only brain paths with an explicit pathspec, message `brain: <n> lessons (<agent>, <client>)`. Never `git add -A`.
- `RELEASES` entry in `src/lib/releaseNotes.ts` and blueprint update in the shipping commit.

## Review Focus

- **PC offline when Jake sends a message.** It stays `queued`, the chat shows it pending, the footer reads offline, and it runs when the runner returns. Tests: Task 3 (claim picks up messages queued with no heartbeat), Task 7 (`onlineLabel` at 90s).
- **Runner dies mid-reply.** A message left `running` with no update for 10 minutes goes back to `queued` on the next claim, same chat session. Test: Task 3 (`reclaimStale`).
- **Double click on Approve.** A second approve must not enqueue a second follow-up. Test: Task 4 (`transitionItem` double approve returns 409, no follow-up).
- **A lesson deleted in the app while the runner writes the same file.** Edits are queued and only the runner applies them, matched by block id. Test: Task 5 (`applyEdits` on a file that gained lines after the edit was queued).
- **Agency Manager chat with no client.** `tenant_id` null must not pull in client chats or items. Test: Task 4 (agency scope filter returns only `tenant_id is null` rows).

---

### Task 1: Data model (migration 0166)

**Files:**
- Create: `apps/command-center/supabase/migrations/0166_agents.sql`

**Interfaces:**
- Produces (each `enable row level security`, no policies, service client only, like 0161):
  - `agent_chats(id uuid pk default gen_random_uuid(), tenant_id uuid null references public.tenants on delete cascade, agent text not null check (agent in the 7 ids), user_id uuid null, title text not null default 'New chat', auto boolean not null default false, claude_session_id uuid not null default gen_random_uuid(), started boolean not null default false, created_at, updated_at)`; index `(tenant_id, agent, updated_at desc)`.
  - `agent_messages(id uuid pk, chat_id uuid references agent_chats on delete cascade, role text check in ('me','ai','request'), body text not null default '', meta jsonb not null default '{}', status text check in ('queued','running','done','error') default 'done', host text, error text, created_at, started_at, finished_at, updated_at)`; partial index `(created_at) where status = 'queued'`.
  - `agent_items(id uuid pk, tenant_id uuid null, agent text, chat_id uuid null, from_agent text null, kind text, title text, status text check in ('building','needs_ok','live','done','declined'), payload jsonb default '{}', approved_at timestamptz, created_at, updated_at)`.
  - `agent_lessons(id text pk, scope text check in ('client','agent','manager'), tenant_id uuid null, agent text, text text, source text, learned_on date, synced_at timestamptz)`.
  - `agent_lesson_edits(id uuid pk, lesson_id text, action text check in ('edit','delete'), text text null, status text check in ('queued','applied') default 'queued', created_at)`.
  - `agent_runner_state(host text pk, last_seen_at timestamptz, last_monitor_at timestamptz)`.
  - `updated_at` trigger on chats, messages and items, reusing the trigger function 0124 uses.

- [ ] **Step 1:** Write the migration, idempotent, header comment in the 0165 style.
- [ ] **Step 2:** `npm run db:migrate` in `apps/command-center`. Expected: 0166 applied, no error.
- [ ] **Step 3:** Commit `feat(agents): tables for chats, messages, items, lessons`.

### Task 2: Agent registry + rail

**Files:**
- Create: `apps/command-center/src/lib/agents.ts`, `apps/command-center/src/lib/agents.test.ts`
- Modify: `apps/command-center/src/lib/clientNav.ts` (page id `"agent"`, sub = agent id, Agents group), `apps/command-center/src/lib/clientNav.test.ts`, `apps/command-center/src/routes/admin/AdminLayout.tsx` (agency rail Agents group with Manager), `apps/command-center/src/components/admin/clientRowIcons.ts`

**Interfaces:**
- Produces `type AgentId = "manager" | "research" | "ads" | "creative" | "landing" | "ghl" | "reporting"`; `AGENTS: { id: AgentId; name: string }[]` in rail order Manager, Market Research, Ads, Creative, Landing Page, GHL, Reporting, each name ending " Agent"; `isAgentId(s: string): s is AgentId`; `agentPath(tenantId: string | null, agent: AgentId): string`.
- `clientNavGroups` gains `{ caption: "Agents", rows }` right after the Accounts/Info/Software group. Other groups unchanged.

- [ ] **Step 1:** Tests: the 7 ids in order; `agentPath(null, "manager") === "/admin/agents/manager"`; `agentPath("t1", "ads") === "/admin/client/t1/agent/ads"`; Agents is the third group with 7 rows; `resolveClientPage` keeps `agent/ads` and sends `agent/nope` to `agent/manager`.
- [ ] **Step 2:** `npx vitest run src/lib/agents.test.ts src/lib/clientNav.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. lucide-react icons: Gauge, Telescope, Megaphone, Clapperboard, LayoutTemplate, Workflow, FileChartColumn.
- [ ] **Step 4:** Tests PASS, `npm run typecheck` clean.
- [ ] **Step 5:** Commit `feat(agents): registry and Agents rail group`.

### Task 3: Runner API (the PC side of the wire)

**Files:**
- Create: `apps/command-center/functions/lib/agentRunner.ts` (+ `.test.ts`); handlers in `apps/command-center/functions/api/agent-runner/`: `claim.ts`, `reply.ts`, `heartbeat.ts`, `item.ts`, `lessons.ts`, `snapshot.ts`, `meta.ts`
- Modify: `apps/command-center/functions/api/_middleware.ts` (gate after the cold-call gate, same comment style), `apps/command-center/functions/lib/env.ts` (`AGENT_RUNNER_SECRET?: string`)

**Interfaces:**
- `isAgentRunnerRequest(method: string, pathname: string, header: string | null | undefined, secret: string | null | undefined): boolean`. POST for all paths except GET `snapshot` and `meta`.
- `POST claim {host}` returns `{ message, chat, history, tenant: { id, name, slug, metaAdAccountId } | null } | null`. First `reclaimStale(host, 600)` puts this host's `running` messages with no update for 600s back to `queued`. Then claims the oldest queued `me` message with a status-filtered PATCH as the lock (the `claim_next_run` pattern in `projects/lead-scraper/store.py`).
- `vaultFolder` comes from the runner, not the app: `projects/agent-runner/src/clients.ts` holds `VAULT_FOLDERS: Record<tenantSlug, string>` (e.g. Willis to `Willis Windows`, Made Better to `Made Better LC`) and the claim response only carries `slug`. An unmapped client gets a folder named after `tenants.name`, created on first lesson.
- `POST reply {messageId, status: "running" | "done" | "error", aiBody?, tools?: string[], used?: string[], learned?: string[], title?, error?}` upserts the paired `ai` message (`meta.tools/used/learned`), sets the chat title on the first reply, marks `started`.
- `POST item {id?, tenantId, agent, chatId?, fromAgent?, kind, title, status, payload}` upserts. With `fromAgent`, it also inserts a `request` message into the newest chat of `agent` for that tenant (creating one titled from the item if none).
- `POST lessons {scopes: {scope, tenantId, agent}[], lessons: AgentLesson[], appliedEditIds: string[]}` replaces the mirror for those scopes and marks the edits applied.
- `POST heartbeat {host, monitored?: boolean}` returns `{ lastMonitorAt: string | null, queuedEdits: { id, lessonId, action, text }[] }`.
- `GET snapshot?tenant=` returns `{ cpl, frequency, leads7d, stuckNewOver48h, checklistDone, checklistTotal, accountsRed }` built from the existing `adsCore`, `clientAccounts` and SOP checklist libs.
- `GET meta?tenant=&level=account|campaign|ad&days=` read-only insights through `metaGraph` GET helpers.

- [ ] **Step 1:** Tests in `agentRunner.test.ts`: the gate accepts exact path + right secret, rejects a prefix path, a short secret, the wrong method; `reclaimStale` selects only this host's stale rows; a source scan of `functions/api/agent-runner/meta.ts` asserts it imports none of `metaActions`, `metaUpload`, `metaLeadForm`, `metaCapi`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS, typecheck clean.
- [ ] **Step 5:** Doppler: add `AGENT_RUNNER_SECRET` (64 hex chars), then `cf-rebind --add AGENT_RUNNER_SECRET`.
- [ ] **Step 6:** Commit `feat(agents): runner API behind its own secret`.

### Task 4: Admin API (what the page calls)

**Files:**
- Create in `apps/command-center/functions/api/admin/agents/`: `chats.ts` (GET list, POST new), `chats/[chatId].ts` (GET messages, POST message), `items.ts` (GET), `items/[itemId].ts` (PATCH), `lessons.ts` (GET mirror, POST edit/delete), `status.ts` (GET). Plus `apps/command-center/functions/lib/agentItems.ts` (+ `.test.ts`).

**Interfaces:**
- `GET chats?tenant=<uuid|agency>&agent=` returns `{ id, title, auto, hasRequest, lastLine, updatedAt }[]`. `tenant=agency` means `tenant_id is null`, via `scopeFilter(tenant: string): { column: "tenant_id"; op: "is" | "eq"; value: string | null }`.
- `POST chats/:id {body}` inserts a `me` message with status `queued`, returns it.
- `PATCH items/:id {action: "approve" | "decline" | "change", note?}` through `transitionItem(status: ItemStatus, action, note?): { next: ItemStatus; followUp: string | null } | { error: 409 }`. Approve only from `needs_ok`, followUp `Approved: <title>`. Decline from `needs_ok` gives `declined`, followUp `Declined: <title>`. Change keeps `needs_ok`, followUp is the note. Anything else is 409.
- `GET status` returns `{ online: boolean, lastSeenAt: string | null }`, online when the newest heartbeat is under 90s old.

- [ ] **Step 1:** Tests: `transitionItem` for each action, a double approve gives 409 and no followUp; `scopeFilter("agency")` gives `is null`, a uuid gives `eq`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + typecheck.
- [ ] **Step 5:** Commit `feat(agents): admin endpoints for chats, items, lessons`.

### Task 5: PC runner

**Files:**
- Create in `projects/agent-runner/`: `package.json` (tsx, vitest), `src/main.ts` (3s poll loop, `--once` flag), `src/api.ts`, `src/bundle.ts` (+ test), `src/claude.ts` (+ test with a recorded stream-json fixture in `test/fixtures/`), `src/output.ts` (+ test), `src/brain.ts` (+ test), `src/git.ts` (+ test), `bin/meta.mjs`, `agents/<id>.md` x7, `install-watcher.ps1` (adapted from `projects/lead-scraper/install-watcher.ps1`, task name "Hauck agent runner", starts at logon, restarts on exit), `README.md`. Secret read from Doppler at start.

**Interfaces:**
- `buildBundle(agent: AgentId, tenant: Tenant | null): { systemPromptFile: string; allowedTools: string[]; addDirs: string[] }`. The prompt file is `agents/<id>.md` + client Brain + agent Brain (Manager: its Brain + every Brain file's lessons) + the house rules + the output protocol. `allowedTools` includes `Bash(node bin/meta.mjs:*)` only for ads, reporting, manager. `addDirs` = the vault and the client's `G:` Drive folder.
- Output protocol: the agent ends its reply with optional fenced blocks: ` ```lessons ` (one lesson per line), ` ```item ` (JSON `ItemDraft`), ` ```request ` (JSON `{ toAgent, title, body, plan: string[] }`).
- `runClaude(opts: { sessionId: string; resume: boolean; prompt: string; bundle: Bundle; onProgress: (text: string, tools: string[]) => void }): Promise<{ text: string; tools: string[] }>`. Spawns `claude -p --output-format stream-json --verbose --append-system-prompt-file <f> --allowedTools <...> --add-dir <...>` plus `--session-id <id>` on the first turn and `--resume <id>` after. Progress posts are throttled to one every 1.5s.
- `parseAgentOutput(text: string): { reply: string; lessons: string[]; items: ItemDraft[]; requests: RequestDraft[] }`. Strips the blocks and any U+2014 from `reply`.
- `appendLessons(file: string, agent: AgentId, source: string, lines: string[], today: string): AgentLesson[]`; `readLessons(file: string): AgentLesson[]`; `applyEdits(file: string, edits: LessonEdit[]): string[]` returns the applied ids and matches lines by `^l-` id only.
- `commitBrains(paths: string[], summary: string): Promise<boolean>` runs `git add -- <paths>` and `git commit -m <msg> -- <paths>`, returns false when nothing changed.

- [ ] **Step 1:** Tests: the ads bundle allows the meta script and the ghl, landing and creative bundles do not; the stream-json fixture parses into text + tool names; `parseAgentOutput` with all three blocks, none, and malformed JSON (dropped, reply kept); append then delete by id after another line was appended; `commitBrains` passes an explicit pathspec and never `-A`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Keep the agent instruction files short, from the design's agents table.
- [ ] **Step 4:** `npx vitest run` in `projects/agent-runner`. Expected: PASS.
- [ ] **Step 5:** Smoke: queue a message in a throwaway Willis Ads chat, run `npx tsx src/main.ts --once`. Expected: an `ai` reply lands, a lesson is appended to `vault/Clients/Willis Windows/Brain.md`, and a `brain:` commit exists.
- [ ] **Step 6:** `.\install-watcher.ps1`, then `.\install-watcher.ps1 -Status` shows Running.
- [ ] **Step 7:** Commit `feat(agents): PC runner`.

### Task 6: Brains on disk

**Files:**
- Create: `vault/Agents/<Name>/Brain.md` x7 (frontmatter `agent: <id>`, a `## Lessons` heading), `vault/Clients/<folder>/Brain.md` for Above All Garage Doors, Made Better LC, Willis Windows, and a new `vault/Clients/Clear Choice Windows/` folder.
- Modify: `vault/README.md` (one line on Brain.md files).

- [ ] **Step 1:** Create the files. **Step 2:** `npx tsx src/main.ts --once --sync-lessons` mirrors them (0 lessons, no error). **Step 3:** Commit `docs(vault): brain notes per client and agent`.

### Task 7: Agent page UI

**Files:**
- Create in `apps/command-center/src/components/admin/agents/`: `AgentPage.tsx`, `ChatList.tsx`, `ChatThread.tsx`, `BuildPanel.tsx`, `ItemCard.tsx`, `RequestCard.tsx`, `agentApi.ts`. Plus `apps/command-center/src/lib/agentView.ts` (+ `.test.ts`).
- Modify: `apps/command-center/src/routes/admin/ClientPage.tsx` (`case "agent"`), `apps/command-center/src/App.tsx` (route `/admin/agents/:agent` for the agency Manager), `AdminLayout.tsx` (rail footer "Agents online on Jake's PC" or "Agents offline").

**Interfaces:**
- `groupChats(chats, now: Date): { label: "Today" | "This week" | "Earlier"; chats }[]`, `messageView(msg)` (used, learned and tools chips), `onlineLabel(status, now)`.
- Polls messages every 2s while any message in the chat is `queued` or `running`, else every 15s.
- Layout and classes from `agents-v3.html`: 248px chat list, chat, 420px panel (520px on Brain); tabs Building and Brain (agency Manager: Clients and Mega Brain); request card; approval card with Approve, Change it, Decline; Auto and Request tags; the sidebar badge counts `needs_ok` items.

- [ ] **Step 1:** Tests: `groupChats` at the local-midnight and 7-day boundaries; `messageView` chip mapping; `onlineLabel` online at 89s, offline at 91s.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + typecheck.
- [ ] **Step 5:** Playwright screenshots, light and dark, of Willis > Ads Agent and the agency Manager on `npm run dev`, next to the mockup. Jake checks them.
- [ ] **Step 6:** Commit `feat(agents): agent page`.

### Task 8: Brain tab + graph

**Files:**
- Create: `apps/command-center/src/components/admin/agents/BrainTab.tsx`, `BrainGraph.tsx`, `apps/command-center/src/lib/brainGraph.ts` (+ `.test.ts`)
- Modify: `apps/command-center/package.json` (add `d3-force`, `d3-zoom`, `d3-drag`, `d3-selection`, exact versions)

**Interfaces:**
- `graphFor(lessons: AgentLesson[], clients, agents, scope: "client" | "agent" | "mega", ctx: { tenantId: string | null; agent: AgentId }): { nodes; links }`. One node per client and agent in scope, one per lesson, linked to its client (if any) and its agent. In mega, Manager links to every client.
- The lesson list's pencil and trash post to `/api/admin/agents/lessons`. An edited lesson reads "Saving" until the mirror shows the edit applied.

- [ ] **Step 1:** Tests: client scope has exactly one client node, mega has all of them, no link points at a missing node.
- [ ] **Step 2:** FAIL. **Step 3:** Implement with the mockup's force settings (link distance 46, charge -120, collide r+10, hover dims others to 0.2). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(agents): brain graph`.

### Task 9: Startup monitoring

**Files:**
- Create: `projects/agent-runner/src/monitor.ts`, `src/monitorRules.ts` (+ `.test.ts`)
- Modify: `projects/agent-runner/src/main.ts` (on start: heartbeat, then the monitor if due). The last snapshot per tenant is kept in `projects/agent-runner/data/snapshots.json` (gitignored).

**Interfaces:**
- `shouldRunMonitor(lastMonitorAt: string | null, now: Date): boolean` (6 hours).
- `planMonitor(tenants, prev: Record<string, Snapshot>, next: Record<string, Snapshot>): { tenantId: string; agent: AgentId; reason: string }[]` using the trigger constants: ads for CPL and frequency, ghl for stuck leads, manager for checklist and accounts changes.
- Each plan row creates an `auto` chat for that agent with a queued message `Startup check: <reason>`.

- [ ] **Step 1:** Tests: `shouldRunMonitor` false at 5h59m, true at 6h and on null; `planMonitor` fires each trigger alone and returns nothing when nothing moved.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3:** Restart the watcher task. Expected: Auto chats only where a trigger fired and `last_monitor_at` set; a second restart inside 6h creates none.
- [ ] **Step 4:** Commit `feat(agents): startup monitoring`.

### Task 10: Ship

- [ ] **Step 1:** `RELEASES` entry `2026-10-xx-agents`, title "Agents", items for chat, Building and Brain. Blueprint NODES/GAPS updated.
- [ ] **Step 2:** `npm run typecheck && npm test` in `apps/command-center`, `npx vitest run` in `projects/agent-runner`. All green; paste the counts.
- [ ] **Step 3:** `code-review`, `simplify`, `security-review` (secret gate, Meta read-only, no secrets in the runner repo).
- [ ] **Step 4:** Push main, watch the CF deploy, smoke app.hauckmarketing.com: Willis > Ads Agent, send "What did CPL do this week?". Expected: a reply with real Meta numbers.
- [ ] **Step 5:** Keep this doc (Phases 2 to 5 still pending). Append Jake's owed items to his action items.

## Jake owes after Phase 1

1. Open Willis > Ads Agent and send one real message.
2. Check that one lesson shows up in `vault/Clients/Willis Windows/Brain.md` in Obsidian.
3. Restart the PC once and confirm Auto chats only appear where something moved.

---

# Phases 2 to 4 (run as three parallel lanes once Phase 1 is merged)

Same header rules as Phase 1: Global Constraints and the wire types in `src/lib/agentWire.ts` apply to every task below. Each lane branches from the merged Phase 1 commit. File ownership is split so the lanes never edit the same file, except each adding its own lines to `projects/agent-runner/src/bundle.ts` (merge by hand; each lane only touches its own agent's branch of the switch).

## Cross-lane rule: enforcement lives in code

Every gate Jake set is enforced by the runner or the server, never only by the agent's instructions:

- **Approval-gated tools.** `buildBundle` gains a third argument, `grant: Grant | null`, read from the claimed message's `meta.grant`. A grant exists only on a follow-up message created by `PATCH items/:id approve`, which copies `{ itemId, kind, limit }` from the item's payload into the follow-up's meta. Gated tools are added to `allowedTools` only when a matching grant is present.
- **Server-side checks.** Any runner endpoint that changes something outside the app (deploy promote, GHL write, Creatives filing) takes `messageId` and checks on the server: the message is `running`, belongs to the right agent's chat, and either carries a matching approved grant or (GHL only) is a direct ask from Jake (`role = 'me'`, chat not `auto`, no `meta.fromRequest`).

DONE by the lead in `73383b63` before the lanes started (so no lane owns it): `Grant`/`GrantKind` in `agentWire.ts` and the runner's `src/wire.ts`, `AgentMessage.followUpOf` and `AgentMessage.grant`, `grantFrom(item)` in `agentItems.ts`, and `decideItem` putting `{ followUpOf, grant }` on the follow-up's meta (grant only on Approve). Original wording, for reference: `transitionItem` in `functions/lib/agentItems.ts` copies `payload.grant` into the follow-up message meta on approve; `ClaimResponse.message` already carries `meta` via `AgentMessage` once Lane 2 adds `grant: Grant | null` to `AgentMessage` in `agentWire.ts` (type `Grant = { itemId: string; kind: "deploy" | "spend" | "ghl" | "file"; limit: number | null }`). Lanes 3 and 4 code against that type from the start.

---

## Phase 2: Landing Page Agent tools (Lane 2)

**Goal:** the Landing Page Agent builds a page as code, deploys each draft to its own Cloudflare preview URL, shows it live in the Building card, and on Approve promotes it and files it into Conversion Assets.

**Files:**
- Create: `projects/agent-runner/src/pages.ts` (+ test), `projects/agent-runner/sites/` (gitignored working dirs, one per client slug)
- Modify: `projects/agent-runner/src/bundle.ts` (landing branch), `projects/agent-runner/agents/landing.md`
- Create: `apps/command-center/supabase/migrations/0167_followup_external_url.sql` (adds `external_url text` to `followup_pages`)
- Create: `apps/command-center/functions/api/agent-runner/file-asset.ts` (+ gate path)
- Modify: `apps/command-center/functions/lib/agentItems.ts`, `src/lib/agentWire.ts` (`Grant`), the Conversion Assets list in `src/components/admin/cockpit/ghl/ConversionAssetPanel.tsx` (an asset with `external_url` shows as a link card with the live URL; the builder steps stay for the rest), `src/components/admin/agents/ItemCard.tsx` (iframe preview card for `payload.previewUrl`, "Approve and go live" and "Open full size")

**Interfaces:**
- CF project per client: `hm-<slug>` (my call). Draft deploy: `npx wrangler pages deploy <dir> --project-name hm-<slug> --branch d-<itemId8>` gives `https://d-<itemId8>.hm-<slug>.pages.dev`. Promote: the same dir with `--branch main`. Wrangler uses the PC's existing wrangler login (same as the ads-cron worker deploys); `ensureProject(slug)` runs `wrangler pages project create` once.
- `deployDraft(slug: string, itemId: string, dir: string): Promise<{ previewUrl: string }>`, `promote(slug, dir): Promise<{ liveUrl: string }>`, `parseDeployUrl(stdout: string): string | null`.
- Flow: the agent writes files under `sites/<slug>/<itemId>/`, then emits an ```item block; the runner (not the agent) runs `deployDraft` and posts the item as `needs_ok` with `payload: { previewUrl, dir, grant: { kind: "deploy" } }`. Approve gives a follow-up with the grant; the runner sees `grant.kind === "deploy"`, runs `promote`, then calls `POST /api/agent-runner/file-asset {messageId, tenantId, title, liveUrl}`, which inserts a `followup_pages` row with `external_url`, then sets the item `live`.
- `wrangler` is never in the agent's `allowedTools`. Only the runner deploys.
- As built (Lane 2): the agent writes `site/<name>/` in its own work folder and files a card with `payload.site`. The runner copies a static-only snapshot to `projects/agent-runner/data/sites/<slug>/<itemId>/` (gitignored with `data/`; no `_worker.js`, `functions/`, `_redirects`, `_headers`), deploys that snapshot, and promotes the same snapshot on Approve, so the agent cannot change a page after Jake saw it. Wrangler runs in the empty `data/pages-cwd/`. `file-asset` also stores the card title (0167 adds `title` beside `external_url`) and checks the live URL is the approved preview's own project. Agent-written deploy grants are dropped by the runner.

- [ ] Tests: `parseDeployUrl` on recorded wrangler stdout (record one real draft deploy of a hello page to a throwaway project, then delete that project); `bundle("landing")` does not allow wrangler; `file-asset` refuses a message with no deploy grant (409) and a message from another agent (403).
- [ ] Migration 0167, `npm run db:migrate`.
- [ ] Implement, tests green, typecheck clean, `vite build` clean.
- [ ] Live check on Clear Choice: ask the agent for a one-section test page, preview card loads the real URL, Approve, the asset appears in Conversion Assets with the live URL. Delete the test asset afterwards.

## Phase 3: Creative Agent tools (Lane 3)

**Goal:** the Creative Agent edits clients' talking-head footage into ads in the AAG style and makes Higgsfield images and video, with the credit cost on an approval card before every paid generation. Approved work files into Creatives.

**Files:**
- Create: `projects/agent-runner/video/` (moved from `C:\Users\games\Desktop\aag-video-ads\template\`: `build.mjs`, `style.css`, `extra.css`, `sfx/`; brand assets come from per-client data, not the folder), `projects/agent-runner/video/brand.ts` (+ test), `projects/agent-runner/src/video.ts` (+ test: proxy, transcribe, frames, build, render), `projects/agent-runner/src/spend.ts` (+ test)
- Modify: `projects/agent-runner/src/bundle.ts` (creative branch), `projects/agent-runner/agents/creative.md`
- Create: `apps/command-center/functions/api/agent-runner/upload-url.ts` (signed upload URL into the `ad-creatives` bucket at `newPath(tenantId, ext)`), `apps/command-center/functions/api/agent-runner/file-creative.ts` (calls `recordAdCreative`)
- Modify: `src/components/admin/agents/ItemCard.tsx` (spend card: credits, what it makes, Approve; video card: player for `payload.previewUrl`)

**Interfaces:**
- `Brand = { name, logoPath, photosDir, ownerName, rating, cta, colors }` from vault Profile/Memory plus the client's Drive Photos folder. `brandFor(slug): Brand`.
- Video pipeline (from the folded Video Editor plan): `proxy(src)`, `transcribe(proxy)` (`hyperframes transcribe --engine parakeet --json`), `frames(proxy, n)`, `buildProject(config, brand)` with `hyperframes@0.8.140` pinned, `render(project, "preview" | "final")`. `phrase not found` from `build.mjs` goes back to the agent once as a retry prompt.
- Regression gate: rebuilding AAG ad 5 from its config with the generalised template must match the original output's frame count and duration exactly, and a frame grab at 3s must be pixel-identical (my call for "identical").
- Credit gate: Higgsfield generate tools (`mcp__higgsfield__generate_image`, `generate_video`, `generate_image_batch`, `generate_video_batch`, `ads_studio_generate`, `execute_preset`) are in `disallowedTools` unless the grant is `{ kind: "spend", limit }`. Quote tools (`ads_studio_quote`, `balance`, `models_explore`) are always allowed. The agent quotes first and emits an item with `payload: { credits, what, grant: { kind: "spend", limit: credits } }`. After the approved turn, the runner reads balance before and after; if spend exceeds `limit`, it posts an error reply and an item flagged for Jake. `checkSpend(before, after, limit): "ok" | "over"`.
- Filing: approved finals and images upload through `upload-url`, then `file-creative {messageId, tenantId, path, kind, name}` needs a `{ kind: "file" }` grant on a Creatives item.

- [ ] Tests: `brandFor` on the AAG vault notes; `bundle("creative", t, null)` disallows every generate tool and `bundle("creative", t, spendGrant)` allows them; `checkSpend`; `file-creative` refuses without a file grant.
- [ ] Template move and the AAG ad 5 regression check (run it, paste frame count, duration, pixel diff).
- [ ] Implement, tests green.
- [ ] Live check on AAG: one clip to preview to final, filed to Creatives after Approve; one Higgsfield image with the cost card approved. Jake sees the credits before anything is spent.

## Phase 4: GHL Agent tools (Lane 4)

**Goal:** the GHL Agent makes changes in a client's sub-account through the Marketplace app, only on Jake's direct ask or an approved request, and the Landing Page to GHL handoff works end to end.

**What the GHL API can and cannot do (check live before building; see feedback "check live GHL first"):** the app's scopes (`functions/lib/ghlApp.ts` `APP_SCOPES`) cover custom values, custom fields, tags, contacts, opportunities and calendar events. There are no message write scopes yet (Jake owes that reinstall). GHL's public API has no funnel-page or pipeline-stage creation that I can confirm. So for "put this page in the Winter funnel" the agent does what the API allows (custom value with the live URL, tags) and posts the rest as an exact click-by-click checklist in its approval card. Confirm at kickoff with one live read; if a stage or funnel endpoint does exist, add it to the allowlist.

**Kickoff live read, 2026-10-17 (read-only, Willis `OznT3yyuwK3dqVXDsCaD`, public API with the Willis PIT):**
- Pipelines (4): Sales Pipeline (Lead > No Answer > Estimate Booked > Job Booked > Job Completed > Job/Estimate Cancelled > Lost > Follow Up > Long Term Nurture), Organic (Chat Widget > Estimate Form), Google Reviews (Asked For Review > Review Link Clicked > Negative Feedback Received > Positive Review Submission), News Channel (Opt In > Contacted > Booked Them In).
- Custom values: 36, including the owner links (Call Now Link, Lead Outcome Link, Phone Appointment Call Now Link), Conversion Asset Offer / Owner Story / Unique Mechanism / Recent Work (empty), and two that hold credentials in plain text (Location API Token, Facebook Access Token). So `read.customValues` hides any value whose name says token, secret, password or key, and `write.customValue` refuses those names and the app's Open Lead.
- API reach, from GHL's own OpenAPI specs (https://github.com/GoHighLevel/highlevel-api-docs, `apps/opportunities.json` and `apps/funnels.json`; human docs at https://marketplace.gohighlevel.com/docs/): **no pipeline or stage create/update** (opportunities has only `GET /opportunities/pipelines`), and **no funnel or funnel page create** (funnels has only list funnels, list pages, count pages, and redirect create/update/delete). The app has no `funnels/*` scope either, so funnels are not even readable. Confirmed: stages and funnel pages are Jake's clicks, from the checklist on the card. A funnel redirect (`POST /funnels/lookup/redirect`, scope `funnels/redirect.write`) could point a funnel path at the live page later; not added (new scope = reinstall).

**Files:**
- Create: `apps/command-center/functions/api/agent-runner/ghl.ts` (+ test), `apps/command-center/functions/lib/agentGhlOps.ts` (+ test)
- Create: `projects/agent-runner/bin/ghl.mjs` (calls the endpoint; the agent runs it through Bash)
- Modify: `projects/agent-runner/src/bundle.ts` (ghl branch), `projects/agent-runner/agents/ghl.md`, `projects/agent-runner/agents/landing.md` (on going live, send a request to ghl with the live URL)

**Interfaces:**
- `GHL_OPS` allowlist, each op a typed function on top of `functions/lib/ghl.ts` and the tenant's app token: `read.pipelines`, `read.customValues`, `read.customFields`, `read.calendars` (always allowed); `write.customValue {key, value}`, `write.customField {name, type}`, `write.tag {contactId, tag}`, `write.moveOpportunity {opportunityId, pipelineId, stageId}` (gated).
- `POST /api/agent-runner/ghl {messageId, tenantId, op, args}`: reads run if the message belongs to a ghl chat for that tenant. Writes need `writeAllowed(message, chat, item?)` true: either a direct ask (role `me`, chat not auto, no `meta.fromRequest`) or an approved grant `{ kind: "ghl" }`. Every write is logged with `logAdminAction` as `agent:ghl`.
- `bin/ghl.mjs` is the only GHL path in the ghl bundle; no other agent gets it.

- [x] Tests: `writeAllowed` for direct ask (true), auto chat (false), request follow-up without approval (false), with approval (true); an unknown op gives 400; the ghl bundle allows `bin/ghl.mjs` and no other bundle does.
- [x] Kickoff live read with the `ghl` CLI on Willis (`OznT3yyuwK3dqVXDsCaD`): pipelines, custom values. Record what exists before building.
- [x] Implement, tests green.
- [ ] Live check: on Willis, ask the GHL Agent to set one harmless custom value, Approve, confirm it in GHL, then set it back. Then the full handoff: a Landing Page approval sends a request, the GHL card shows the plan, Approve, the custom value holds the live URL.

## Merge order and ship

1. Lane 2 first (it owns the shared `Grant` change), then Lanes 3 and 4 rebase on it.
2. Full test run in both packages, `code-review`, `security-review` (grants, server-side checks, no tool bypass), release note per phase, push, deploy, live checks above.
3. Jake owes: one approved landing page, one approved video, one approved Higgsfield spend, one approved GHL change.

---

## Phase 6: Client Brief (Jake, 2026-10-17; after Phases 2 to 4 ship)

**What:** one living brief per client, shared by every agent, with one section per agent (Market Research, Ads, Creative, Landing Page, GHL, Reporting; Manager gets a short "Status" section). It opens beside the chat on every agent page. Jake edits it directly; agents edit only their own section and see Jake's edits on their next turn. Saved per client and synced to the client's Google Drive folder.

**Decided (Jake):**
- One document per client, sub-sections per agent.
- Layout B (picked 2026-10-17 from `.superpowers/brainstorm/559-1792256193/content/agents-brief.html`): the chat list shrinks to icons, the brief takes the right half beside the chat, Building and Brain become tabs above it. The current agent's section is highlighted; each section shows who last edited it; pencil to edit; Saved to Drive chip.
- Jake can edit any section; the agent sees his edits and builds on them, never overwrites them blindly.
- Synced to Google Drive.
- ALSO a Brief page per client (Jake, 2026-10-17): a sidebar row "Brief" (client rail, top group under Client Information), laid out like Google Docs tabs: a left tab list with "All" (the whole brief) and one tab per agent section; the main area shows the selected tab, editable. Same document as the side panel on agent pages; editing either updates both.

**My calls (Jake to check at kickoff):**
- Brief vs brain: the brain is a list of short lessons; the brief is the polished, current summary you would hand to someone.
- Storage: `client_briefs` table (tenant, section per agent, markdown, version, updated_by, updated_at). Each save bumps `version`; an agent's write must name the version it read, and a stale write is refused and retried on the fresh text, so Jake's edits are never lost.
- The agent gets the whole brief in its prompt and emits a ```brief block with its new section; the runner posts it. Agents cannot write another agent's section (server-side check).
- Drive: one Google Doc per client at `<client Drive folder>/Brief`, rewritten in place on every save (link never changes), via the existing Composio Drive connection.
- Editor: plain markdown textarea with a rendered view, per section, autosave; no rich text in v1.

**As built (Phase 6 lane, 2026-10-17):**
- Migration `0168_client_briefs.sql`: `client_briefs` (pk tenant + section, body, version, updated_by, updated_at) and `client_brief_drive` (doc id/url, revision synced, last error). RLS on, no policies.
- Sections are the seven agent ids, Status (Manager) first. A save names the version it read; the update filters on that version, so a stale save matches nothing and gets 409 with the current section (`functions/lib/clientBriefs.ts`).
- Admin `GET/PUT /api/admin/agents/brief?tenant=` (owner only). Runner `POST /api/agent-runner/brief {messageId, body, version}`: the section is the claimed message's chat's agent, read on the server; the agency Manager has no brief (403). The claim carries the whole brief (`withBrief`).
- Runner: the agent ends with a ```brief block (its whole section); the runner posts it at the version from the claim. A 409 puts a note in the reply for Jake and a note for the agent's next turn in that chat (`data/brief-notes/<chatId>.txt`). The brief is in the prompt as notes, never instructions.
- Drive: `lib/briefDrive.ts` after every save (waitUntil): finds or creates a Google Doc "Brief" in the client's `client_folders` folder (Drive metadata create through Composio), then replaces its body with one Docs `batchUpdate` (delete, insert, heading styles). Same doc id every time. It re-reads the brief after each write and writes again if a save landed meanwhile (3 passes max). Failures land in `client_brief_drive.error` and on the chip. Proven live 2026-10-17 on a throwaway Doc in My Drive (create, two rewrites, same id, deleted).
- UI: layout B on every client agent page (icon chat list, Brief | Building | Brain at half width; the agency Manager keeps the old frame). Client rail row "Brief" under Client Information, Docs-style tab list (All + one per section). Autosave after 1s; a newer copy under unsaved text shows the newer text and keeps the draft aside with Use mine / Keep theirs (`lib/briefDraft.ts`).
- Editor (Jake, 2026-10-17: "just like a Google Doc"): Tiptap 2.27.3 (starter-kit, underline, link, placeholder; quotes, code blocks, rules and strike off), a white page with one sticky toolbar (undo, redo, Normal text / Heading 1-3, bold, italic, underline, link, bulleted and numbered lists), each section its own editor under its heading. Storage stays markdown through `lib/briefMarkdown.ts` (bold `__x__`, italic `*x*`, underline `<u>x</u>`; reads `**x**` and `_x_` too), round-trip tested and checked against the real editor schema (`briefExtensions.test.ts`). The editor reloads only on an outside change (`external` in briefDraft), never on Jake's typing. The Drive Doc is written from the same parser, marks taken out.

---

## Phase 7: Ads Agent writes to Ads Manager (Jake, 2026-10-17)

**Reverses "Meta is read-only forever".** Jake: the Ads Agent may change Ads Manager, but only with his approval.

**Decided (Jake):**
- Scope "controls plus": pause and resume campaigns, ad sets and ads; change daily budgets; create new ads inside an EXISTING ad set from approved creatives in the client's Creatives. No new campaigns, ad sets, audiences or targeting.
- Every change needs Jake's Approve on a card. No direct-ask path (unlike GHL): even a typed ask becomes a card first.

**My calls:**
- Same gate as GHL, stricter: `POST /api/agent-runner/meta-ops`, writes only under an approved `{ kind: "meta" }` grant whose card `payload.ops` contains that exact op and args; card must be `runnerOwned` false? no: card is the agent's, and the payloadHash check on Approve guarantees Jake saw these ops.
- Every target object is checked on the server to belong to the client's own ad account before the call. Every write is audit-logged before it is sent.
- The card shows each change in words with old and new values (budget $40 to $50/day, Pause ad "Winter 2").
- New ads are created PAUSED unless the card says ACTIVE, and the card says which.
- `/api/agent-runner/meta` (reads) stays import-clean of write code; writes live in their own module.
