# Command Center Pillar Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the admin Command Center around six business pillars, each a "business within a business," with a config-driven sidebar, per-pillar pages, lane workspaces, an Operations software-stack inventory, and a living Infrastructure map.

**Architecture:** One source-of-truth config (`lib/pillars.ts`) defines every pillar, lane, mapped route, declared status, and a future Hermes slot. A pure helper module (`lib/pillarStatus.ts`) resolves display status (live data overrides declared). The sidebar, pillar pages, lane workspaces, and Infrastructure map all render from that config. Existing admin routes are re-homed by linking, never moved.

**Tech Stack:** React 18, react-router-dom v6, TypeScript, Vite, Vitest, lucide-react, scoped `<style>` blocks reading global CSS tokens (`var(--surface)`, `var(--brand)`, `var(--font-display)`, etc.).

## Global Constraints

- App root: `command-center/app`. All paths below are relative to it.
- Never use em dashes anywhere (code, comments, copy). Use commas, periods, colons, parentheses.
- Reuse existing CSS tokens: `--surface`, `--surface-2`, `--surface-3`, `--border`, `--divider`, `--text`, `--text-muted`, `--text-faint`, `--brand`, `--brand-tint`, `--brand-text`, `--brand-fg`, `--radius`, `--radius-lg`, `--shadow-sm`, `--font-display`, `--font-body`. Do not introduce new color literals except neutral status colors already in the theme.
- Follow the existing admin page pattern: a self-contained component with a scoped `<style>` block (see `routes/admin/AdminSops.tsx`). No new global CSS.
- Do NOT move or rename existing route files. Re-homing is navigational only.
- Test runner: `npm test` (`vitest run`). Build: `npm run build` (`tsc && vite build`). Typecheck: `npm run typecheck`.
- Status vocabulary is exactly: `planned` | `building` | `live`.

---

### Task 1: Pillar config + status engine

**Files:**
- Create: `command-center/app/src/lib/pillars.ts`
- Create: `command-center/app/src/lib/pillarStatus.ts`
- Test: `command-center/app/src/lib/pillarStatus.test.ts`

**Interfaces (Produces):**

```ts
// pillars.ts
export type PillarStatus = 'planned' | 'building' | 'live';
export type LaneMotion = 'deploy' | 'manage';

export interface LaneLink { label: string; to: string; external?: boolean }
export interface ScoreboardField { label: string; value?: string; metricKey?: string }

export interface PillarLane {
  id: string;
  label: string;
  what: string;                 // one-line "what it is"
  status: PillarStatus;         // declared fallback
  motion?: LaneMotion;          // Service Delivery only
  future?: boolean;             // greyed on the board
  process?: string[];           // "how we deliver it" steps (Software is filled)
  assets?: string[];            // reusable templates/assets
  links?: LaneLink[];           // re-homed tools
  scoreboard?: ScoreboardField[];
  hermes: null;                 // future agent slot
}

export interface Pillar {
  id: string;
  order: number | 'hub';        // 'hub' = Operations, sorts first
  num?: string;                 // display number "01".."05"
  label: string;
  icon: string;                 // lucide icon name, resolved in UI
  tagline: string;
  shape: 'lanes' | 'pipeline';
  goal?: string;
  scoreboard?: ScoreboardField[];
  hermes: null;
  lanes: PillarLane[];
}

export const PILLARS: Pillar[];
```

```ts
// pillarStatus.ts
import type { Pillar, PillarLane, PillarStatus } from './pillars';
export function getPillar(id: string): Pillar | undefined;
export function getLane(pillarId: string, laneId: string): PillarLane | undefined;
export function orderedPillars(): Pillar[];          // 'hub' first, then num asc
export type LiveData = Record<string, number | string>;
// liveStatus: if node has a scoreboard metricKey present in liveData, treat as 'live';
// otherwise return declared status.
export function liveStatus(node: Pillar | PillarLane, live?: LiveData): PillarStatus;
export function rollUpStatus(p: Pillar, live?: LiveData): PillarStatus; // highest of its lanes
```

- [ ] **Step 1: Write the failing test** `lib/pillarStatus.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { getPillar, getLane, orderedPillars, liveStatus, rollUpStatus } from './pillarStatus';
import { PILLARS } from './pillars';

describe('pillar config', () => {
  it('has the six pillars', () => {
    const ids = PILLARS.map((p) => p.id).sort();
    expect(ids).toEqual(['onboarding', 'operations', 'outreach', 'retention', 'sales', 'service'].sort());
  });
  it('orders operations (hub) first, then by number', () => {
    const ordered = orderedPillars();
    expect(ordered[0].id).toBe('operations');
    expect(ordered.slice(1).map((p) => p.num)).toEqual(['01', '02', '03', '04', '05']);
  });
  it('looks up a pillar and a lane', () => {
    expect(getPillar('service')?.label).toBe('Service Delivery');
    expect(getLane('service', 'software')?.label.toLowerCase()).toContain('software');
    expect(getLane('service', 'nope')).toBeUndefined();
  });
  it('software lane carries delivery process + tool links', () => {
    const lane = getLane('service', 'software')!;
    expect(lane.process && lane.process.length).toBeGreaterThan(2);
    expect(lane.links && lane.links.length).toBeGreaterThan(0);
  });
  it('every pillar and lane has a hermes slot (future)', () => {
    for (const p of PILLARS) {
      expect(p.hermes).toBeNull();
      for (const l of p.lanes) expect(l.hermes).toBeNull();
    }
  });
});

describe('liveStatus', () => {
  it('falls back to declared status with no live data', () => {
    const lane = getLane('service', 'paid-ads')!;
    expect(liveStatus(lane)).toBe(lane.status);
  });
  it('promotes to live when a scoreboard metric has data', () => {
    const p = getPillar('retention')!;
    const withMetric: Pillar = {
      ...p,
      scoreboard: [{ label: 'Active clients', metricKey: 'activeClients' }],
    };
    expect(liveStatus(withMetric, { activeClients: 1 })).toBe('live');
    expect(liveStatus(withMetric, {})).toBe(p.status);
  });
  it('rollUpStatus returns the highest lane status', () => {
    const p = getPillar('operations')!;
    expect(['planned', 'building', 'live']).toContain(rollUpStatus(p));
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (`npx vitest run src/lib/pillarStatus.test.ts`) with "cannot find module './pillars'".

- [ ] **Step 3: Implement `lib/pillars.ts`** with all six pillars and the lane map from the spec. Operations lanes: sops (live, links `/admin/sops`), tooling (live, links `/admin/build`, `/admin/plans`, `/admin/tasks`), stack (building, links `/admin/stack`), comms (live, links `/admin/messages`), finance (planned, future), team (planned, future), reporting (planned, future), admin-legal (planned, future). Outreach lanes (all planned, future): cold-email, cold-calling, paid-ads-leadgen, linkedin, referrals, partnerships. Sales (pipeline, planned, future): qualified, discovery, proposal, follow-up, closed-won, nurture. Onboarding (pipeline): welcome, kickoff, collect-access, tech-setup, first-campaign (status building; links `/admin/onboarding`). Service (shape lanes): software (live, motion deploy, full `process` + `assets` + links to `/admin/build`, `/admin/clients`, GHL), website (building, deploy), sales-infra (building, deploy), tracking (building, deploy), ai-agents (planned, deploy/manage note), paid-ads (live, manage, links `/admin/clients`), seo (planned, manage), commercial-leadgen (planned, manage, future). Retention lanes: reporting (building), relationship (planned, links `/admin/messages`), performance (planned), upsell (planned), saves (planned). Give each pillar a real `goal`, `tagline`, lucide `icon` name, and 2-3 scoreboard fields (value left undefined where no live source).

- [ ] **Step 4: Implement `lib/pillarStatus.ts`** per the interfaces above. `orderedPillars` sorts `'hub'` first then numeric `num`. `liveStatus` returns `'live'` when any scoreboard `metricKey` is present and non-empty in `live`, else the declared `status`. `rollUpStatus` returns the max lane status by rank planned<building<live.

- [ ] **Step 5: Run test, expect PASS** (`npx vitest run src/lib/pillarStatus.test.ts`).

- [ ] **Step 6: Typecheck** (`npm run typecheck`) expect clean.

- [ ] **Step 7: Commit** `feat(pillars): config + status engine`.

---

### Task 2: Shared pillar UI primitives

**Files:**
- Create: `command-center/app/src/components/pillars/PillarKit.tsx`

**Interfaces (Produces):**

```tsx
export function PillarStyle(): JSX.Element;                       // scoped <style id="pillar-kit">
export function StatusDot({ status }: { status: PillarStatus }): JSX.Element;
export function HermesSlot({ compact }: { compact?: boolean }): JSX.Element;  // greyed "Hermes: future"
export function Scoreboard({ fields }: { fields: ScoreboardField[] }): JSX.Element;
export function pillarIcon(name: string): LucideIcon;            // map config icon string -> component
```

- [ ] **Step 1:** Implement `PillarKit.tsx`. `PillarStyle` defines `.pk-*` classes (cards, dot colors: planned=`--text-faint`, building=`--brand`, live green, all from tokens; the Hermes slot uses muted dashed border). `pillarIcon` maps the icon strings used in `pillars.ts` to lucide components with a `Boxes` fallback. Consume `PillarStatus`/`ScoreboardField` types from `lib/pillars`.
- [ ] **Step 2:** Typecheck (`npm run typecheck`), expect clean.
- [ ] **Step 3: Commit** `feat(pillars): shared UI kit (status dot, scoreboard, hermes slot)`.

---

### Task 3: Config-driven sidebar regroup

**Files:**
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx`

**Interfaces (Consumes):** `orderedPillars` from `lib/pillarStatus`, `pillarIcon`/`StatusDot` from `components/pillars/PillarKit`.

- [ ] **Step 1:** Replace the flat `ADMIN_NAV` with a grouped render: a top "Clients" link (`/admin/clients`), then for each `orderedPillars()` a group whose header links to `/admin/pillar/:id` (Operations labelled "Operations", others prefixed with `num`), and a pinned bottom "Infrastructure" link (`/admin/infrastructure`, icon `Map`). Each pillar header row shows a `StatusDot` using `rollUpStatus`. Keep the existing desktop rail + phone bar structure, brand block, profile/theme/signout footer unchanged. Direct deep links (Onboarding, SOP Hub, etc.) are reached via their pillar pages, not the rail, so the rail gets shorter and clearer.
- [ ] **Step 2:** Run the app dev server is not required; do `npm run typecheck` (clean) and `npm run build` (succeeds).
- [ ] **Step 3: Commit** `feat(pillars): sidebar regrouped around pillars`.

---

### Task 4: Pillar page route

**Files:**
- Create: `command-center/app/src/routes/admin/AdminPillar.tsx`
- Modify: `command-center/app/src/App.tsx` (add route `/admin/pillar/:pillarId` inside `AdminRoute`)

**Interfaces (Consumes):** `getPillar`, `liveStatus` (`lib/pillarStatus`); `PillarStyle`, `StatusDot`, `Scoreboard`, `HermesSlot`, `pillarIcon` (PillarKit). **Produces:** route URL `/admin/pillar/:pillarId`.

- [ ] **Step 1:** Build `AdminPillar.tsx`: reads `:pillarId`, 404-soft (redirect to `/admin/clients`) if unknown. Renders header card (icon, num+label, tagline, goal, `Scoreboard`, `HermesSlot`), a lane visual (lanes as a horizontal flow for `pipeline` shape, a wrapped grid for `lanes` shape, each node a `LaneCard` linking to `/admin/pillar/:pillarId/:laneId` with a `StatusDot` and `future` greying), and a "Build space" footer card ("New assets for this pillar go here."). Service Delivery groups its lanes under "Deploy" and "Manage" subheads via `lane.motion`.
- [ ] **Step 2:** Wire the route in `App.tsx`.
- [ ] **Step 3:** `npm run typecheck` clean; `npm run build` succeeds.
- [ ] **Step 4: Commit** `feat(pillars): pillar page with lane visual`.

---

### Task 5: Lane workspace route

**Files:**
- Create: `command-center/app/src/routes/admin/AdminLane.tsx`
- Modify: `command-center/app/src/App.tsx` (add route `/admin/pillar/:pillarId/:laneId`)

**Interfaces (Consumes):** `getPillar`, `getLane`, `liveStatus`; PillarKit. **Produces:** route `/admin/pillar/:pillarId/:laneId`.

- [ ] **Step 1:** Build `AdminLane.tsx`: back link to the pillar; header (lane label, `what`, `StatusDot`, motion pill if present); sections rendered only when present: "How we deliver it" (numbered `process`), "Assets and templates" (`assets` list), "Linked tools" (`links`, internal via `Link`, external via anchor), "Scoreboard" (`Scoreboard`), and a greyed `HermesSlot`. Empty lanes show a calm "Not built yet. This is where the SOP, assets, and tools for this lane will live." placeholder instead of blank sections.
- [ ] **Step 2:** Wire the route in `App.tsx` (after the pillar route).
- [ ] **Step 3:** `npm run typecheck` clean; `npm run build` succeeds.
- [ ] **Step 4: Commit** `feat(pillars): lane workspace template`.

---

### Task 6: Operations Stack inventory page

**Files:**
- Create: `command-center/app/src/lib/stackData.ts`
- Create: `command-center/app/src/routes/admin/AdminStack.tsx`
- Modify: `command-center/app/src/App.tsx` (route `/admin/stack`)

**Interfaces (Produces):**
```ts
export interface StackTool { name: string; category: string; what: string; used_by: ('agency'|'jake'|'hermes')[]; url?: string }
export const STACK_TOOLS: StackTool[];
export const STACK_CATEGORIES: string[];  // ordered
```

- [ ] **Step 1:** Author `stackData.ts`: inventory every tool in the business, grouped by category. Include at minimum: Infra/Hosting (Cloudflare Pages, Vercel, Namecheap DNS, Supabase), Dev/Build (Command Center app, GitHub repo, Trigger.dev, Composio), Ads/Marketing (Meta Ads / Graph API, Google Ads, GoHighLevel + snapshots), AI/Agents (Claude / Anthropic API, Claude Code, Hermes VPS agent, ScreenshotOne), Comms/Productivity (Gmail MCP, Google Drive MCP, Google Calendar, Discord-style internal chat, Telegram for Hermes). Tag each with `used_by`. URLs where known.
- [ ] **Step 2:** Build `AdminStack.tsx`: grouped-by-category card list (reuse the AdminSops visual idiom), each tool row showing name, what, `used_by` chips, and an external link. A small filter by `used_by` (agency / jake / hermes / all) is enough; no search required.
- [ ] **Step 3:** Wire `/admin/stack` in `App.tsx`.
- [ ] **Step 4:** `npm run typecheck` clean; `npm run build` succeeds.
- [ ] **Step 5: Commit** `feat(pillars): operations software stack inventory`.

---

### Task 7: Infrastructure map view

**Files:**
- Create: `command-center/app/src/routes/admin/AdminInfrastructure.tsx`
- Modify: `command-center/app/src/App.tsx` (route `/admin/infrastructure`)

**Interfaces (Consumes):** `orderedPillars`, `rollUpStatus`, `liveStatus`; PillarKit.

- [ ] **Step 1:** Build `AdminInfrastructure.tsx`: a one-screen map. Operations as a hub band at top; the five value-chain pillars as a left-to-right flow (Outreach -> Sales -> Onboarding -> Service -> Retention) with connector chevrons; each pillar a card showing num, label, `StatusDot` (rollUp), goal, and its lanes as small status-dotted chips. A legend (planned / building / live + greyed = Hermes future). Everything renders from config so adding a lane appears here automatically. Card click navigates to `/admin/pillar/:id`.
- [ ] **Step 2:** Wire `/admin/infrastructure` in `App.tsx`.
- [ ] **Step 3:** `npm run typecheck` clean; `npm run build` succeeds.
- [ ] **Step 4: Commit** `feat(pillars): living infrastructure map`.

---

### Task 8: Integration verification

- [ ] **Step 1:** `npm test` (vitest run) all pass.
- [ ] **Step 2:** `npm run typecheck` clean.
- [ ] **Step 3:** `npm run build` succeeds.
- [ ] **Step 4:** Run the dev app, log in to admin, and screenshot: sidebar (pillar groups), a pillar page (Service Delivery), the Software lane workspace, the Stack page, and the Infrastructure map. Confirm: nothing broke on existing routes, Software lane is fully populated, status dots render, Hermes slots are greyed.
- [ ] **Step 5: Commit** any fixes `fix(pillars): integration polish`.

## Self-Review notes

- Spec coverage: six pillars + two shapes (Task 1 data), three-level nav (Tasks 3/4/5), hybrid engine (Task 1 `liveStatus`), Hermes slots (Task 1 data + PillarKit `HermesSlot`), Stack page (Task 6), Infrastructure map (Task 7), Software reference lane (Task 1 content + Task 5 render). Re-homing by link only (Tasks 1 `links`, 3 sidebar). Covered.
- Non-goals respected: no Hermes wiring, no route-file moves, no client app or `blueprint/` changes.
- Execution: Tasks 1 and 2 first (foundation). Then 3, 4, 5, 6, 7 fan out in parallel (distinct files; all append routes to `App.tsx`, so serialize the `App.tsx` edits or assign App.tsx wiring to one integrator). Task 8 last.
