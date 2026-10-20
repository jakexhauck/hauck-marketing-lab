# Client Fulfillment SOP + per-client Director (design)

Status: DESIGN, awaiting Jake's approval. Plan steps get added below once approved (spec + plan in one doc).

## Intent

Jake wants every new client set up the same complete way, planned on day one, with nothing missed. Two ideas, kept strictly apart:

- **SOPs = the process.** How each agent always works. Fixed, changed only in code by Claude on Jake's word. Every agent follows its own map on every turn.
- **Director = the work.** The actual tasks for one client, who owns each, and what is done. Lives inside each client.

The Manager runs a kickoff with Jake for each new client (creatives, videos, GHL setup, who dials the leads, everything a setup needs), walks the Client Fulfillment map, and creates that client's tasks. Nothing starts on its own: Jake later opens an agent and tells it which tasks to do. Agents tick their tasks as they finish.

## Goals

1. A **Client Fulfillment** map on Agents > SOPs: the full A to Z journey, signed to live.
2. Every agent's prompt carries **its own SOPs-tab map** (boxes, owners, steps), so the flowchart Jake sees is exactly what the agent follows.
3. A **Director tab inside each client** (admin side): every task for that client in swimlanes.
4. The **Manager** builds that client's tasks at kickoff, from the Client Fulfillment map adjusted to the client's decisions.
5. Agents pick up tasks only when Jake tells them, and tick their own tasks done.

## Non-goals

- No in-app editing of SOP maps. They stay in `src/lib/agentSops.ts`.
- No automatic task start, no agent starting another agent's task, no scheduling or routines.
- No client-facing view of the Director.
- No change to the approval gates (grants, payloadHash, Higgsfield spend, Meta and GHL write rules).

## Anti-goals (a failure even if it works)

- An agent makes a live GHL or Meta write because the Manager wrote a task. Tasks are data, never Jake's ask.
- The Manager invents a decision Jake never made (who dials, video vs static, budget). Unknowns become "ask Jake" or "ask client" tasks.
- An SOP item silently disappears from a client's plan. Every item is kept, changed with a reason, or cut with a reason.
- Two lists of the same thing (Director tasks and Brief boxes) that disagree.

## Build 1: Client Fulfillment map, agents follow their maps, agency Director retired

### Client Fulfillment map (flow map A, Jake picked it)

New entry in `AGENT_SOPS` (or a sibling list if the agent id type gets in the way, builder's call): id `fulfillment`, pill "Client Fulfillment", shown first on Agents > SOPs. Same drawing, colours and box kinds as the agent maps.

Seven phases on the main line, each box holding its items as steps, sourced from `src/lib/sopChecklists.ts` (Full Setup, Onboarding Call, Launch Call). Owner per item:

| # | Phase | Items (owner) |
|---|---|---|
| 1 | Paid + signed | Invoice paid, Contract signed (client) |
| 2 | Onboarding call | Drive folder + templates, dialing script, sub-account (Manager / GHL); BM access, log into software, set expectations, marketing assets, ad account access, who dials the leads (Jake + client); software account made, client folder made |
| 3 | GHL + Phone | Staff, subdomain, custom values, custom fields, calendars, lead form custom values, message compliance off, A2P, local number, outcome number, speed to lead number, recording + transcription, call routing (GHL); Connect Facebook (Jake) |
| 4 | Follow ups + CAPI | Phone appointment, estimate reminders, job reminders, long term nurture, lead form FU's, Conversions API leads (GHL) |
| 5 | Ads + Creative + Landing | Link ad account (Jake), lead form, campaign (Ads), creatives in Media Library (Creative), conversion assets into funnel (Landing) |
| 6 | Pre-launch check | Every launch call "make sure account is done" item, Accounts page all green (Manager, Jake approves) |
| 7 | Launch call to live | Go over creatives, copy, lead form, GHL automations, explain software, test SMS + client saves outcome numbers (Jake + client); Ads LIVE |

Side doors: pre-launch "not ready" loops back to the owning phase (like the Manager map's fix list). Handoff boxes link to the GHL, Ads, Creative and Landing maps for the detailed how.

The **Manager map** is rewritten to the Manager's own job: kickoff with Jake, build the client's tasks, track, run the pre-launch check, hand to live. The A to Z journey moves out of it into Client Fulfillment.

### Agents follow their own map

`sopSection` in `projects/agent-runner/src/bundle.ts` today renders stages from the agency Director tables (`agentSopForPrompt`). Replace the source with the agent's map from `agentSops.ts`: boxes in main-line order, owner from box kind (agent = you, jake, client), steps, plus side doors. The Manager also gets the Client Fulfillment map. Maps marked draft (Market Research, Reporting, Creative) still go into prompts, labelled as drafts (Claude's call). The stage rule is replaced in Build 2 (see Working tasks); in Build 1 it stays so nothing changes for agents until the Director exists. How the map reaches the runner (claim payload via `withSop`, or a shared copy) is the builder's call; it must stay one source of truth.

### Retire the agency Director

Jake: "no need to keep the agency wide director page". Remove `/admin/director/:agent`, its nav entry, `DirectorPage.tsx`, the Tell bar suggest endpoint, `functions/lib/director.ts` store and APIs, and the Director overlay on `AgentSopsPage` (Off boxes, added tasks, draft how). Drop `agent_sop_stages` / `agent_sop_tasks` in a migration. Old URLs redirect to `/admin/sops`. Before the drop, export every Off box, added task and draft how from the live tables and show Jake, so his Director edits are folded into `agentSops.ts` or knowingly dropped (Claude's call). Because Build 1 retires the Director before Build 2 replaces it, the agent prompt switch to maps ships in the same commit as the retirement.

## Build 2: per-client Director + Manager kickoff

### Director tab (swimlanes B, Jake picked it)

New page in each client's admin rail (`src/lib/clientNav.ts`), route `/admin/client/:tenantId/director`. Owner only.

- Rows: Client, Jake, Manager, Market Research, GHL, Ads, Creative, Landing Page, Reporting (empty rows hidden).
- Columns: the 7 Client Fulfillment phases.
- Card: task name, state (to do, in progress, done), SOP box it came from, reason if changed or added. Click opens it: steps, who ticked it and when, evidence.
- Jake can add, edit, move, re-own, tick and untick tasks by hand.

### Data

New table `client_tasks` (tenant_id, phase, owner, name, steps, source node id or null for added, change reason, state, done_by, done_at, evidence, position, created_by). Migration via `npm run db:migrate`.

### Manager kickoff

In the client's Manager chat. The Manager reads the Client Fulfillment map, the Brief (Client section from intake), the Client Profile and brains, then asks Jake only what it cannot fill in, topic by topic (creatives and videos, GHL setup, who dials the leads, landing or form only, anything else on the map). Decisions are written to the Brief Status section. It then proposes the full task list on one card; Jake approves; the tasks are written. Every map item appears as kept, changed (reason) or cut (reason).

### Working tasks

- Jake tells an agent in its chat to do tasks. Each agent's prompt lists its own open tasks for this client.
- The SOP map in the prompt is the process to follow, not a trigger. The "work out your stage, do your tasks, file Start stage N" rule is removed: an agent does only the tasks Jake names. (Claude's call, from Jake: "I can talk to the agents and tell them to get certain things on the checklist done".)
- An agent marks a task in progress and done with a new output block that replaces ```tick, own tasks only. Done carries evidence where one exists (record id, ad id, URL); a task with no natural record (for example "explain software") takes a note. Never unticks. (Claude's call.)
- A task is never queued as a `role:"me"` message. `agentGhlOps.writeAllowed` and `agentMetaOps.metaWriteAllowed` treat any non-auto `me` message as Jake's direct ask, so task text must only ever reach an agent as prompt context.
- GHL write gating is unchanged in this build (Jake: "we don't need to configure this yet"). A direct ask from Jake still allows GHL writes as today. Per-task GHL approval is a later decision.

### Brief boxes retired (Jake approved Claude's recommendation)

Director tasks replace the Brief tick boxes (`briefChecklist.ts` `BRIEF_BOXES`, `BriefBoxes.tsx`, the ```tick block and `briefTicks.ts`). The Brief keeps decisions and finished work only; the Director is the only checklist. Each task stores the old `sop:` box key where it came from one, and existing `onboarding_checklist` ticks carry over as done tasks. Account checks stay automatic, shown on the matching Director tasks. The pre-launch check reads Director tasks. The Manager's monitor rule that watched Full Setup tick counts watches task states instead.

### Existing clients (Jake: yes)

Willis, Made Better, Clear Choice and Above All Garage Doors each get a Director, seeded from the Client Fulfillment map with every already-ticked box marked done (done_by from the tick). No kickoff for them; the Manager can be asked to list what is left. The Build 2 dry run uses one of these clients or the next new one, Jake's pick at the time.

## Production grade (Claude's proposal, Jake has not confirmed)

1. Never invents: unknowns become ask tasks.
2. Never skips: every map item accounted for.
3. Agents act only on Jake's word.
4. Done means proven: evidence where one exists, a note otherwise, enforced by the server (a done block with neither is rejected).
5. Remembers: kickoff decisions in the Brief, read by every agent.
6. Tested: unit tests per rule, plus one full dry run on a real client as part of finishing Build 2.

## Constraints

- No em dashes. No sub-text under headings in the UI. Labels are nouns.
- Every admin-facing change adds a `RELEASES` entry in `releaseNotes.ts`, same commit.
- Update the blueprint (`apps/blueprint/index.html`) GAPS/NODES on each ship.
- Tests: `npm test` in `apps/command-center` and in `projects/agent-runner`.
- Secrets in Doppler only. No local heavy builds without asking Jake.

## Left to the builder

Component structure, exact map geometry, the output block name and shape, how the map travels to the runner, card visuals within the existing design system.

---

# Build 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Client Fulfillment map to Agents > SOPs, make every agent's "Your SOP" prompt come from its SOPs-tab map, and retire the agency-wide Director.

**Architecture:** The claim payload keeps its shape (`sop?: SopStage[]`). Only its source changes: a pure function turns a map from `agentSops.ts` into stages (main line in order, split after each "Jake approves" box), and the claim attaches it with no DB read. The Director UI, APIs, store and tables go in the same release, after Jake has seen an export of anything he changed there.

**Tech Stack:** React + Vite, Cloudflare Pages Functions, Supabase (migrations via `npm run db:migrate`), Vitest. Runner: Node/TS in `projects/agent-runner`, Vitest.

**Spec:** the design above, in this file.

**Workspace:** a worktree off `main` (`superpowers:using-git-worktrees`). Run `git status` first; a parallel session may be active.

## Global Constraints

- No em dashes anywhere: code comments, UI, release notes, commit messages.
- No sub-text under headings; labels are nouns.
- `RELEASES` entry in `src/lib/releaseNotes.ts`, same commit as the admin-facing change.
- Blueprint (`apps/blueprint/index.html`) GAPS/NODES updated on ship.
- `AgentId` stays the 7 agents. `"fulfillment"` is a map id, never an agent id.
- Ask Jake before any heavy local build, render or dev server. `npm test` and `npm run typecheck` are fine.
- Secrets only through Doppler (`hauck-command-center` / `prd`).

## Review Focus

1. A map whose main line loops or has a second outgoing main edge: `mapStages` must not hang or drop boxes. Test in Task 2.
2. A map with no "Jake approves" box: the whole main line is one stage, not zero. Test in Task 2.
3. Old bookmarks to `/admin/director` and `/admin/director/ghl` land on `/admin/sops`, never a blank page. Checked in Task 4.
4. A new runner given a claim with no `sop` (deploy order): no SOP section, no crash. Existing test, kept passing in Task 3.
5. Jake's live Director edits (Off boxes, added tasks, draft how) lost by the drop. Task 1 gates Task 5.

---

### Task 1: Export Jake's live Director edits (gate for Task 5)

**Files:**
- Create (scratchpad, not the repo): `export-director.mjs`

- [ ] **Step 1:** Write a Node script that reads `agent_sop_tasks` and `agent_sop_stages` through Supabase REST (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and prints, per agent: tasks with `removed_at` set (Off), tasks with `node_id` null (added, with `how` and `how_status`), and stages or task names that differ from the seed in `supabase/migrations/0170_agent_sop_director.sql` and `0171_ghl_sop_calendars_test.sql`.
- [ ] **Step 2:** Run `doppler run -p hauck-command-center -c prd -- node <scratchpad>/export-director.mjs`. Expected: a short list, or "no edits".
- [ ] **Step 3:** Show Jake the list. Each item he keeps is folded into its map in `src/lib/agentSops.ts` in Task 2's commit. Task 5 does not start until Jake has answered.

### Task 2: Client Fulfillment map + `mapStages`

**Files:**
- Modify: `apps/command-center/src/lib/agentSops.ts` (types, new map, header comment)
- Create: `apps/command-center/src/lib/sopPrompt.ts`
- Test: `apps/command-center/src/lib/sopPrompt.test.ts`, `apps/command-center/src/lib/agentSops.test.ts`

**Interfaces:**
- Produces: `export type SopMapId = AgentId | "fulfillment"`; `AgentSop.id: SopMapId`; `SopNode.link?: SopMapId`; `AGENT_SOPS[0]` is the fulfillment map.
- Produces: `mapStages(map: AgentSop): SopStage[]` and `sopForAgent(agent: AgentId): SopStage[]` in `sopPrompt.ts`. `SopStage` is the type in `src/lib/agentWire.ts` plus `draft?: boolean`.

- [ ] **Step 1: Write the failing tests** in `sopPrompt.test.ts`:

```ts
it("walks the main line in order and splits after each Jake approves box", () => {
  const s = mapStages(getAgentSop("ghl")!);
  expect(s[0].tasks.map((t) => t.name).slice(0, 2)).toEqual(["sub-account", "staff added"]);
  expect(s[0].tasks.filter((t) => !t.name.includes("(only when")).at(-1)!.name).toBe("Jake review");
  expect(s[1].tasks.map((t) => t.name)).toContain("publish + test");
});
it("maps box kinds to owners", () => {
  const t = mapStages(getAgentSop("ghl")!).flatMap((x) => x.tasks);
  expect(t.find((x) => x.name === "connect facebook")!.owner).toBe("jake");
  expect(t.find((x) => x.name === "sub-account")!.owner).toBe("agent");
  expect(t.find((x) => x.name === "Jake review")!.owner).toBe("jake");
  expect(t.find((x) => x.name === "Jake review")!.steps[0]).toBe("File a needs_ok card and wait for Jake's Approve");
});
it("attaches side doors to the stage they branch from", () => {
  expect(mapStages(getAgentSop("ghl")!)[0].tasks.map((x) => x.name)).toContain("A2P rejected (only when sent here)");
});
it("uses steps, else the box lines", () => {
  const t = mapStages(getAgentSop("landing")!).flatMap((x) => x.tasks);
  expect(t.find((x) => x.name === "recent work page")!.steps).toEqual(["job photos + reviews"]);
});
it("marks draft maps", () => {
  expect(mapStages(getAgentSop("creative")!).every((s) => s.draft)).toBe(true);
  expect(mapStages(getAgentSop("ghl")!).some((s) => s.draft)).toBe(false);
});
it("never loops or drops a box on any map", () => {
  for (const m of AGENT_SOPS) expect(mapStages(m).flatMap((s) => s.tasks)).toHaveLength(m.nodes.length);
});
it("a map with no review box is one stage", () => {
  const base = getAgentSop("landing")!;
  const m: AgentSop = { ...base, nodes: base.nodes.map((n) => ({ ...n, k: n.k === "review" ? "agent" : n.k })) };
  expect(mapStages(m)).toHaveLength(1);
});
it("gives the Manager its own map, then Client Fulfillment", () => {
  expect(sopForAgent("manager").some((x) => x.name.startsWith("Client Fulfillment: "))).toBe(true);
  expect(sopForAgent("ghl").some((x) => x.name.startsWith("Client Fulfillment: "))).toBe(false);
});
```

In `agentSops.test.ts`: the fulfillment map is first; its main line is the 8 boxes below in order; every item label in all three `SOP_LISTS` (`sopChecklists.ts`) appears in some fulfillment box's `steps` (case-insensitive substring), so nothing in Jake's SOP is dropped; every `link` resolves to a map.

- [ ] **Step 2:** `npx vitest run src/lib/sopPrompt.test.ts src/lib/agentSops.test.ts`. Expected: FAIL (module and map missing).
- [ ] **Step 3: Add the map.** Id `fulfillment`, name `Client Fulfillment`, tag `Client Fulfillment · signed to live`, title `CLIENT FULFILLMENT · paid to live`. Main line (id, kind): `paid` client, `onboard` jake, `ghl` agent, `follow` agent, `adsbuild` agent, `check` review, `launch` jake, `live` done (the spec's seven phases; phase 7 drawn as `launch` then `live`). Steps carry every item of the spec table with its `sopChecklists.ts` wording, prefixed with the owner when it is not the box's owner, e.g. `"Jake: Connect Facebook To GHL"`. Side door `fix` (edit) from `check` back to `ghl`, labelled "not ready". Handoff boxes (done, with `link`) to `ghl` (from `ghl`), `ads`, `creative`, `landing` (from `adsbuild`). Geometry follows the Manager map (rows 0 and 2 main line, rows 1 and 3 side doors and handoffs).
- [ ] **Step 4: Implement `mapStages`.** Main line: start at the node with an outgoing `main` edge and no incoming one; follow the first outgoing `main` edge; stop at a node already visited. Stage boundary after each `review` box; stage name `"<first box> to <last box>"`, or the box name alone. Off-main nodes join the stage of the first main-line node with an edge into them, else the one they point to. Names: `edit` boxes get `" (only when sent here)"`; `done` boxes with `link` become `"Hand off to <map name>: <t>"`. Owner: `jake` and `review` give `"jake"`, `client` gives `"client"`, the rest `"agent"`. Steps: `steps ?? d ?? []`, with the needs_ok line first on a `review` box. `draft: true` on every stage of a `draft` map.
- [ ] **Step 5: `sopForAgent`:** `mapStages` of the agent's map; for `manager`, append `mapStages` of the fulfillment map with each stage name prefixed `"Client Fulfillment: "`.
- [ ] **Step 6:** Re-run Step 2. Expected: PASS. Then `npm run typecheck`; fix `id` / `link` type fallout in `AgentSopMap.tsx` and `AgentSopsPage.tsx` only as far as types need.
- [ ] **Step 7: Commit** `feat(sops): Client Fulfillment map and map-to-prompt stages`.

### Task 3: Claim and runner read the map

**Files:**
- Create: `apps/command-center/functions/lib/agentSop.ts`
- Modify: `apps/command-center/functions/api/agent-runner/claim.ts`, `apps/command-center/src/lib/agentWire.ts:133-145`
- Modify: `projects/agent-runner/src/wire.ts:111-119`, `projects/agent-runner/src/bundle.ts:265-290`
- Test: `apps/command-center/functions/lib/agentSop.test.ts`, `projects/agent-runner/test/bundle.test.ts:330-350`

**Interfaces:**
- Consumes: `sopForAgent` (Task 2).
- Produces: `withSop(claim: ClaimResponse | null): ClaimResponse | null`, sync, no DB client. Both wire files: `SopStage.draft?: boolean`.

- [ ] **Step 1: Failing tests.** `agentSop.test.ts`: `withSop(null)` is null; a GHL claim gets `sop` equal to `sopForAgent("ghl")`. `bundle.test.ts`: the existing SOP test expects `"from the SOPs tab"` (not "Director page"); a new test renders a `draft: true` stage as `"### Stage 1: Account (draft)"` and the prompt contains `"Stages marked (draft) are Jake's first pass"`.
- [ ] **Step 2:** `npx vitest run functions/lib/agentSop.test.ts` in the app, `npx vitest run test/bundle.test.ts` in the runner. Expected: FAIL.
- [ ] **Step 3:** Implement `withSop`. The claim handler becomes `withSop(await withBrief(client, await claimNext(client, host)))`. In `sopSection`: intro says `from the SOPs tab`; a draft stage heading appends ` (draft)`; if any stage is draft, add `"- Stages marked (draft) are Jake's first pass, not signed off. Follow them, and tell Jake where one does not fit this client."`. The stage-stop rule stays (Build 2 replaces it). Update the wire comments.
- [ ] **Step 4:** Re-run Step 2. Expected: PASS. Then full `npm test` in both projects.
- [ ] **Step 5: Commit** `feat(agents): agents follow their SOPs-tab map`.

### Task 4: SOPs page without the Director; agency Director removed

**Files:**
- Modify: `apps/command-center/src/routes/admin/AgentSopsPage.tsx` (drop `useDirector`; unknown or missing id redirects to `/admin/sops/fulfillment`)
- Modify: `apps/command-center/src/components/admin/sops/AgentSopMap.tsx` (drop the `director` prop, `addedNodes`, `DirectorLine`, the Off flag; keep Draft)
- Modify: `apps/command-center/src/App.tsx:596-606` (`/admin/director/:agent?` becomes `<Navigate to="/admin/sops" replace />`), `apps/command-center/src/routes/admin/AdminLayout.tsx:157-163` (remove the Director nav item, fix the comment)
- Modify: `apps/command-center/src/lib/agentSops.ts` `SOP_KEY` (drop "Faded = off on the Director.")
- Delete: `src/routes/admin/DirectorPage.tsx`, `src/components/admin/director/`, `src/lib/director.ts`, `src/lib/director.test.ts`, `functions/lib/director.ts`, `functions/api/admin/director/`
- Modify: `apps/command-center/src/lib/releaseNotes.ts` (new entry at the top)

- [ ] **Step 1:** Make the edits and deletions. `grep -rni "director" src functions` hits only unrelated words (Contacts, Team, leadScraper job titles), the redirect, and old release notes.
- [ ] **Step 2: Release note:** id `<ship date>-client-fulfillment-sop`, title `Client Fulfillment SOP`, items: `"Agents > SOPs opens on Client Fulfillment: every step of a client setup, paid to live, with who does each one."`, `"Every agent now works from its own map on the SOPs tab."`, `"The Director page is gone. A Director inside each client is next."`
- [ ] **Step 3:** `npm run typecheck && npm test` in the app. Expected: clean.
- [ ] **Step 4: Visual check (M9).** Ask Jake before starting the dev server. Playwright screenshots of `/admin/sops/fulfillment` and `/admin/sops/ghl`, and `/admin/director` landing on SOPs. Adjust geometry until no box or label overlaps.
- [ ] **Step 5: Commit** `feat(sops): retire the agency Director`.

### Task 5: Drop the Director tables (only after Task 1 is answered)

**Files:**
- Create: `apps/command-center/supabase/migrations/0172_drop_agent_sop_director.sql`

- [ ] **Step 1:** `drop table if exists agent_sop_tasks; drop table if exists agent_sop_stages;` (tasks first, they reference stages). Header comment cites Jake's go and this doc.
- [ ] **Step 2: Commit** in the same push as Task 4: `chore(db): drop the agency Director tables`.

### Task 6: Review, ship, verify

- [ ] **Step 1:** `code-review` on the branch diff, then `simplify`; work the findings with `receiving-code-review`.
- [ ] **Step 2:** Merge to `main`, push, watch the CF Pages deploy to success, then `npm run db:migrate`. The new code never reads the dropped tables, so running the migration after the deploy is safe.
- [ ] **Step 3:** Restart the agent runner so it loads the new `bundle.ts`; `install-watcher.ps1 -Status` shows it running.
- [ ] **Step 4: Live smoke:** `/admin/sops` on app.hauckmarketing.com opens Client Fulfillment; `/admin/director` redirects; one read-only GHL Agent turn on Willis whose bundle contains `## Your SOP` and `from the SOPs tab`.
- [ ] **Step 5:** Blueprint GAPS/NODES; memory (retire `project_director.md`, add this build); Jake's checks in the action items README. Keep this doc, Build 2 is still to come.

---

# Build 2 outline (planned in full after Build 1 ships)

1. `client_tasks` table (owner only), seeded from the fulfillment map; backfill for Willis, Made Better, Clear Choice and Above All Garage Doors from `onboarding_checklist` ticks.
2. Director tab in the client rail (`src/lib/clientNav.ts`): swimlanes, card panel, Jake's add, edit, move and tick.
3. Task output block in the runner, replacing the tick block. The server rejects done with no evidence or note, own tasks only, never unticks.
4. Prompt lists the agent's open tasks; the stage-stop rule becomes "do only what Jake names".
5. Manager kickoff: map walk, decisions into Brief Status, one task-list card, Approve writes the tasks. The Manager map is rewritten to its own kickoff-and-track job (moved here from Build 1: there is nothing to kick off into until tasks exist).
6. Brief boxes retired (`BRIEF_BOXES`, `BriefBoxes.tsx`, `briefTicks.ts`); the monitor rule watches task states; the pre-launch check reads tasks.
7. Security review (M8): task text never becomes a `role:"me"` message.
8. One full dry run on a real client.
