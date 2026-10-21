# Four agents and handoffs

Status: design, waiting on Jake's OK. Plan gets appended here (spec + plan in one doc).

## Why

Jake wants the agent setup "lean and mean". Seven agents is too many to manage. Four agents cover all service delivery, and the Director becomes the place where work moves from one agent to the next on its own, with Jake holding the gates.

Jake's words: tasks "should do it on its own", "based on triggers so when the market research document looks done to me i say go and the ads agent already starts executing based on the plan we made with the manager".

## Goals

1. One agency agent and four per-client agents:
   - **Manager** (agency-wide): a chat bubble in the bottom right of every admin page, not tied to a client. Answers agency questions (spend across clients, who is behind, money, pipeline). Read only.
   - **Customer Success Manager** (per client, replaces the per-client Manager): kickoff, the client plan (tasks), tracking, operations, and the monthly client report (takes over Reporting).
   - **Market Research**: the research doc that feeds Ads.
   - **Ads**: ads, creatives and landing pages (takes over Creative and Landing Page). Landing pages here means ad funnel pages (like the Clear Choice funnel), since conversion assets are gone.
   - **GHL**: everything GHL.
2. Creative, Landing Page and Reporting agents are removed everywhere (app, server, runner, prompts, SOP maps, vault brains). Nothing they own is lost: it is moved to Ads or the Customer Success Manager.
3. Conversion assets are removed entirely (Jake: "we are getting rid of conversion assets entirely").
4. Director tasks can wait on other tasks. When everything a task waits on is done, the task's agent starts it on its own, and it is handed the outputs of the tasks it waited on (example: Ads finishes the Meta dataset, GHL is started on the Conversions API workflow with the dataset ID).
5. Gates: a task can be a Jake gate. A chain stops at a gate until Jake says go (ticks it). Example: Market Research finishes the doc, the chain stops at "Research doc approved", Jake ticks it, Ads starts the build from the kickoff plan.
6. Every task has a switch: **Needs your OK** (default, every task) or **Acts live**. Jake will set specific tasks to Acts live later, once the infrastructure is in ("after the infrastructure for the agents is built out we can go over tasks and specific processes").

## Non-goals

- Hermes, the VPS, Telegram as a front door, moving the runner off Jake's PC. Separate later builds. The current runner stays.
- The Manager asking a client's Customer Success Manager on Jake's behalf. That comes with Hermes. (My call: the bubble answers agency questions only for now.)
- Any chat for clients. Jake: not now.
- Deciding which tasks act live. Everything ships as Needs your OK.
- Rewriting what each agent knows beyond moving the retired agents' knowledge in.

## Anti-goals (a failure even if it works)

- An agent writes to GHL, Meta or spends money without Jake's OK on a task that is set to Needs your OK.
- A task auto-starts twice, or a chain loops.
- An auto-start message is treated as Jake's own ask (it would unlock GHL writes today, see Security).
- Existing client tasks, Brief text, open cards, lessons or drafts are lost in the merge.
- Live GHL funnel pages break because their embedded scripts were deleted first.

## Build split

Two builds, shipped in order. Each one is useful on its own.

- **Build A: the new agent set, no conversion assets.** Manager becomes the app-wide bubble, Customer Success Manager takes the per-client Manager's place, three agents retire and their powers and data merge, conversion assets go.
- **Build B: handoffs.** Task dependencies, auto-start with outputs, Jake gates, the per-task switch, Director UI for all of it.

## Build A: four agents

### Agent ids

Agent ids are `manager` (agency only), `csm` (per client, label "Customer Success Manager"), `research`, `ads`, `ghl`. `creative`, `landing`, `reporting` are removed from the `AgentId` type in both wire files, `AGENTS` lists, icon and colour maps, Brief sections, task owners, the runner's tool and Meta lists, and the agent prompt files. The DB check constraints (0166 agent_chats, agent_items agent and from_agent; 0168/0169 client_briefs section and updated_by; 0173 client_tasks owner) are replaced in a new migration after the data is moved.

### What Ads inherits

From Creative:
- Higgsfield tools and its MCP config, with the `spend` grant (cap, card, balance check before and after).
- Video renders (```video blocks, HyperFrames), the `file` grant and `file-creative`.
- Server checks that test `agent === "creative"` now test `ads`.

From Landing Page:
- The `deploy` grant: draft to CF Pages, promote on approve. Wrangler stays out of the agent's tools.
- Site work folder moves from `work/landing-<slug>` to the Ads work folder. Existing `work/landing-*`, `work/creative-*`, `state/creative-*` folders and `data/sites/<slug>/<itemId>` drafts are moved or re-pointed so old drafts still go live by item id.
- The go-live step no longer writes `followup_pages`. It marks the card live with `payload.liveUrl` and returns the item id.

Ads now holds three grant kinds in one bundle (meta, spend, deploy). The prompt section that explains grants covers all three.

### Manager and Customer Success Manager

- Everything the per-client Manager does today moves to `csm`: kickoff card (`kind: "tasks"`, `payload.taskOps`), seeing all the client's tasks, its SOP map, its prompt, the client rail entry. Server checks that test `agent === "manager"` for client work now test `csm`.
- From Reporting, the CSM gets the monthly client report, with Reporting's grants: WRITE and the client's Drive folder, plus Meta read. The report runs when Jake asks; no scheduler is added.
- `manager` keeps only the agency chat (no tenant). Its tools stay read only. It reads agency data the way the agency chat does today.
- The bubble: a round button fixed to the bottom right of every admin page. It opens a chat panel over the page with the agency Manager chat. It stays open across page changes. No intro text in the panel.
- On a client page the bubble is still the agency Manager, not the client's CSM (the CSM lives in the client's Agents rail).

### Data move (one migration, before the check constraints change)

- `client_tasks`: owner creative or landing becomes ads; reporting and manager become csm. `done_by` `agent:<old>` is remapped the same way. Keys stay the same.
- `client_briefs`: the creative and landing section bodies are appended into the ads section under a heading each; reporting into the manager section, which is renamed csm. `updated_by` remapped. Old rows deleted after the merge.
- `agent_chats`, `agent_items` (agent and from_agent), request messages' `meta.fromAgent`: remapped. Manager rows with a tenant become csm; manager rows with no tenant stay manager. Open Needs your OK cards are moved together with their chats so their grant checks still match.
- `agent_lessons.agent`: remapped (client lessons of manager become csm).
- Vault: Creative and Landing Page brain lessons appended to the Ads brain, Reporting into a new Customer Success Manager brain (which also gets the Manager brain's client lessons), the old brain folders moved to `archive/`. Lines tagged `(creative, ...)` etc. in client brains are retagged.

Before the migration runs, the counts of every row it touches are printed, and the same counts are checked after.

### SOP maps

- Creative, Landing Page and Reporting maps are deleted. Their steps that still matter (creatives done, landing page built, monthly report) move into the Ads and Manager maps.
- The Manager map becomes the Customer Success Manager map. The agency Manager gets no map.
- The Client Fulfillment map: "Creative:" and "Landing Page:" steps become "Ads:", "Reporting:" and "Manager:" become "Customer Success:", the handoff boxes to Creative and Landing Page are removed. The conversion asset step is removed.
- Market Research map hands off to Ads only.

### Conversion assets removed

App and server:
- Delete the Conversion Assets screen and preview, its prompt, preview, patch libs and tests, its hooks, the followups CRUD route and the owner video upload route, the conversion-asset skill folder.
- Remove the `conversion-assets` GHL sub-tab. With GHL connected the GHL row opens on Custom Values. Nav tests updated.
- The Accounts calendars check looks for Home Estimate and Job only.
- Keep the shared photo upload (the Lead Form editor and client pictures use it): move its folder list out of `conversionAssets.ts` and keep the route working. Keep the `followup-assets` bucket.
- Follow-up copy (SMS 3 prompt and timing text) no longer says it comes after the Recent Work and Owner Story texts.
- Checklists, setup steps, the GHL client setup doc: remove the Conversion Assets step, the asset calendar, the Unique Mechanism texts, the four asset custom values.
- Existing `client_tasks` rows for the conversion asset step are set to `cut` with the reason "Conversion assets retired".
- Drop `followup_pages` in a new migration, after the go-live rewire ships.
- Add a RELEASES note saying conversion assets and the three agents are gone. Older release notes stay as history.

Ordering trap: `public/sites/<slug>/fu/*.js` (Clear Choice, Above All, Made Better) are embedded in live GHL funnel pages. They are deleted only after Jake has removed those pages in GHL. Build A ships without deleting them, and a follow-up commit removes them when Jake says the pages are gone.

Jake's GHL work (goes in his action items README as a numbered checklist):
1. LF Follow Ups workflow, every client and the snapshot: remove "SMS: Recent Work", its 24h wait and "SMS: Owner Story", re-time SMS 3. Check LP Follow Ups too.
2. Home Estimate Reminders: remove the two Unique Mechanism texts.
3. Delete custom values Recent Work, Owner Story, Unique Mechanism, Conversion Asset Offer.
4. Delete the Conversion Asset Calendar in every sub-account and the snapshot, and remove it from the Conversions API (Schedules) workflow trigger.
5. Unpublish the funnel pages that embed the `/fu/` scripts on Clear Choice, Above All and Made Better.
6. Re-save the snapshot.

## Build B: handoffs

### Task fields (new columns on client_tasks)

- `waits_on text[]`: keys of the tasks this one waits on. Empty means it starts only when Jake names it, like today.
- `mode text check in ('ask','live') default 'ask'`: Needs your OK or Acts live.
- `outputs jsonb default '{}'`: named values the task produced (for example `{"dataset_id":"123"}`), separate from the free-text proof.

A gate is not a new kind of task: it is a task owned by `jake`. Ticking it is how Jake says go. Chains run through it like any other task.

### Agents report outputs

The ```task block gains optional named outputs after the proof:

```
adsbuild:meta-dataset | done | Dataset created in Events Manager | dataset_id=1234567890
```

Outputs are short `name=value` pairs, saved into `outputs`. Same rules as today: own tasks only, forward only, done needs proof.

### Auto-start

One shared function runs whenever any task reaches done or cut, whoever did it (Jake in the Director, an agent's task block, a Manager card being approved):

1. Find tasks for that client whose `waits_on` includes the finished key, that are still `todo`, owned by an agent (not jake or client).
2. For each, check every task it waits on is done or cut.
3. Move it todo to doing with a conditional update (only if still todo). Only the caller that wins the update starts it. This is the guard against starting twice.
4. Queue a **trigger** message into that agent's tasks chat for the client (one chat per agent per client, made on first use, titled "Tasks"). The message names the task, its steps, and the proof and outputs of every task it waited on.

Jake-owned and client-owned tasks are never started; they just become ready. Ready gates show on the board.

A task is auto-started at most once. If it needs to run again, Jake tells the agent in chat.

If the agent's turn fails, or it files a Needs your OK card, the task stays doing. Approving the card continues the turn the way it does today. Nothing downstream starts until the task is marked done.

### Security

- Trigger messages get their own role, `trigger`. They are never role `me`. The GHL write check treats a plain `me` message as Jake's direct ask, so a trigger must never look like one.
- A trigger turn may update its own tasks and the Brief (same as Jake's turns).
- On a **Needs your OK** task, a trigger turn can read and draft, and every write goes through a card Jake approves (GHL ops card, Meta card, spend card, deploy card), exactly as today.
- On an **Acts live** task, the trigger turn may do that task's GHL writes directly, without a card. Meta writes, Higgsfield spend and site deploys still always go through a card. (My call: money and live ads stay behind a click until Jake says otherwise.)
- The runner prompt line "do only the tasks Jake names; never start the next one" gets one exception: a trigger turn does the task the trigger names, and only that task.

### No default chain yet

Jake: no default chain until the infrastructure is in. Build B ships the machinery only: `waits_on`, Jake gates (jake-owned tasks), auto-start with outputs, the switch. No seeded task gets `waits_on`, so nothing auto-starts until Jake (in the Director) or the CSM (in a kickoff card) sets what a task waits on. The chain and its gates get decided with Jake afterwards, task by task.

The CSM's kickoff card can set `waits_on` and `mode` on tasks it adds or changes.

All clients, including Willis, Made Better, Clear Choice and AAG, get the new columns and the same behaviour (Jake: yes). Because nothing waits on anything yet, ticking an old task starts nothing. Auto-start fires only on a done or cut that happens after Build B ships, for tasks that have `waits_on` set.

### Director UI

Same one-screen board. Additions:
- A task that is waiting on unfinished tasks shows as a ring dot (waiting) instead of a plain to-do dot.
- A ready Jake gate shows highlighted in Jake's row.
- The task panel shows: Waits on (the tasks, each with its state, editable), the Needs your OK / Acts live switch, and Outputs.
- No intro text, no helper lines (Jake's UI rules).

### Tests that must exist

- Auto-start starts a dependent once when two finishes race.
- A dependent with two parents starts only after both are done or cut.
- A cut parent counts as finished.
- Jake and client tasks are never started.
- A trigger message never unlocks GHL writes on a Needs your OK task.
- Acts live unlocks GHL writes for that task's trigger turn only, never Meta, spend or deploy.
- Outputs from parents appear in the trigger message.
- The data move keeps every row (counts before and after).

## Left to the builder

- Exact names of new files and functions, the migration split, how the tasks chat is found or created.
- How outputs are shown in the trigger message, as long as each parent's proof and outputs are there.
- How the old drafts on the runner are moved or re-pointed.
- Whether the Brief merge uses one heading per old section or a single block.
- How many tasks one trigger carries. (My call: when several tasks for the same agent become ready at once, they go in one trigger message as a list, so 14 GHL steps are one turn, not 14.)
- Acts live scope. (My call: on an Acts live task, the trigger turn may make GHL writes for that client; a per-op allowlist per task waits until Jake goes over processes.)


---

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build A gives the app the new agent set (agency Manager bubble, per-client CSM, Research, Ads, GHL) with conversion assets gone; Build B adds task handoffs (waits_on, gates, auto-start with outputs, Needs your OK / Acts live).

**Architecture:** Agent ids change in the two wire files and everything keyed by them; one data migration moves rows and narrows the checks in the same transaction. Handoffs live in a new `functions/lib/taskHandoffs.ts` (one `startReady` helper called from every path that finishes a task) and a new message role `trigger` that the runner claims but no write gate reads as Jake.

**Tech Stack:** React + Vite, CF Pages Functions, Supabase (migrations via `npm run db:migrate`), Node/TS runner (`projects/agent-runner`), vitest in both.

**Spec:** this document, above.

## Global Constraints

- Never use em dashes anywhere (code, comments, UI, prompts, docs).
- No sub-text under headings in the UI; labels are nouns.
- Every admin-facing change adds a `RELEASES` entry in `src/lib/releaseNotes.ts`, same commit.
- Agent ids: `manager` (agency only), `csm` (label "Customer Success Manager"), `research`, `ads`, `ghl`.
- Task `mode` values `ask` (label "Needs your OK", default) and `live` (label "Acts live").
- A `trigger` message is never role `me`; no gate may treat it as Jake's ask.
- Meta writes, Higgsfield spend and site deploys always need a card, even on Acts live.
- Never name GHL in client-facing UI (all of this is admin-only).
- Secrets only from Doppler. Migrations only through `npm run db:migrate`, never the SQL editor; never edit old migrations.
- Build in a worktree (`../hml-four-agents`, branch `feat/four-agents`). Delete this doc in the shipping commit of Build B, after appending Jake's checks to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md`.
- Do not delete `public/sites/*/fu/` until Jake says the GHL pages are gone.
- No agent browser tabs while iterating on localhost; verify with typecheck + vitest; browser only for the prod smoke.

## Review Focus

1. A card approved in a CSM chat that used to be a Manager chat: its grant check must still match (`item.agent` and chat agent both `csm`).
2. The agency Manager after the move: agency chats (tenant null) stay `manager` and keep working; `createAutoChat` with tenant null still only allows `manager`.
3. An old Landing draft (`data/sites/<slug>/<itemId>`) approved after Build A ships must still go live through the Ads agent.
4. Two task finishes at once (Jake ticks one parent while an agent's block finishes the other) must start the shared child exactly once.
5. An agent's ```task block marking a parent done inside a trigger turn must start that parent's children (the trigger turn's own update path calls `startReady`).

Each line has its test in the owning task: 1 and 2 in A3 step 4 and A1 step 1, 3 in A4 step 1, 4 and 5 in B3 step 2.

---

## Build A

### Task A1: Agent ids and labels (app)

**Files:**
- Modify: `apps/command-center/src/lib/agents.ts`, `src/lib/agents.test.ts`
- Modify: `src/lib/brainGraph.ts` (AGENT_COLORS), `src/components/admin/clientRowIcons.ts` (AGENT_ICONS; drop `conversion-assets` too), `src/lib/agentView.ts` (WORKING_AGENTS), `src/lib/clientBrief.ts` (BRIEF_SECTIONS), `src/lib/clientTasks.ts` (TASK_OWNERS, PREFIX), `src/lib/clientNav.ts` + test
- Modify server checks: `functions/lib/agentCreative.ts:54,68` and `functions/lib/agentFileAsset.ts:61,71` to `ads`; `functions/lib/agentItems.ts:485` (tasks card) and `functions/lib/agentTasks.ts:24` (sees all tasks) to `csm`

**Interfaces:**
- Produces: `type AgentId = "manager" | "csm" | "research" | "ads" | "ghl"`; `AGENTS` in rail order `csm, research, ads, ghl, manager` with names "Customer Success Manager", "Market Research Agent", "Ads Agent", "GHL Agent", "Manager Agent"; `CLIENT_AGENTS: AgentDef[]` (AGENTS without manager) used by clientNav, BuildPanel and RequestCard; `TASK_OWNERS = ["client","jake","csm","research","ads","ghl"]`; `BRIEF_SECTIONS` ids `csm, research, ads, ghl`.

- [ ] **Step 1: Failing tests.** `agents.test.ts`: `expect(AGENTS.map(a => a.id)).toEqual(["csm","research","ads","ghl","manager"])`, `isAgentId("creative")` is false, `CLIENT_AGENTS` has no `manager`, `createAutoChat`-style rule pinned in `functions/lib/agentItems` test: tenant null with agent `csm` throws "only the Manager works at the agency". `clientNav.test.ts`: the client Agents group is exactly Customer Success Manager, Market Research, Ads, GHL. `clientTasks.test.ts`: `seedTasks()` has no owner in `creative|landing|reporting|manager`, and the step that was `Creative: Creatives Done/Added To Media Library` seeds with owner `ads` and the same key.
- [ ] **Step 2:** `npx vitest run src/lib/agents.test.ts src/lib/clientNav.test.ts src/lib/clientTasks.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Change the files above. `PREFIX` maps "creative" and "landing page" to `ads`; "reporting", "manager" and "customer success" to `csm`. `ownerLabel("csm")` returns "Customer Success Manager".
- [ ] **Step 4:** `npx tsc --noEmit -p .` then `npx vitest run`. Expected: typecheck clean; all pass except the known `intakeFunnelParity.test.ts`.
- [ ] **Step 5:** Commit `refactor(agents): five ids, csm takes client Manager work`.

### Task A2: SOP maps

**Files:** `src/lib/agentSops.ts`, `src/lib/sopPrompt.test.ts`, `src/lib/sopChecklists.ts:59`, `src/lib/setupSteps.ts:169`, `src/lib/clientTasks.test.ts`

**Interfaces:** Consumes A1 ids. Produces `AGENT_SOPS` keyed `fulfillment | csm | research | ads | ghl` (no `manager` map).

- [ ] **Step 1: Failing tests** in `sopPrompt.test.ts`: `Object.keys(AGENT_SOPS)` equals `["fulfillment","csm","research","ads","ghl"]`; no node label or step in any map matches `/conversion asset|recent work|owner story|unique mechanism|creative agent|landing page agent|reporting agent/i`; `sopForAgent("csm")` is non-empty; the Research map hands off to `ads` only. Replace the old landing and creative cases.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Rename the Manager map to `csm`. Fold the Creative and Landing Page maps' still-live steps (creatives done; ad funnel page built, then deployed by card) into the Ads map, and the Reporting map's steps into the CSM map (live stage: monthly report). Delete those three maps and the `tocre`/`tolp` link nodes. Rewrite fulfillment step prefixes. Remove every conversion asset step, the asset calendar steps, the Unique Mechanism texts and "Conversion Asset bookings" in the capi box. Remove "Conversion Assets Created/Placed Into Funnel" from `sopChecklists.ts` and `setupSteps.ts`.
- [ ] **Step 4:** `npx vitest run`. Expected: pass (the checklist coverage test still green).
- [ ] **Step 5:** Commit `refactor(sops): four client maps, no conversion assets`.

### Task A3: Data move migration

**Files:** Create `supabase/migrations/0174_agents_regroup.sql`; create `scripts/agents-regroup-counts.sql` (read-only counts).

**Interfaces:** Consumes A1 ids. Produces a DB where no row references `creative|landing|reporting`, client `manager` rows are `csm`, agency rows stay `manager`.

- [ ] **Step 1:** Write the counts script: rows per agent in `agent_chats.agent`, `agent_items.agent`, `agent_items.from_agent`, `agent_lessons.agent`, `client_briefs.section`, `client_briefs.updated_by`, `client_tasks.owner`, `client_tasks.done_by`, `agent_messages.meta->>'fromAgent'`, split by tenant null or not. Run it against prod with the DB URL from Doppler and save the output in the worktree's `.superpowers/` scratch.
- [ ] **Step 2:** Write 0174 as one transaction:
  1. Drop the agent checks with `drop constraint if exists`: `agent_chats_agent_check`, `agent_items_agent_check`, `agent_items_from_agent_check` (0166), `client_briefs_section_check` (0169), `client_briefs_updated_by_check` (0168), `client_tasks_owner_check` (0173).
  2. Remap `creative|landing` to `ads`, `reporting` to `csm`, and `manager` to `csm` where `tenant_id is not null`, in every column above and in `agent_messages.meta.fromAgent` (via `jsonb_set`, joined to the chat for its tenant).
  3. `client_tasks.done_by`: `agent:creative|agent:landing` to `agent:ads`, `agent:reporting|agent:manager` to `agent:csm`.
  4. `client_briefs`: append each creative and landing body to the tenant's `ads` row under `## Creative` / `## Landing pages` (insert the `ads` row if missing), reporting into the `manager` row under `## Reporting`, rename section `manager` to `csm`, then delete the merged rows.
  5. `update client_tasks set state = 'cut', reason = 'Conversion assets retired' where key like '%conversion-assets-created%' and state <> 'done'`.
  6. Re-add the checks: chats and items agent in `('manager','csm','research','ads','ghl')`, from_agent the same or null; briefs section and updated_by in `('csm','research','ads','ghl')` plus whatever non-agent updated_by values 0168 allowed; task owner in `('client','jake','csm','research','ads','ghl')`; and a new check on `agent_chats` and `agent_items` that `agent <> 'manager' or tenant_id is null`.
- [ ] **Step 3:** `npm run db:migrate` (only in the A7 ship step, see there). Locally, run the SQL inside `begin; ... rollback;` against prod via psql to prove it applies.
- [ ] **Step 4:** After the real apply, re-run the counts. Expected: totals per table unchanged except `client_briefs` (down by exactly the merged rows); zero old ids; zero tenant `manager` rows; agency `manager` count unchanged.
- [ ] **Step 5:** Commit `feat(db): regroup agents into csm and ads`.

### Task A4: Runner, prompts and brains

**Files:** `projects/agent-runner/src/wire.ts`, `src/agents.ts`, `src/bundle.ts`, `src/runner.ts`, `src/landing.ts`, `src/creative.ts`, `src/monitorRules.ts`, `src/main.ts`, `agents/*.md`, `agents/_protocol.md`, tests in `test/`; create `scripts/regroup-disk.ts`; vault `vault/Agents/*`, `vault/Clients/*/Brain.md`.

**Interfaces:** Consumes A1 ids. Produces `META_AGENTS = ["manager","csm","ads"]`; `TOOLS.csm` = READ + WRITE with the client Drive in addDirs; `TOOLS.ads` gains Higgsfield via `creativeHiggsfieldTools(grant)` and `mcpConfig`; `TOOLS.manager` read only; landing work folder `work/ads-<slug>/site/<name>`.

- [ ] **Step 1: Failing tests.** `test/bundle.test.ts`: `buildBundle("ads", tenant, env, spendGrant)` allows the Higgsfield generate tools and has an mcpConfig; with a deploy grant it includes the landing section with workDir under `ads-<slug>`; `buildBundle("csm", tenant)` has WRITE tools and the client Drive in addDirs; `buildBundle("manager", null)` has no WRITE tool. `runner.test.ts`: a video-block turn runs for agent `ads`; the spend alert card is filed with `agent: "ads"`. `landing.test.ts`: `goLive` accepts `chat.agent === "ads"` and still finds a draft under `data/sites/<slug>/<itemId>` made before the move.
- [ ] **Step 2:** `npm test` in `projects/agent-runner`. Expected: FAIL.
- [ ] **Step 3:** Every `"creative"` and `"landing"` check becomes `"ads"`; Reporting powers go to `csm`; the agency `manager` keeps megaBrain only. `adsGrantSection` explains the meta, spend and deploy grants. `monitorRules` wakes `ads`, `ghl`, `csm`. Write `agents/csm.md` from `manager.md` (kickoff, taskOps, tracking) plus the monthly report from `reporting.md`. Rewrite `agents/manager.md` as the agency assistant (agency questions, read only, never edits a client). Fold `creative.md` and `landing.md` (ad funnel pages, no conversion assets) into `ads.md`. Delete `creative.md`, `landing.md`, `reporting.md`. `_protocol.md` toAgent list becomes `csm, research, ads, ghl`.
- [ ] **Step 4:** Vault: create `vault/Agents/Customer Success Manager/Brain.md` (Manager client lessons plus Reporting lessons), append Creative and Landing lessons to `vault/Agents/Ads/Brain.md`, move the Creative, Landing Page and Reporting folders to `archive/vault-agents/`, retag their lines in `vault/Clients/*/Brain.md`.
- [ ] **Step 5:** `scripts/regroup-disk.ts` with `--dry-run`: moves `work/landing-*` and `work/creative-*` contents into `work/ads-*`, `state/creative-*` into `state/ads-*`; leaves `data/sites` alone. Run dry and read the list; the real run happens in A7 with the runner stopped.
- [ ] **Step 6:** `npm test` and `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 7:** Commit `refactor(runner): ads takes creative and landing, csm takes reporting`.

### Task A5: Conversion assets removed

**Files:**
- Delete: `src/components/admin/cockpit/ghl/ConversionAssetPanel.tsx`, `ConversionAssetPreview.tsx`, `src/lib/conversionAssetPrompt.ts` (+test), `src/lib/conversionAssetPreview.ts`, `src/lib/conversionAssetPatch.ts` (+test), `src/lib/conversionAssets.test.ts`, `functions/lib/conversionAssets.ts`, `functions/api/admin/followups.ts`, `functions/api/admin/followups/upload-url.ts`, `.claude/skills/conversion-asset/`
- Create: `functions/lib/assetUploads.ts`, `supabase/migrations/0175_drop_followup_pages.sql`
- Modify: `src/hooks/useApi.ts` (drop asset hooks and `uploadAssetVideo`, keep `uploadAssetPhoto`), `src/lib/fulfillmentPages.ts` + test, `src/lib/clientNav.test.ts`, `GhlTab.tsx`, `functions/lib/clientAccounts.ts` + test, `functions/api/admin/followups/upload.ts`, `functions/lib/agentFileAsset.ts` + test, `functions/api/agent-runner/file-asset.ts`, `src/lib/agentWire.ts`, `projects/agent-runner/src/{wire,api,landing}.ts`, `functions/lib/followUpPrompts.ts:41`, `src/lib/followUpCopy.ts`, `docs/ghl-client-setup-checklist.md`, `apps/blueprint/index.html`

**Interfaces:** Produces `UPLOAD_FOLDERS` exported from `functions/lib/assetUploads.ts`; the file-asset result is `{ itemId: string; liveUrl: string }` (was `assetId`) in both wire files.

- [ ] **Step 1: Failing tests:** `fulfillmentPages.test.ts`: with GHL connected the GHL sub-tabs start at `custom-values` and have no `conversion-assets`; `clientAccounts.test.ts`: the calendars check passes with Home Estimate and Job only; `agentFileAsset.test.ts`: approve marks the item live with `payload.liveUrl` and never touches `followup_pages`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Make the changes. `upload.ts` imports `UPLOAD_FOLDERS` from `assetUploads.ts`; its route and the `followup-assets` bucket stay. Follow-up copy and the SMS 3 prompt drop any mention of the Recent Work and Owner Story texts. 0175 is `drop table if exists public.followup_pages;`.
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npx vitest run`, runner `npm test`. Expected: pass. `grep -rni "conversion asset\|followup_pages" apps/command-center/src apps/command-center/functions projects/agent-runner/src` finds only release note history.
- [ ] **Step 5:** Commit `feat: conversion assets removed`.

### Task A6: Manager bubble

**Files:** Create `src/components/admin/agents/ManagerBubble.tsx`, `src/lib/managerBubble.ts` + test; modify `src/routes/admin/AdminLayout.tsx` (mount once), `src/lib/releaseNotes.ts`.

**Interfaces:** Consumes `ChatList`, `ChatThread` and the `agentApi` hooks with `tenantId: null, agent: "manager"`. Produces `<ManagerBubble />` (no props), `bubbleOpen(stored: string | null): boolean`, `hideBubbleOn(path: string): boolean`.

- [ ] **Step 1: Failing test:** `bubbleOpen(null)`, `bubbleOpen("x")` false, `bubbleOpen("1")` true; `hideBubbleOn("/admin/agents/manager")` true, `hideBubbleOn("/admin/client/abc/director")` false.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Build it: 52px round button fixed bottom right, 16px from the edges and above the mobile tab bar; opens a panel (380px wide, 70vh; full width under 640px) with the newest agency Manager chat thread and composer, and a chat switcher from `ChatList`. Open state lives in the layout so it survives route changes, remembered in localStorage inside try/catch. Esc closes. No intro text. The sidebar link to `/admin/agents/manager` stays (Clients and Mega Brain tabs live there). RELEASES entry: agents regrouped, Manager bubble, conversion assets gone.
- [ ] **Step 4:** typecheck + vitest. Expected: pass.
- [ ] **Step 5:** Commit `feat(agents): Manager bubble on every admin page`.

### Task A7: Ship Build A

- [ ] Whole-branch review and one fix pass.
- [ ] Order: stop the runner; `npm run db:migrate` (0174); run counts (A3 step 4); merge to main and push; watch the CF Pages deploy; run `scripts/regroup-disk.ts` for real; start the runner; apply 0175.
- [ ] Prod smoke: the bubble opens and the Manager answers; a client rail shows the four agents; the Willis Director shows Customer Success Manager and Ads rows; an Ads chat on Made Better answers.
- [ ] Append Jake's GHL checklist (the six steps in the spec) and his checks to the action items README; update the blueprint and memory. This doc stays until Build B ships.

## Build B

### Task B1: Task fields

**Files:** Create `supabase/migrations/0176_task_handoffs.sql`; modify `src/lib/clientTasks.ts` + test, `functions/lib/clientTasks.ts` (`toTask`, `TaskPatch`, `patchTask`, `applyTaskOps`, `insertAdded` returns the new key), `src/lib/agentWire.ts` and runner `wire.ts` (`WireTask` gains `waitsOn`, `mode`).

**Interfaces:** Produces `type TaskMode = "ask" | "live"`; `ClientTask.waitsOn: string[]`, `ClientTask.mode: TaskMode`, `ClientTask.outputs: Record<string, string>`; `TaskPatch.waitsOn?: string[]`, `TaskPatch.mode?: TaskMode`; `TaskOp` add and change gain optional `waitsOn?: string[]` and `mode?: TaskMode`; `waitsCycle(tasks: ClientTask[], key: string, waitsOn: string[]): boolean` in `src/lib/clientTasks.ts`.

- [ ] **Step 1: Failing tests:** `parseTaskOps` accepts `waitsOn` (up to 20 keys) and `mode` on add and change and rejects `mode: "auto"`; `waitsCycle` is true for a task waiting on itself and for a two-task loop, false for a straight chain.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** 0176: `alter table public.client_tasks add column waits_on text[] not null default '{}', add column mode text not null default 'ask' check (mode in ('ask','live')), add column outputs jsonb not null default '{}'`; replace `agent_messages_role_check` with `role in ('me','ai','request','trigger')`. `patchTask` and `applyTaskOps` check every key exists for the tenant and refuse loops (`400 "that would loop"`; in applyTaskOps a skipped reason). `applyTaskOps` resolves `waitsOn` after its adds so a card can wire tasks it added, naming them by the add's `name` slug (`added:<slug>`).
- [ ] **Step 4:** `npm run db:migrate`, typecheck, vitest. Expected: pass.
- [ ] **Step 5:** Commit `feat(tasks): waits on, mode, outputs`.

### Task B2: Outputs from agents

**Files:** `projects/agent-runner/src/output.ts` + test, `agents/_protocol.md`, `functions/lib/agentTasks.ts` + test; `RunnerTaskUpdate.outputs?: Record<string, string>` in both wire files.

- [ ] **Step 1: Failing tests:** the parser turns `adsbuild:meta-dataset | done | Dataset made | dataset_id=123 pixel=abc` into `{ key, state: "done", evidence: "Dataset made", outputs: { dataset_id: "123", pixel: "abc" } }`; a proof containing `=` with no fourth field stays proof. `agentTaskUpdate` saves outputs (at most 10 pairs, name matching `/^[a-z][a-z0-9_]{0,39}$/`, value up to 500 characters) and reports dropped pairs in `refused`.
- [ ] **Step 2:** Run both suites. Expected: FAIL.
- [ ] **Step 3:** Implement; document the fourth field in `_protocol.md`.
- [ ] **Step 4:** Run. Expected: pass.
- [ ] **Step 5:** Commit `feat(tasks): agents report named outputs`.

### Task B3: Auto-start

**Files:** Create `functions/lib/taskHandoffs.ts` + test; modify `functions/lib/agentTasks.ts`, `functions/lib/clientTasks.ts`, `functions/lib/agentItems.ts`, `functions/lib/agentRunner.ts` (`RUNNABLE_ROLES` and `runnable` include `trigger`), `functions/lib/clientBriefs.ts` (`turnChat` accepts a running `trigger` message).

**Interfaces:**
- `readyChildren(tasks: ClientTask[], finishedKeys: string[]): ClientTask[]`: pure; returns tasks that are todo, owned by an agent, have a non-empty `waitsOn` containing a finished key, and whose every `waitsOn` key is done or cut.
- `startReady(client: SupabaseClient, tenantId: string, finishedKeys: string[]): Promise<{ started: string[] }>`: reads tasks, takes `readyChildren`, moves each with `update ... set state = 'doing' where id = ? and state = 'todo'` returning the row, keeps only rows it won, groups them by owner, and queues one trigger per owner.
- `triggerBody(children: ClientTask[], parents: ClientTask[]): string`: each child's key, name and steps, then under "Handed over" each parent's name, evidence or note, and outputs as `name: value`.
- `queueTrigger(client: SupabaseClient, tenantId: string, agent: AgentId, body: string, meta: { taskKeys: string[]; live: boolean }): Promise<AgentMessage>` in `agentItems.ts`: inserts role `trigger`, status queued, into the newest chat titled "Tasks" for that tenant and agent, creating it if none.
- `meta.live` is true only when every task in that trigger has `mode === "live"`.

- [ ] **Step 1: Failing tests (pure):** `readyChildren` returns a two-parent child only when both parents are done or cut; a cut parent counts; jake- and client-owned children are never returned; a child already doing is not returned; a child with empty `waitsOn` is never returned. `triggerBody` includes `dataset_id: 123` from a parent's outputs.
- [ ] **Step 2: Failing tests (fake client):** two concurrent `startReady` calls against a fake whose conditional update succeeds once give the child in exactly one `started` and one trigger in total; three ready GHL children make one trigger listing all three; `agentTaskUpdate` moving a parent to done in a trigger turn starts its child.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement. Call `startReady` from `agentTaskUpdate` (keys moved to done), `patchTask` (new state done or cut) and `applyTaskOps` (cut ops). A `startReady` failure is logged and never fails the caller's write.
- [ ] **Step 5:** Run. Expected: pass.
- [ ] **Step 6:** Commit `feat(tasks): finished tasks start what waits on them`.

### Task B4: Trigger turns and the switch

**Files:** `functions/lib/agentGhlOps.ts` + test, `functions/lib/agentMetaOps.ts` test, `functions/lib/agentCreative.ts` and `functions/lib/agentFileAsset.ts` tests, `projects/agent-runner/src/runner.ts` (`speaker`, `current`), `src/bundle.ts` (`sopSection`, `tasksSection`) + tests; `MessageRole` adds `trigger` and `AgentMessage` gains `live: boolean` (from meta, false when absent) in both wire files.

- [ ] **Step 1: Failing tests:** `writeAllowed` is false for a running `trigger` message with `live: false` in a GHL chat, true with `live: true`, false with `live: true` in an Ads chat, and still true for a plain `me` direct ask and an approved grant. Meta writes, spend (`creativeTurn`) and deploy (`fileAsset`) refuse a trigger turn without a grant even with `live: true`. Runner: `speaker` of a trigger is "Director"; `current()` frames it as "The Director started these tasks for you"; for a trigger turn `tasksSection` says to do only the tasks in the trigger.
- [ ] **Step 2:** Run both suites. Expected: FAIL.
- [ ] **Step 3:** In `writeAllowed`, before the `me` check: `if (message.role === "trigger") return message.status === "running" && chat.agent === "ghl" && message.live;`. Prompt line becomes "Do only the tasks Jake names in this chat, or the tasks a Director trigger hands you. Never start any other task on your own." `live` is set only by `queueTrigger` on the server.
- [ ] **Step 4:** Run. Expected: pass.
- [ ] **Step 5:** Commit `feat(agents): trigger turns, Acts live opens GHL writes only`.

### Task B5: Director UI

**Files:** `src/lib/directorBoard.ts` + test, `src/components/admin/director/ClientDirector.tsx`, `src/hooks/useApi.ts` (patch hook carries `waitsOn` and `mode`), `src/lib/releaseNotes.ts`.

**Interfaces:** Produces `taskLook(t: ClientTask, byKey: Map<string, ClientTask>): "todo" | "waiting" | "ready-gate" | "doing" | "done" | "cut"`.

- [ ] **Step 1: Failing test:** `taskLook` is `waiting` for a todo task with an open parent; `ready-gate` for a todo jake task with parents that are all done or cut; `todo` for a task with no `waitsOn`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Board: ring dot (`.dir-dot.s-waiting`, 1.5px solid ring, no fill) for waiting; brand-green ring with fill for a ready gate. Task panel adds three labelled rows: "Waits on" (parent names with state chips, a remove x, and a select of the client's other tasks to add; saves on change; shows the server's loop refusal), a two-option switch "Needs your OK" / "Acts live" (agent-owned tasks only), and "Outputs" (name: value lines, read only, hidden when empty). RELEASES entry.
- [ ] **Step 4:** typecheck + vitest. Expected: pass.
- [ ] **Step 5:** Commit `feat(director): waits on, gates, Needs your OK / Acts live`.

### Task B6: Ship Build B

- [ ] Whole-branch review and one fix pass; `npm run db:migrate` (0176); merge, push, watch the deploy, restart the runner.
- [ ] Prod smoke on Made Better: add Ads task "Smoke parent" and GHL task "Smoke child" waiting on it (both Needs your OK); tick the parent in the Director; confirm the GHL "Tasks" chat gets one trigger and the child shows doing with no GHL write made; then cut and delete both.
- [ ] Jake's checks into the action items README; blueprint and memory updated; this doc deleted in the commit.
