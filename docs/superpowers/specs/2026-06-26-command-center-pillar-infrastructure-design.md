# Command Center Pillar Infrastructure : Design

Date: 2026-06-26
Status: Approved design, pending spec review

## Goal

Restructure the admin Command Center around the way the business actually runs:
six pillars, each treated as a "business within a business" with its own goal,
scoreboard, components, and (future) Hermes agent. The sidebar becomes the org
chart. A living Infrastructure map shows the whole machine on one screen. The
whole thing is data-driven so it updates as we build.

This is a baseline. We define the full frame now, then attack each pillar
(vertical) one at a time, filling in real assets and processes as we go.

## The Pillar Model

Six pillars. Operations is the hub; the other five are the value chain it feeds.

| # | Pillar | Shape | Role |
|---|--------|-------|------|
| hub | Operations | Parallel lanes | The backbone the whole line runs in |
| 01 | Outreach | Parallel lanes (channels) | Get prospects in the door |
| 02 | Sales | Sequential pipeline | Turn prospects into paying clients |
| 03 | Onboarding | Sequential pipeline | New client setup, first 14 days |
| 04 | Service Delivery | Parallel lanes (service lines) | The product: the actual work |
| 05 | Retention | Parallel lanes (motions) | Keep clients, report, expand |

Two shapes:
- **Parallel lanes:** independent tracks side by side (Outreach, Service
  Delivery, Operations, Retention). Add or remove one without touching others.
- **Sequential pipeline:** ordered stages a client moves through front to back
  (Sales, Onboarding).

### The universal lane skeleton

Every lane and every pipeline stage fills in the same mini-skeleton. This is
what makes it infrastructure and not a pile of notes:

`Input -> Process -> Output / handoff -> Scoreboard (2-3 numbers) -> Owner (human or Hermes)`

### Lane / stage map (the baseline)

**Operations (lanes / functions)**
- Finance (invoicing, P&L, payroll) [future]
- SOPs + knowledge (the vault) [live: SOP Hub]
- Tooling + infra (Command Center, Build Lab, integrations) [live: Build Lab, Plans, Tasks]
- **Stack** : full inventory of every software the agency / Jake / Hermes uses [new]
- Team + hiring [future]
- Company reporting [future]
- Admin + legal [future]
- Team comms [live: Messages]

**Outreach (lanes / channels)** : all new, container scaffolded
- Cold email
- Cold calling
- Paid ads (lead gen)
- LinkedIn / social outbound
- Referrals + word of mouth
- Partnerships / affiliates

**Sales (pipeline stages)** : all new, container scaffolded
- Qualified lead -> Discovery call -> Pitch / proposal -> Follow-up -> Closed won -> handoff to Onboarding
- Nurture holding bucket (not-yet)

**Onboarding (pipeline stages)**
- Welcome / paid -> Kickoff call -> Collect access + assets -> Tech / account setup -> First campaign live -> handoff to Delivery + Retention [live: Onboarding wizard]

**Service Delivery (lanes / service lines)** : split by effort, not service type
- **Deploy (clone, low marginal effort):** Website, Software / dashboard,
  Sales infrastructure (GHL snapshot), Tracking + attribution, AI agents (build)
- **Manage (grind, ongoing):** Paid ads, SEO, AI agents (tuning)
- **Future lane (greyed):** Commercial lead-gen *for* clients (cold email to
  win commercial jobs for construction / service businesses)

**Retention (lanes / motions)**
- Client reporting (mostly auto-produced by the Software lane)
- Relationship + check-ins
- Performance vs client goals
- Upsell / expansion
- Churn-risk saves

## Navigation : three-level drill-down

1. **Sidebar pillar** (Operations pinned top, then 01-05 numbered, Infrastructure
   map pinned bottom).
2. **Pillar page** : the pillar's lanes/stages as cards, plus a header card.
3. **Lane workspace** : a full page per lane. Part operating manual, part
   launchpad.

### Sidebar layout

```
Clients                    (shared record, cross-pillar, near top)
---------------------------------
Operations (hub)           Tasks, Build Lab, Plans, SOP Hub, Messages, Stack
---------------------------------
01  Outreach               (new container)
02  Sales                  (new container)
03  Onboarding             Onboarding wizard
04  Service Delivery       Paid Ads, Assets/Deploy Kit, SEO, AI agents, Software...
05  Retention              Reporting, client health
---------------------------------
Infrastructure map         (pinned bottom)
```

The current flat nav (`Clients, Onboarding, Tasks, Build Lab, Plans, SOP Hub,
Assets, Messages`) is regrouped under pillars. Clients stays near the top as the
shared record every pillar acts on.

### Re-homing rule

Keep every existing page working exactly as-is. Pillar pages **link or embed**
the existing routes; we do not physically move/rename route files in v1.
Re-homing is navigational, so nothing breaks.

### Pillar page layout

- **Header card:** pillar goal, 2-3 scoreboard numbers, greyed Hermes slot.
- **Lane visual:** the lanes (or pipeline stages) drawn as a small diagram.
- **Lane cards:** one card per lane, each linking to its workspace.
- **Build space:** an obvious "new assets for this pillar go here" affordance.

### Lane workspace template (every lane inherits)

- **What it is** : one line.
- **How we deliver it** : the step-by-step process / SOP.
- **Assets + templates** : the reusable stuff.
- **Linked tools** : e.g. the Software lane links to Build Lab, the dashboard,
  the GHL snapshot.
- **Scoreboard** + greyed **Hermes slot**.

## The Infrastructure map (living view)

One screen, the whole machine: 6 pillars, their lanes, the flow between them, and
a status dot on each node (`planned` / `building` / `live`). This is the in-app
version of the blueprint concept, but it lives in admin and is data-driven.
Pinned to the bottom of the sidebar.

## The hybrid data engine

One source-of-truth config file, `pillars.ts`, defines every pillar, lane, the
routes mapped into it, declared status, scoreboard fields, and a Hermes slot.
**Both the sidebar and the Infrastructure map render from it.**

Hybrid behaviour:
- **Structure** comes from the config. Add a lane to `pillars.ts` and it appears
  in the sidebar, the pillar page, and the map automatically.
- **Live status + numbers** are pulled from real data where a source exists
  (e.g. live client count, ad spend), and fall back to the config's declared
  status where no data source exists yet.

So as real features land in a pillar, that pillar lights up from `planned` to
`live` on its own.

### Config shape (sketch)

```ts
type Status = 'planned' | 'building' | 'live';

interface Lane {
  id: string;
  label: string;
  what: string;            // one-line "what it is"
  status: Status;          // declared fallback
  motion?: 'deploy' | 'manage';   // Service Delivery only
  links?: { label: string; to: string }[];  // re-homed tools
  scoreboard?: ScoreboardField[];
  hermes: null;            // future agent slot
  future?: boolean;        // greyed on the board
}

interface Pillar {
  id: string;
  order: number | 'hub';
  label: string;
  shape: 'lanes' | 'pipeline';
  goal?: string;
  scoreboard?: ScoreboardField[];
  hermes: null;            // future agent slot
  lanes: Lane[];
}
```

A `liveStatus(pillarOrLane)` helper resolves the displayed status: real data if a
source is wired, else the declared `status`.

## Hermes-ready, not Hermes-now

Every pillar and lane carries an empty `hermes: null` slot. Greyed on the board
today. When Hermes is built later, slots flip on, starting with Operations (the
conductor the five spokes report into). No rework: the slots already exist.

## v1 scope

Build the full **skeleton end to end**, plus **one lane fully built as the
reference example**:

- `pillars.ts` config engine + `liveStatus` helper.
- Sidebar regrouped into pillars (Operations top, 01-05, Infrastructure bottom).
- All 6 pillar pages (header card + lane visual + lane cards + build space).
- Lane workspace template component.
- **Software lane (Service Delivery), fully built** as the reference: real
  "what it is", delivery process, assets, links to Build Lab / dashboard / GHL
  snapshot. Every other lane uses the same template, scaffolded but thin.
- Operations **Stack** page : inventory of every software in the business.
- Infrastructure map view, data-driven, status dots.

Then we replicate lane-by-lane as Jake attacks each vertical.

## Non-goals (v1)

- Building Hermes or any agent wiring (slots only).
- Physically moving/renaming existing route files.
- Filling every lane's real content (only Software is fully built).
- Wiring live data for every scoreboard (only where a source already exists).
- Touching the client-facing app or the standalone `blueprint/` page.

## Success criteria

- Sidebar shows the six pillars; Operations top, Infrastructure bottom.
- Every existing admin tool is reachable from its pillar; nothing broke.
- Clicking a pillar shows its lanes; clicking the Software lane shows a complete
  operating-manual workspace.
- The Infrastructure map renders the whole machine from `pillars.ts` with status
  dots, and a config edit is reflected in sidebar + page + map together.
- Operations Stack lists the full software inventory.
- Adding a new lane to `pillars.ts` requires no other code change to appear.
