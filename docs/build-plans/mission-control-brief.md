# Mission Control Brief

Design agreed with Jake 2026-10-22. The plan gets added to this same file once the design is approved.

Mockup Jake approved: `apps/command-center/docs/mockups/mission-control-brief.html` (open it in a browser, click the page tabs, click an ad row). All data in it is made up.

## Why

Before any client work starts, Jake wants one place per client that holds everything: who the client is, what was found in research, exactly what ads will run, and whether GHL is connected. Today the Brief is a set of free-text sections (Client, Status, Onboarding Call, Launch Call, Market Research, Ads, GHL) that read like a document, not a control panel. Jake wants to watch the agents work inside it and tick things off as they go.

## What it is

The existing client **Brief** (Client > Brief, `BriefPanel.tsx`, tables `client_briefs` + `client_brief_drive`) is rebuilt into a **Mission Control** with five full pages, switched by a pill tab bar at the top:

1. Client Information
2. Full Setup Checklist
3. Market Research
4. Ads
5. GHL

Admin only (owner role). It is not shown to clients, so naming GHL is fine here.

## How a brief gets built (the flow)

1. **Onboarding form arrives.** The Client Information page fills itself in from the form (this already happens for the Client section, `lib/briefClientSeed.ts`). The CSM owns this page from here.
2. **Jake loads assets** for the client (logos, photos, videos). They show on Client Information.
3. **Market Research agent** fills the Market Research page.
4. **Jake and the CSM build the plan** in the CSM chat: the CSM uses the onboarding answers plus the research to plan everything from day one. The Ads agent fills the Ads page from that plan; the GHL agent works the GHL page.
5. **It stays live.** Agents tick checklist items as they finish them and keep their pages current. The CSM adds new assets and updates as work happens.

Nothing in the plan counts as final until Jake approves it (same approve-on-a-card rule the agents follow today).

## The pages

### 1. Client Information (Jake: "that one's fine", keep as mocked)
- **Links:** Drive folder, Ad assets folder, Ads Manager, GHL sub-account, Website, Outcome link.
- **Assets:** thumbnails with an Add button. Jake adds them; the CSM adds more over time.
- **Onboarding answers:** one card per form group (Business, Owner & contact, Services & pricing, Service area, Offer, Logins). Secrets only ever read "On file" (existing rule in `briefClientSeed.ts`).

### 2. Full Setup Checklist
- **One long list, sectioned by area:** Onboarding, Onboarding Call, Market Research, Ads, GHL, Launch Call (order as mocked).
- Each line: tick box, task name, owner (Jake, Client, or an agent), when ticked, and a state: done, "Working" (agent on it), or "Your move" (Jake's).
- Progress bar and count per section. Top stats: done count, agents working, waiting on Jake, launch date.
- **Activity feed** on the right: live list of agents starting and ticking tasks.
- **This is the same task list as the Director tab** (`client_tasks`, mig 0173/0176). A tick in either place is the same tick. The sections map onto the tasks' areas.

### 3. Market Research
- **Top stats:** population across the target ZIPs, share of older homes, competitors on Meta, how competitive the market is.
- **Market:** one row per target ZIP: area name, population, median home value, owner occupied share, competitors serving it.
- **Competitors:** found automatically, focused on ones already running Meta ads. Per competitor: Google rating, review count, ads live on Meta, running since, main angle, Ad Library and website buttons. The client sits in the same table for comparison.
- **Websites:** the client's site (strong points, weak points) and what competitor sites commonly offer, promise, and leave out.
- **Pain points:** extracted from the client's and competitors' Google reviews and the web, ranked by how often they come up, each with a real quote and a count of sources.
- **Data sources are deliberately left open** (Jake, 2026-10-22: "set it there, figure out how after"). Build the page and its data shape now; the research agent fills what it can with today's tools. Known limits for later: the Google Places key returns only 5 reviews per business; Meta's Ad Library API does not cover US commercial ads; `docs/build-plans/reviews-outscraper-wiring.md` may already cover a review scraper.

### 4. Ads
- **Top stats:** daily spend, ads live at launch, objective, launch date.
- **Offer** (Jake: "make sure the offer is in there"): the offer this campaign runs. Willis and Made Better are launching new offers, so it must be per campaign, not only the onboarding form's offer.
- **Campaign structure:** campaign, then ad sets, then each ad, with budget type and targeting summary.
- **Creatives:** count per type (statics, b-roll video, talking head, others), with format notes.
- **Angles:** one card per angle with its description, how many ads use it, and approval state.
- **Ads table:** thumbnail, ad name, type, angle, headline, primary text (clipped), status. **Clicking a row shows the full primary text.**
- **Headlines** at the bottom, tagged by angle.
- No "creative style" section (Jake removed it).

### 5. GHL
- **Three boxes on top:** Connected, Agent doing, Your move (Jake's to-dos).
- Then one section per thing GHL actually uses: **Custom values** (name, key, value, set or not), **Pipeline** (stages in order plus side stages), **Calendars**, **Phone and forms**, **Automations** (workflow, trigger, what it does, live / draft / agent writing).
- Reuse what exists where possible: Client > Accounts checks (`functions/lib/clientAccounts.ts`), the Custom Values mirror, the shared board read (`lib/boardRead.ts`).

## The Director tab (unchanged role)

The Director tab stays as each client's **overview of everything that needs doing, by whom, and the easy place to assign jobs.** It and the Full Setup Checklist read and write the same tasks. The brief does not replace it.

## The Manager's job

- The **Manager Agent** looks over every client's brief and checks it is accurate.
- When it thinks something should be added or changed (to a brief, or to the brief's layout), it **asks Jake first** in the bottom-right chat, in the form "I think we should add X. Does that make sense?" It never adds sections or changes the layout itself.
- Builder's call on cadence; suggested: once a week per client, and after any big change to a brief.

## Which clients get one now

- **Build briefs for:** Willis Windows, Made Better Landscaping Co, Clear Choice Windows, Comfort Wizards LLC. Willis and Made Better are launching other offers, so their Ads pages describe the new offer.
- **Not now:** Above All Garage Doors (ads already running).
- Every new client from here on gets one automatically when their onboarding form arrives.

## Goals

- Jake opens one client and sees, on five pages, everything about that client and its launch.
- Agents visibly do the work inside it: pages fill in, tasks tick, the activity feed moves.
- One task list, shown in two places (Director overview, brief checklist).

## Non-goals

- Picking or paying for research data tools (decided later).
- Changing how agents approve, spend or touch Meta (existing gates stay).
- Anything client-facing.

## Anti-goals (would make it a failure even if it works)

- Two task lists that drift apart.
- A brief that looks complete but holds stale or made-up data: every number shows where it came from or stays empty.
- Agents silently changing the brief's structure; that is Jake's call via the Manager.
- Long explanatory text on the pages (house rule: heading plus content, no sub-text).

## Constraints

- House rules: no em dashes anywhere; no sub-text under headings; admin changes get a `RELEASES` entry in `src/lib/releaseNotes.ts`; update `apps/blueprint/index.html`; migrations via `npm run db:migrate`.
- Agents only write their own parts (existing rule: an agent writes only its own brief section). Map pages to owners: Client Information = CSM, Checklist = everyone ticks their own tasks, Market Research = research, Ads = ads, GHL = ghl.
- Keep the Google Doc copy in the client's Drive (`client_brief_drive`), rendered from the new pages.
- Must work in light and dark, desktop and phone width.

## Left to the builder

- Data shape: the pages are structured (tables, stats, tasks), so free-text markdown sections no longer fit. Choose the storage (new tables or JSON per page) and migrate the old sections' text so nothing is lost.
- How agents write each page (blocks in the output protocol like today's `brief` block, or bridge tools).
- How the GHL page reads live data vs agent-written notes.
- How the Activity feed is sourced (task state changes are already recorded on `client_tasks`).

## Builder's calls (settled 2026-10-22 while Jake was away; overrule any)

The reviewer raised six open points. Jake said "build it", so these are Claude's calls:

1. **Checklist tasks.** Keep the one `client_tasks` list seeded from the Client Fulfillment SOP map. Group it on the page into areas by owner and phase (`taskArea`): Onboarding, Onboarding Call, Market Research, GHL, Ads, Pre-launch Check, Launch Call, Live. Market Research had no tasks, so six are added to the map's "ads + creatives" box (five `Market Research:` tasks and `Jake: Research Approved`), and `ensureTasks` now tops up any seed task a client is missing, so existing clients get them too. A cut task keeps its key, so it is never re-added.
2. **Approval.** Unchanged: Jake still approves on Building cards. Pages show drafts too: each angle and ad carries a status (`draft`, `needs_ok`, `approved`, `live`, `not_made`) the owning agent sets. The protocol rule "the brief holds finished work only" is relaxed for pages: drafts show tagged Needs OK.
3. **After Jake says yes to a Manager suggestion.** Content fixes: the Manager tells Jake which agent to ask (it stays read-only). Layout changes: a code change in a developer session. Page data is fixed, typed JSON.
4. **Ads page.** Holds a list of campaigns (each with its own offer, structure, angles and ads), so Willis and Made Better can show the new offer's campaign. Statuses are agent-written for now; a live Meta read comes later.
5. **Done for this build** = the five pages exist and work, Client Information and GHL fill live, old text is kept, and the agents know how to fill Research and Ads. Running the agents to fill the four clients is a separate step Jake kicks off (it needs Willis's and Made Better's new offers from him).
6. **Old free-text sections** stay in `client_briefs` and show as a **Notes** block at the bottom of the page they belong to: Client on Client Information; Status, Onboarding Call and Launch Call on the Checklist; Market Research, Ads and GHL on their pages. The agents' existing ```brief block keeps writing their Notes.
7. **Assets** = the images in the client's Drive folder (the Image Converter's reader, `lib/clientDriveImages.ts`); Add opens the Drive folder. The CSM adds files there through its Drive tools.
8. **Manager review**: a weekly "Weekly brief review" Auto chat for the Manager, plus a read-only `client_brief` tool on the runner bridge so it can read any client's pages.

# Mission Control Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the client Brief into a five page Mission Control (Client Information, Full Setup Checklist, Market Research, Ads, GHL) that agents fill and tick live.

**Architecture:** Structured pages (Research, Ads) are typed JSON in a new `client_brief_pages` table with the same version lock as `client_briefs`, written by the owning agent through a new ```page block. Client Information and GHL are read live (intake, tenant links, Drive images, GHL API). The checklist is the existing `client_tasks` list grouped into areas. Old free-text sections stay as per-page Notes.

**Tech Stack:** React + TanStack Query (apps/command-center/src), Cloudflare Pages Functions (functions/), Supabase Postgres, vitest; agent runner in projects/agent-runner (Node, vitest).

**Spec:** this file, sections above.

## Global Constraints

- No em dashes in any code, comment, copy or prompt. No sub-text under headings; labels are nouns.
- Owner-only admin routes check `ctx.data.admin?.role === "owner"`.
- Runner routes take the writer from the claimed message (`turnChat`), never from the request.
- Migration `apps/command-center/supabase/migrations/0178_client_brief_pages.sql`, applied with `npm run db:migrate`.
- Same commit as the UI: a `RELEASES` entry in `src/lib/releaseNotes.ts` and the Agents line in `apps/blueprint/index.html`.
- Light and dark, desktop and 390px phone width.
- Build in a worktree; Jake has another session open in this repo.

## Review Focus

- A page never written (version 0) renders every section's empty state, never a crash or "undefined". (Task 5 tests `adsStats`/`areaProgress` on empty input.)
- An agent's ```page block with bad JSON or unknown fields saves nothing harmful: unknown keys dropped, strings capped, em dashes stripped; a refused save becomes a runner note on the agent's next turn. (Tasks 1, 3, 6.)
- A client with no GHL connection, no Drive folder or no intake: each live part fails on its own and the rest still shows. (Task 4 uses `Promise.allSettled`, tested with one rejecting part.)
- Two agent turns racing on one page: the stale one gets 409 and a runner note, as briefs do. (Task 3.)
- A very long primary text expands in full on click and wraps at phone width. (Task 5 visual check.)

---

### Task 1: Page types, validation and checklist areas (pure)

**Files:** Create `apps/command-center/src/lib/briefPages.ts`; Test `apps/command-center/src/lib/briefPages.test.ts`

**Interfaces (produces):**
- `type BriefPageId = "research" | "ads"`; `type ItemStatus = "draft" | "needs_ok" | "approved" | "live" | "not_made"`
- `interface ResearchPage { stats: { population: number | null; olderHomesPct: number | null; competitorsOnMeta: number | null; competition: "low" | "medium" | "high" | null }; zips: { zip: string; area: string; population: number | null; medianHomeValue: number | null; ownerOccupiedPct: number | null; competitors: number | null }[]; competitors: { name: string; isClient: boolean; googleRating: number | null; googleReviews: number | null; metaAdsLive: number | null; runningSince: string; mainAngle: string; adLibraryUrl: string; websiteUrl: string }[]; websites: { clientUrl: string; strong: string; weak: string; commonOffer: string; commonPromise: string; gap: string }; painPoints: { title: string; detail: string; sharePct: number | null; quote: string; sources: number | null }[]; sourcesNote: string }`
- `interface AdsPage { campaigns: { name: string; offer: string; objective: string; dailySpend: number | null; budgetType: string; launchDate: string; adSets: { name: string; targeting: string; form: string }[]; creatives: { type: string; count: number | null; note: string }[]; angles: { name: string; pitch: string; status: ItemStatus }[]; ads: { name: string; type: string; angle: string; headline: string; primaryText: string; status: ItemStatus; adSet: string }[] }[]; headlines: { angle: string; text: string }[] }`
- `interface BriefPageRow { page: BriefPageId; data: ResearchPage | AdsPage; version: number; updatedBy: string | null; updatedAt: string | null }`
- `emptyPage(page): ResearchPage | AdsPage`
- `parsePage(page, raw: unknown): { ok: true; data } | { ok: false; reason: string }`: strings capped at 2000 chars (primaryText 5000), arrays at 50 rows, em dashes replaced with ", ", unknown keys dropped, non-numbers become null, unknown status becomes "draft".
- `pageForAgent(agent: string): BriefPageId | null` (research, ads; else null)
- `type ChecklistArea = "onboarding" | "onboarding-call" | "research" | "ghl" | "ads" | "prelaunch" | "launch-call" | "live"`; `CHECKLIST_AREAS` in that order labelled Onboarding, Onboarding Call, Market Research, GHL, Ads, Pre-launch Check, Launch Call, Live.
- `taskArea({ phase, owner }): ChecklistArea`: owner research, ads, ghl win; then phase paid -> onboarding; onboard -> onboarding for csm, else onboarding-call; ghl/follow -> ghl; adsbuild -> ads; check -> prelaunch; launch -> launch-call; live -> live; else onboarding.
- `activityFrom(tasks: ClientTask[], limit = 12): { key; name; who; what: "done" | "doing"; at: string | null }[]`, done newest first by `doneAt`, doing tasks first.

- [ ] Step 1: failing tests: `parsePage("ads", {campaigns:[{name:"A — B", dailySpend:"x", ads:[{headline:"h", status:"bogus"}]}], extra:1})` is ok with name `"A, B"`, dailySpend null, status "draft", no `extra`; `parsePage("research","nope")` not ok; `emptyPage("research").zips` is `[]`; the four `taskArea` cases (onboard/csm, onboard/jake, adsbuild/research, follow/ghl); `activityFrom` order.
- [ ] Step 2: `npx vitest run src/lib/briefPages.test.ts` (apps/command-center): FAIL.
- [ ] Step 3: implement. Step 4: same command: PASS. Step 5: commit `feat(brief): page types, validation, checklist areas`.

### Task 2: Market Research tasks in the SOP; top-up for existing clients

**Files:** Modify `apps/command-center/src/lib/agentSops.ts` (fulfillment node `adsbuild` steps), `apps/command-center/functions/lib/clientTasks.ts` (`ensureTasks`); Tests in `src/lib/clientTasks.test.ts`, `functions/lib/clientTasks.test.ts`

**Interfaces (produces):** seed keys `adsbuild:market-size-and-zip-population`, `adsbuild:competitors-on-meta`, `adsbuild:client-and-competitor-websites`, `adsbuild:google-reviews-pulled`, `adsbuild:pain-points-extracted` (owner research) and `adsbuild:research-approved` (owner jake), appended after the existing adsbuild steps as `"Market Research: Market Size And ZIP Population"`, `"Market Research: Competitors On Meta"`, `"Market Research: Client And Competitor Websites"`, `"Market Research: Google Reviews Pulled"`, `"Market Research: Pain Points Extracted"`, `"Jake: Research Approved"`.

- [ ] Step 1: failing tests: `seedTasks()` holds the six keys with those owners; `ensureTasks` on a client that already has tasks upserts only the missing seed rows (ignoreDuplicates) and leaves existing rows alone.
- [ ] Step 2: run both test files: FAIL. Step 3: implement (fix any test that pins step counts). Step 4: run them plus `src/lib/agentSops.test.ts src/lib/sopPrompt.test.ts`: PASS. Step 5: commit `feat(tasks): Market Research tasks; existing clients get new seed tasks`.

### Task 3: Page store, admin read, runner write, claim

**Files:** Create `supabase/migrations/0178_client_brief_pages.sql`, `functions/lib/briefPagesStore.ts` (+ test), `functions/api/agent-runner/brief-page.ts`; Modify `functions/api/admin/agents/brief.ts` (GET adds `pages`), `functions/lib/clientBriefs.ts` (`withBrief` adds `pages`), `src/lib/agentWire.ts`, `projects/agent-runner/src/wire.ts`

**Interfaces:**
- Table `client_brief_pages (tenant_id uuid not null references tenants(id) on delete cascade, page text not null check (page in ('research','ads')), data jsonb not null default '{}', version integer not null default 1 check (version >= 1), updated_by text not null, updated_at timestamptz not null default now(), primary key (tenant_id, page))`, RLS on, no policies (as 0168).
- `readPages(client, tenantId): Promise<BriefPageRow[]>`: both pages always, unwritten as `emptyPage` at version 0.
- `savePage(client, { tenantId, page, data, version, by }): Promise<{ saved: BriefPageRow } | { conflict: BriefPageRow } | { error: 400; reason: string }>` with the same version lock as `saveBriefSection`.
- `agentSavePage(client, body: RunnerPageBody)`, `RunnerPageBody = { messageId: string; data: unknown; version: number }`: page from `pageForAgent(turnChat agent)`, 403 when null, 400 with the reason when `parsePage` refuses.
- `POST /api/agent-runner/brief-page` -> 200 `{ page }`, 409 `{ page }`, 400/403/404 `{ error }`.
- `BriefResponse.pages: BriefPageRow[]`; `ClaimResponse.pages?: BriefPageRow[]`.

- [ ] Step 1: failing tests (fake Supabase as in `clientBriefs.test.ts`): first save at version 0 inserts version 1; stale save returns conflict; ghl chat 403; research chat with `{zips:"bad"}` saves empty zips; readPages on empty table returns two version-0 rows.
- [ ] Step 2: run: FAIL. Step 3: implement. Step 4: run it, `functions/lib/clientBriefs.test.ts`, `npx tsc --noEmit -p .`: PASS. Step 5: commit `feat(brief): client_brief_pages store, runner page writes, pages in claim`.

### Task 4: Live data for Client Information and GHL

**Files:** Create `functions/lib/briefLive.ts` (+ test), `functions/api/admin/agents/brief-live.ts`; Modify `src/lib/briefClientSeed.ts` (export `clientAnswerGroups`), `src/lib/agentWire.ts` (`BriefLive`)

**Interfaces:**
- `clientAnswerGroups(intake, { hasPassword }): { heading: string; rows: { label: string; value: string }[] }[]`, used by `clientSeed` too (its output unchanged).
- `GET /api/admin/agents/brief-live?tenant=` (owner) -> `BriefLive { links: { id: "drive" | "assets" | "ads" | "ghl" | "website" | "outcome"; label: string; url: string | null }[]; answers; assets: { name: string; url: string; thumbUrl: string | null }[] | null; assetsError: string | null; ghl: { customValues: { name: string; key: string; value: string }[]; pipelines: { name: string; stages: string[] }[]; calendars: { name: string; active: boolean }[]; workflows: { name: string; status: string }[] } | null; ghlError: string | null }`. Parts run under `Promise.allSettled`.
- Pure shapers: `shapeWorkflows`, `shapePipelines`, `shapeCalendars`, `ghlLocationUrl(id)`, `adsManagerUrl(accountId)` (handles `act_` once).

- [ ] Step 1: failing tests for the shapers and `clientAnswerGroups` (password "On file", unknown key under Other), plus one where the GHL part rejects and links/answers still come back.
- [ ] Step 2: run: FAIL. Step 3: implement. Step 4: run with `src/lib/briefClientSeed.test.ts` and tsc: PASS. Step 5: commit `feat(brief): live client links, answers, assets and GHL read`.

### Task 5: The Mission Control UI

**Files:** Create `src/components/admin/brief/MissionBrief.tsx`, `ClientInfoPage.tsx`, `ChecklistPage.tsx`, `ResearchPage.tsx`, `AdsPage.tsx`, `GhlPage.tsx`, `NotesBlock.tsx`, `missionStyle.tsx`, `missionBrief.ts` (+ test); Modify `src/components/admin/agents/agentApi.ts` (`useBriefLive`; brief query carries `pages`), `src/routes/admin/ClientPage.tsx:115` (render `MissionBrief`)

**Interfaces:** consumes Tasks 1, 3, 4; `SectionBlock`, `DriveChip` from `BriefPanel.tsx`; the Director's task query and tick mutation (same endpoint, so both views agree). Produces the five pages as in `apps/command-center/docs/mockups/mission-control-brief.html`, in the app's tokens with `--brand` from the client's colour. `?page=` holds the tab. Ads rows expand to the full primary text. Jake ticks and unticks on the checklist exactly as on the Director. Empty states are one short line. Pure helpers in `missionBrief.ts`: `areaProgress(tasks)` (cut excluded) and `adsStats(page)` (spend summed, ads not `not_made` counted, earliest launch date).

- [ ] Step 1: failing tests for both helpers, including empty input. Step 2: run: FAIL. Step 3: implement (`BriefTab` beside agent chats stays as is). Step 4: test + tsc pass; open the Brief for Clear Choice on localhost and screenshot all five pages dark, light and 390px. Step 5: commit `feat(brief): Mission Control pages`.

### Task 6: Agents fill and review the brief

**Files:** Modify `projects/agent-runner/src/output.ts` (```page -> `out.page`), `src/api.ts` (`page()` POST `brief-page`, 409 tolerated), `src/runner.ts` (post with the claim's page version; 409 or 400 -> brief note; add `page` to the reply cut list), `src/bundle.ts` (research and ads see their own page JSON and version as "Your brief page"; ads and csm also see research; ghl none), `agents/_protocol.md`, `agents/research.md`, `agents/ads.md`, `agents/csm.md`, `agents/manager.md`, `src/mcpBridge.ts` (manager-only `client_brief` tool), `apps/command-center/functions/api/agent-runner/brief.ts` (runner GET of one tenant's sections + pages), `src/monitor.ts` + `src/monitorRules.ts` (weekly Manager "Weekly brief review" Auto chat, last run under `_briefReview` in the snapshots file). Tests beside each.

- [ ] Step 1: failing tests: ```page parsed and removed from the reply, bad JSON -> null; runner posts once with the version; bundle shows "Your brief page" for research and not for ghl; bridge refuses `client_brief` for a non-manager; monitor plans one Manager chat after 7 days and none before.
- [ ] Step 2: `npx vitest run` in projects/agent-runner: new tests FAIL. Step 3: implement. Step 4: vitest + tsc pass. Step 5: commit `feat(agents): agents fill brief pages; Manager reviews weekly`.

### Task 7: Drive copy, release note, blueprint, ship

**Files:** Modify `functions/lib/briefDrive.ts` (Doc includes `pagesMarkdown(pages)` before the Notes), `src/lib/releaseNotes.ts`, `apps/blueprint/index.html`

- [ ] Step 1: failing test: `pagesMarkdown` renders a campaign's ads with full primary text and renders nothing for empty pages. Step 2: implement; full app vitest + tsc (the known intake funnel parity failure aside).
- [ ] Step 3: merge the worktree to main, `npm run db:migrate`, push, wait for the live bundle, pull + restart the VPS runner, smoke-test the Brief live for one client.
- [ ] Step 4: report to Jake with his checklist (Willis and Made Better new offers, kick off research per client).
