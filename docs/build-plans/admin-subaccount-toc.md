# Admin Revamp — Subaccount Roster + Theory-of-Constraints Command View

> **Status:** spec + plan. Design validated via interactive prototype at
> `docs/mockups/admin-roster-full/admin.html`. Not yet built into the app.
> **For implementers:** follow the phases in order. Each task lists exact files and an acceptance check.

**Goal:** Rebuild the command-center admin into a whole-business command view: a Theory-of-Constraints pillar layer that runs the *business*, and a subaccount roster + per-client cockpit (living inside the Service Delivery pillar) that runs the *clients*.

**Architecture:** New admin shell (icon spine → Command · Acquisition · Sales · Service Delivery · Operations · Settings) replacing the current 6-pillar IA. Command is a cross-pillar overview with a system-constraint banner. Each pillar page renders from a config + a DB-backed constraint/attack record. Service Delivery is special: it mounts the roster rail (list of `tenants`) plus a per-client cockpit whose Config tab is today's `AdminClientDetail`, and whose other tabs embed existing client-app data scoped to that tenant. "Enter live app" reuses the existing `previewClient` flow.

**Tech Stack:** React 19 + React Router 7 (SPA, `command-center/app`), Cloudflare Pages Functions over Supabase, existing `.pk-kit` Modern Motion theme (`PillarKit.tsx`), Poppins/Inter, indigo→violet.

## Global Constraints

- Never name GoHighLevel / "GHL" in any client-facing surface. Admin screens may (see [[project_team_tab_and_ghl_hidden]]). The subaccount cockpit is an ADMIN surface, so "backend connection" language is fine there, but the "Enter live app"/"View as owner" client app must stay clean.
- No em dashes (—) anywhere in UI text, copy, or comments.
- Reuse the existing `.pk-kit` tokens and shell classes; do not introduce a parallel design system.
- DB migrations apply via `npm run db:migrate` (Management API + ledger), never the SQL editor. See [[project_db_migrations_automated]].
- Desktop admin only for v1 (phone admin later).

---

## Part 1 — Spec

### 1.1 Information architecture

Spine (top→bottom): **Command · Acquisition · Sales · Service Delivery · Operations**, then **Settings** + account avatar pinned bottom. The old `lib/pillars.ts` 6-pillar model, `AdminPillar.tsx` tabbed workspaces, and the standalone `/admin/sops`, `/admin/onboarding`, `/admin/infrastructure`, agency-team, and `/admin/clients` list are retired or folded:

- **Command** (`/admin`): the business as a flow. System-constraint banner + agency KPIs + Acquisition→Sales→Service Delivery flow cards (constraint pillar highlighted) + Operations foundation card + ranked constraints board.
- **Acquisition / Sales / Operations** (`/admin/pillar/:id`): throughput KPIs + funnel + constraint spotlight + attack plan. Operations additionally embeds Team capacity + Systems (folds in old SOPs/Infra/agency-team content).
- **Service Delivery** (`/admin/delivery`): roster rail (all `tenants`) + main region. Main defaults to the Delivery pillar overview (its constraint/attack + at-risk accounts). Selecting a client → per-client cockpit.
- **Settings** (`/admin/settings`): agency profile + integrations.

### 1.2 Subaccount cockpit tabs (per tenant)

`Overview · Paid Ads · Leads · Inbox · Calendar · Revenue · Team · Config`. Each is the same data the client app already renders, scoped to the selected tenant (admin-side, editable), plus:

- Header: tenant identity, plan/health chips, **Enter live app** (`previewClient(tenantId)`), **View as owner** (`previewClient(tenantId, staffId)`), breadcrumb back to Service Delivery.
- **Config** = today's `AdminClientDetail.tsx` content (branding, backend connection, owner login, surfaces/entitlements, staff+perms). This already exists; the rework is presentation into the tab shell.
- Other tabs (Ads/Leads/Inbox/Calendar/Revenue/Team): v1 renders each from existing client-app queries with an explicit `tenantId` param. Where a query cannot yet accept a tenant server-side, that tab shows a "read-only preview" state and is completed in Phase 3+.

### 1.3 Data model — constraints

New table `pillar_constraints` (manual, Jake-owned; throughput KPIs auto-fill from data where they exist):

```
pillar_constraints
  id            uuid pk default gen_random_uuid()
  pillar        text  not null  -- 'acquisition'|'sales'|'delivery'|'operations'
  title         text  not null  -- e.g. "Delivery capacity is the system constraint"
  severity      text  not null  -- 'high'|'med'|'low'  (high = binding/system constraint)
  metric        text            -- freeform, e.g. "7 accounts · 1 media buyer"
  detail        text            -- the paragraph
  impact        text            -- one line
  is_system     boolean default false  -- exactly one true = the governing constraint
  updated_at    timestamptz default now()

pillar_constraint_steps
  id            uuid pk
  constraint_id uuid fk -> pillar_constraints.id on delete cascade
  step          text  not null  -- 'Identify'|'Exploit'|'Subordinate'|'Elevate'|'Repeat'
  action        text  not null
  owner         text
  status        text  not null default 'todo' -- 'todo'|'doing'|'done'
  sort          int   default 0
```

Throughput KPIs per pillar are computed in a Function from existing signals where available (e.g. delivery = count of live tenants, at-risk = tenants flagged warn); otherwise a manual number stored alongside the constraint (add `throughput_val text`, `throughput_label text` to `pillar_constraints`). One `pillar_constraints` row per pillar for v1 (upsert by `pillar`).

### 1.4 Reuse map (from code exploration)

| Need | Reuse |
|---|---|
| Admin gate + shell | `AdminRoute` (`App.tsx:102`), rebuild `AdminLayout.tsx` spine |
| Theme | `.pk-kit` in `PillarKit.tsx`, tokens in `index.css` |
| Tenant list / CRUD | `functions/api/admin/clients/index.ts`, `[tenantId].ts` |
| Tenant model | `tenants` table (`0001_init.sql`), `AdminClient`/`ApiTenant` in `src/lib/api.ts` |
| Client hub → Config tab | `AdminClientDetail.tsx` |
| Enter live app / View as | `previewClient` (`AuthContext.tsx:524`), `functions/api/admin/clients/[tenantId]/preview.ts` |
| Cockpit tab data | existing client-app queries/hooks (Leads, Inbox, Calendar, Revenue, Ads) parameterised by tenant |

### 1.5 v1 boundary

**In v1:** new shell + routing; Command; Service Delivery pillar (roster + cockpit) with Config tab fully working and Overview/Ads/Leads real where the query already supports a tenant param; `pillar_constraints` table + read + a minimal in-app editor; Acquisition/Sales/Operations pillar pages reading their constraint record (overview shells).
**Later:** deep-wire remaining cockpit tabs to per-tenant data; auto-computed throughput for all pillars; phone admin.

---

## Part 2 — Build plan (phased)

### Phase 0 — Scaffolding & data

**Task 0.1 — Constraints migration**
- Create: `command-center/app/supabase/migrations/00XX_pillar_constraints.sql` (tables from §1.3, plus `throughput_val`, `throughput_label`).
- Seed one row per pillar with the prototype's copy (delivery `is_system=true`, severity high).
- Apply: `npm run db:migrate`. Acceptance: rows present via a `select`; migrate ledger records it.

**Task 0.2 — Constraints API**
- Create: `functions/api/admin/constraints/index.ts` (`onRequestGet` returns all pillars + steps; `onRequestPut` upserts a pillar's record + steps). Service client, admin-gated like the clients endpoints.
- Add client wrapper in `src/lib/api.ts`: `getConstraints()`, `saveConstraint(pillar, payload)` with typed `PillarConstraint`/`ConstraintStep`.
- Acceptance: GET returns seeded data; PUT round-trips.

### Phase 1 — New admin shell & routing

**Task 1.1 — Spine + layout**
- Rewrite: `AdminLayout.tsx` to the icon spine (Command/Acquisition/Sales/Service Delivery/Operations + Settings/avatar), tooltips, active state by route. Keep `.pk-kit` wrapper.
- Modify: `src/App.tsx` admin routes → `/admin` (Command), `/admin/pillar/:id`, `/admin/delivery`, `/admin/delivery/:tenantId`, `/admin/settings`. Redirect old `/admin/clients*`, `/admin/pillar/operations`, `/admin/sops`, `/admin/onboarding`, `/admin/infrastructure` to their new homes.
- Acceptance: spine renders, routes resolve, no dead links from the old IA.

**Task 1.2 — Retire old pillar workspace**
- Remove/park `AdminPillar.tsx`, `AdminLane.tsx`, `components/pillars/tabs/*` usage from routing (keep files until Phase 4 cleanup). Keep `PillarKit.tsx` primitives.
- Acceptance: app builds; no imports of removed routes remain.

### Phase 2 — Command home

**Task 2.1 — Command page**
- Create: `src/routes/admin/AdminCommand.tsx` — system-constraint banner (from `is_system` row), agency KPI row (active tenants, MRR, leads, spend from existing aggregate endpoints or a new `functions/api/admin/overview.ts`), the 3-stage flow cards + Operations card, ranked constraints board. Ported from prototype markup into React + `.pk-kit` classes.
- Acceptance: matches prototype Command visually; banner reflects the `is_system` constraint; cards link to pillar routes.

### Phase 3 — Service Delivery (roster + cockpit)

**Task 3.1 — Delivery shell + roster**
- Create: `src/routes/admin/AdminDelivery.tsx` — two-pane: roster (search/filter/list of `tenants` via existing `clients` list endpoint) + main. Pinned "Delivery overview" row. Main defaults to the delivery pillar overview (constraint/attack from Task 0.2 + at-risk tenants where health=warn).
- Acceptance: roster lists real tenants; overview shows the delivery constraint record; selecting a tenant navigates to `/admin/delivery/:tenantId`.

**Task 3.2 — Cockpit shell + Config tab**
- Create: `src/routes/admin/DeliveryCockpit.tsx` — header (identity, chips, Enter live app / View as owner, breadcrumb) + tab bar. Mount the existing `AdminClientDetail.tsx` content as the **Config** tab.
- Acceptance: Config tab is the full current client-hub (branding/connection/owner/surfaces/staff), editable, saving as today; Enter live app triggers `previewClient`.

**Task 3.3 — Overview + real tabs (where supported)**
- Create tab components under `src/components/admin/cockpit/`: `OverviewTab`, `AdsTab`, `LeadsTab` (v1), each calling the existing client query with `tenantId`. Inbox/Calendar/Revenue/Team = placeholders wired in Phase 5.
- Acceptance: Overview KPIs + Ads + Leads show real per-tenant data for a test tenant; unsupported tabs show an explicit "coming in next phase" state, not fake data.

### Phase 4 — Remaining pillar pages + editor

**Task 4.1 — Pillar page component**
- Create: `src/routes/admin/AdminPillarPage.tsx` (reads `:id`) — throughput KPIs + funnel + constraint spotlight + attack plan from Task 0.2. Operations variant appends Team capacity + Systems panels (fold old SOPs/Infra/agency-team content, read-only v1).
- Acceptance: Acquisition/Sales/Operations render their seeded constraint + steps.

**Task 4.2 — Constraint editor**
- Add an inline edit mode on each pillar page (and Command via deep link) that PUTs to the constraints API: edit title/severity/metric/detail/impact/throughput and add/reorder/status steps.
- Acceptance: editing a constraint persists and re-renders on Command + pillar page.

### Phase 5 — Deep-wire remaining cockpit tabs
Per-tenant Inbox, Calendar, Revenue, Team. Each depends on the underlying query accepting a server-verified `tenantId`; add that param where missing (backend change per tab). Out of v1 detail; track as its own follow-up plan once v1 is live.

### Phase 6 — Cleanup
Delete parked `AdminPillar.tsx`/`AdminLane.tsx`/`pillars.ts` and dead tab components; remove old routes; update `blueprint/index.html` architecture map ([[feedback_architecture_map]]); `git rm` this plan on ship ([[feedback_delete_built_plans]]).

---

## Open decisions (confirm before Phase 0)

1. **v1 scope** — assumed *Shell + Delivery first* (Command + Service Delivery deep, other pillars as overview shells). Alt: all-four-thin, or cockpit-complete-first.
2. **Constraint data** — assumed *manual, Jake-owned* (DB + in-app editor), throughput auto-filled where data exists. Alt: fully auto-computed.
3. **Constraint copy** — the seeded constraints/attack steps in the prototype are a draft; Jake to supply the real bottleneck + steps before seeding (Task 0.1).
4. **Does retiring `pillars.ts` affect anything else** (admin tasks seeded to `pillar_id`, see [[project_pillar_tasks.md]])? Verify the `admin_tasks.pillar_id` seeds before removing the pillar model; may need a mapping to the new 4-pillar ids.
