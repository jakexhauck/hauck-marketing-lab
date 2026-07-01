# 20 — Customers tab (Company)

Status: SPEC (design + mockup direction approved, plan pending)
Surface: client Command Center, desktop-first
Direction: **Master–Detail** (mockup C, `docs/mockups/customers-v1/variant-c-master-detail.html`)
Route: `/customers` (master–detail on one surface); `/customers/:id` deep-links a selected customer
Nav: Company section, immediately before Revenue
Capability gate: reuse existing `contacts`

## 1. Why

Willis (and every home-service client) needs one place to see and manage the
people who have actually paid: their one-time customers, their past jobs, and
their **recurring** customers, including what day each recurring job falls on.
Today that lives nowhere. Contacts is the full lead directory; Jobs is a booked/
completed calendar; Reactivation is win-back. None of them answer "who are my
customers, and when does each recurring one come up next."

Definition of done:
- A Company → Customers tab lists converted customers, segmented Recurring vs
  One-time, with lifetime value, job count, and last-job date per customer.
- Each customer has a detail page with job history and an editable recurring
  schedule (cadence + weekday + anchor + service + price).
- Recurring schedules are **real, app-owned, editable** and persist per tenant.
- Active recurrences auto-generate upcoming visits that appear on the existing
  Jobs calendar (`/sales/jobs`).
- Desktop-first, matching the standard page shell. Phone gets a read-mostly list.

## 2. What a "Customer" is

A Customer = a Contact who has **booked or paid at least one job** (converted).
This is the money/served view, not the full directory.

Two segments in v1:
- **Recurring** — has an active `customer_recurrence` row.
- **One-time** — converted but no active recurrence.

## 3. Data model — two sources, cleanly split

### 3A. Customer identity + past jobs (demo-aware, like Jobs)

Mirror the `useJobs()` pattern exactly: rich demo data in preview, honest empty +
"not connected" notice in a real session, stable return shape so the live GHL
swap changes nothing downstream.

- New `lib/customers.ts`:
  - `interface Customer { id; name; phone; email; city; segment: "recurring" | "onetime"; lifetimeValue; jobCount; lastJobAt; jobs: CustomerJob[] }`
  - `interface CustomerJob { id; date; service; amount; status: "completed" | "booked"; paid }`
  - `DEMO_CUSTOMERS: Customer[]` — Willis-flavoured, reusing the demo customer
    names already in `jobsPipeline.ts` so Jobs and Customers read as one dataset.
- New `hooks/useCustomers.ts`: returns `DEMO_CUSTOMERS` in demo mode, `[]` in a
  real session (until the pipeline-derived feed lands). Documented swap point:
  derive from won/booked leads joined to contacts.

Recurrence (3B) is layered on top of identity in the hook/selector so a customer's
`segment` reflects the real, saved recurrence even in a real session.

### 3B. Recurring schedule (real, app-owned)

Migration `0022_customer_recurrence.sql`:

```sql
create table if not exists public.customer_recurrence (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  contact_id   text not null,            -- GHL contact id (the customer)
  cadence_weeks int  not null default 1, -- 1 = weekly, 2 = biweekly, 4 = monthly-ish
  weekday      int  not null,            -- 0 = Sunday .. 6 = Saturday
  anchor_date  date not null,            -- reference date the interval counts from
  time         text,                     -- display time e.g. "9:00 AM" (calendar)
  service      text,
  price_cents  int,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, contact_id)
);
create index if not exists customer_recurrence_tenant_idx
  on public.customer_recurrence (tenant_id);
```

RLS on, no policies (reached only via the service-role client in Functions, same
convention as `admin_tasks`). Confirm `tenants(id)` FK target name against an
existing migration before finalizing.

Function `functions/api/recurrence.ts` (tenant-scoped via `_middleware`):
- `GET`  → `{ recurrences: RecurrenceRow[] }` for the tenant.
- `PUT`  → upsert one row by `(tenant_id, contact_id)`; body validated.
- `DELETE` (or `PUT active:false`) → stop a recurrence.

Client: `hooks/useApi.ts` gains `useRecurrenceQuery`; `hooks/useRecurrence.ts`
wraps it plus an upsert mutation with optimistic update + `["recurrence"]`
invalidation, following the existing query/mutation conventions.

## 4. Recurrence math — `lib/recurrence.ts` (TDD)

v1 scope: weekly / every N weeks on a fixed weekday. Pure, timezone-safe
(local-date arithmetic like `jobsPipeline.ts`, no `Date` in shared util beyond
what that file already uses):

- `nextVisit(rule, fromIso): string` — the first date on/after `fromIso` whose
  weekday matches `rule.weekday` AND whose whole-week offset from `anchor_date`
  is a multiple of `cadence_weeks`.
- `occurrences(rule, startIso, endIso): string[]` — every visit date in
  `[start, end]`. Drives the calendar merge and the "next 3 visits" preview.

Unit tests cover: weekly, biweekly parity from anchor, every-4-weeks, anchor in
the past vs future, month boundaries, DST-neutral (dates only).

## 5. Jobs calendar integration

`hooks/useJobs.ts` becomes a merge:
- pipeline jobs (demo now / GHL later), plus
- generated `booked` jobs from active recurrences over the visible window,
  via `occurrences()` mapped to the `Job` shape (customer name from the
  customer record, service/amount/time from the recurrence row).

Generated jobs carry a stable synthetic id (`rec:<contactId>:<date>`) so they
never collide with pipeline ids. `useJobs` gains the current month window as
input (Jobs.tsx already tracks `view`); keep a sensible default range so callers
that pass nothing still work.

## 6. UI — Master–Detail (mockup C)

Standard shell: `Shell` + `PAGE_CONTAINER` + `PageHeader` (title "Customers",
description). One surface: a master list (left) and the selected customer's
detail (right). Reference mockup: `docs/mockups/customers-v1/variant-c-master-detail.html`
(shared tokens/helpers in that folder's `kit.css` + `data.js`).

### Desktop (lg+): `components/customers/CustomersDesktop.tsx`
Two-column `grid-template-columns: 340px 1fr`.

**Master (left)** — sticky card:
- Search (reuse Contacts search behaviour).
- Segment toggle: **All / Recurring / One-time**.
- Rows: avatar, name, a dot + cadence label ("Every 2 weeks") or "One-time",
  lifetime value. Selected row = brand-tint background (no side-stripe). Clicking
  selects the customer (updates the detail + syncs the URL to `/customers/:id`).

**Detail (right)** — three stacked panels:
1. **Header** — avatar, name, business · city, Call/Text actions; stat row
   (lifetime value, total jobs, last job).
2. **Recurring schedule** — card with an Active/Off toggle. When active: cadence
   pills (Weekly / Every 2 weeks / Every 4 weeks), weekday picker (S M T W T F S),
   service + price-per-visit fields, and a live **"Next 3 visits"** preview from
   `occurrences()`; Save → `useRecurrence` upsert (toast confirms). When off (a
   one-time customer): an empty state with a "Set up recurring" CTA that turns the
   editor on. Turning it off drops the customer to One-time and removes its
   generated calendar visits.
3. **Job history** — reverse-chronological list (service, date, paid/unpaid
   badge, amount), reusing job tone helpers from `jobsPipeline.ts`.

### Phone (below lg): `routes/Customers.tsx`
Master–detail can't sit side by side, so it collapses to the established two-route
pattern (like Contacts/LeadDetail): `/customers` renders the list; tapping a row
routes to `/customers/:id`, a scrollable stack of the same three panels. Editing
is available but the desktop is the primary surface (per scope).

### URL + selection
`/customers` selects the first customer by default; `/customers/:id` deep-links a
specific one. On desktop, selecting a row does a shallow route update so back/forward
and deep links work without a full detail page. `NotConnectedNotice` (from
`routes/sales/shared`) shows in a real session until the customer feed is wired;
the recurring editor still works (it is app-owned, real).

## 7. Nav + capability

`lib/nav.ts`: add to the Company section immediately before Revenue:
`{ to: "/customers", label: "Customers", icon: Users, capability: "contacts", bottomNav: true }`
(pick an icon distinct from Contacts' `Contact`; `Users` or `UserCheck`).

Routes registered in the app router next to Contacts. No new capability, no
permissions migration (reuse `contacts`).

## 8. Out of scope (v1)

- Monthly-by-date, monthly-by-weekday, and arbitrary cadences (weekly / every N
  weeks only).
- Deriving customers from the live GHL pipeline (demo-aware now; documented swap).
- Writing recurring visits back into GHL as real appointments (calendar feed is
  app-side/generated for now).
- Rich phone editing of schedules (phone list is read-mostly).
- Per-visit overrides (skip this week, one-off reschedule of a single occurrence).

## 9. Risks / decisions to confirm during build

- FK target confirmed: `public.tenants(id)` uuid (see migration 0019).
- `useJobs` has one consumer today (`routes/sales/Jobs.tsx`); its hook comment is
  the documented swap point. Safe to widen the signature (keep a default window).
- How a real session identifies a customer once the pipeline feed lands (won
  status vs a "customer" tag vs Job Booked+ stage) is deferred; note the chosen
  signal when wiring. v1 real session shows the not-connected notice.

---

# Customers Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Company → Customers master–detail tab: a segmented customer list, per-customer job history, and a real, app-owned recurring schedule that also feeds the Jobs calendar.

**Architecture:** Customer identity + job history are demo-aware (like `useJobs`): rich demo data now, a documented GHL swap later. The recurring schedule is real and app-owned (Supabase table + a tenant-scoped Pages Function), edited from the detail pane. Recurrence math is a small pure module; `useJobs` merges generated recurring visits into the Jobs calendar.

**Tech Stack:** React + react-router + @tanstack/react-query, Tailwind (semantic tokens from `src/index.css`), Cloudflare Pages Functions, Supabase (service-role), vitest.

## Global Constraints

- Never use an em dash (`—`) in any output: code, comments, UI copy, docs. Use commas/periods/parentheses.
- TypeScript throughout; `npm run typecheck` must pass (`tsc --noEmit` app + `functions/tsconfig.json`).
- Date math is local-date only ("YYYY-MM-DD", no UTC shift), mirroring `src/lib/jobsPipeline.ts` (`toIso`, `isoToLocalDate`). Never `new Date(iso)` on a date-only string in shared logic.
- Money renders with the ledger token (`text-ledger` / `.ledger`); money is the only gold in the app.
- All Supabase-backed routes scope by `ctx.data.tenant.slug` via `resolveTenantId`, never a hardcoded slug (test/live must not bleed).
- Nav + route reuse the existing `contacts` capability. No new capability, no permissions migration.
- Cadence support is weekly / every N weeks anchored to a weekday only. No monthly patterns.
- Tests colocate as `*.test.ts`; run with `npm run test` (vitest).
- Follow existing patterns: query/mutation shape from `hooks/useApi.ts`, Function shape from `functions/api/me/tour.ts`, page shell from `routes/sales/Jobs.tsx` (`Shell` + `PAGE_CONTAINER` + `PageHeader`).

---

### Task 1: Recurrence math (`lib/recurrence.ts`)

Pure, timezone-safe recurrence logic. The load-bearing core; TDD it first.

**Files:**
- Create: `command-center/app/src/lib/recurrence.ts`
- Test: `command-center/app/src/lib/recurrence.test.ts`

**Interfaces:**
- Produces:
  - `interface RecurrenceRule { cadenceWeeks: number; weekday: number; anchorDate: string }` (weekday 0=Sun..6=Sat; anchorDate + all returns are "YYYY-MM-DD")
  - `function nextVisit(rule: RecurrenceRule, fromIso: string): string`
  - `function occurrences(rule: RecurrenceRule, startIso: string, endIso: string): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/lib/recurrence.test.ts
import { describe, it, expect } from "vitest";
import { nextVisit, occurrences, type RecurrenceRule } from "./recurrence";

const rule = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  cadenceWeeks: 2,
  weekday: 2, // Tuesday
  anchorDate: "2026-07-07", // a Tuesday
  ...over,
});

describe("nextVisit", () => {
  it("returns the anchor when fromIso is the anchor", () => {
    expect(nextVisit(rule(), "2026-07-07")).toBe("2026-07-07");
  });
  it("weekly: next matching weekday on/after from", () => {
    expect(nextVisit(rule({ cadenceWeeks: 1 }), "2026-07-08")).toBe("2026-07-14");
  });
  it("biweekly: respects parity from the anchor (skips the off week)", () => {
    // 2026-07-14 is a Tuesday but one week off the anchor -> next is 07-21
    expect(nextVisit(rule(), "2026-07-09")).toBe("2026-07-21");
  });
  it("every 4 weeks lands on the 4-week multiple", () => {
    expect(nextVisit(rule({ cadenceWeeks: 4 }), "2026-07-08")).toBe("2026-08-04");
  });
  it("anchor in the future: returns the anchor if from is before it", () => {
    expect(nextVisit(rule({ anchorDate: "2026-08-04" }), "2026-07-01")).toBe("2026-08-04");
  });
  it("crosses a month boundary", () => {
    expect(nextVisit(rule({ cadenceWeeks: 1 }), "2026-07-29")).toBe("2026-08-04");
  });
});

describe("occurrences", () => {
  it("lists biweekly visits within a window, inclusive", () => {
    expect(occurrences(rule(), "2026-07-01", "2026-08-05")).toEqual([
      "2026-07-07",
      "2026-07-21",
      "2026-08-04",
    ]);
  });
  it("returns [] when the window has no matching date", () => {
    expect(occurrences(rule(), "2026-07-08", "2026-07-13")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npm run test -- recurrence`
Expected: FAIL ("nextVisit is not a function" / module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// command-center/app/src/lib/recurrence.ts
// Weekly / every-N-weeks recurrence, anchored to a weekday. Timezone-safe:
// all inputs and outputs are local "YYYY-MM-DD" and math is done on local Date
// at midnight, mirroring src/lib/jobsPipeline.ts. No monthly patterns (v1).

export interface RecurrenceRule {
  // 1 = weekly, 2 = biweekly, 4 = every 4 weeks, etc. Always >= 1.
  cadenceWeeks: number;
  // 0 = Sunday .. 6 = Saturday. The day every visit lands on.
  weekday: number;
  // Reference date the interval counts from, "YYYY-MM-DD". Should itself fall
  // on `weekday`; if not, the anchor's own weekday is normalized forward.
  anchorDate: string;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Whole days between two local midnights (b - a), floor-safe.
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// The first visit on/after `anchor` that lands on `weekday` (normalizes an
// anchor whose weekday does not match).
function normalizedAnchor(rule: RecurrenceRule): Date {
  const a = fromIso(rule.anchorDate);
  const delta = (rule.weekday - a.getDay() + 7) % 7;
  return addDays(a, delta);
}

export function nextVisit(rule: RecurrenceRule, fromIso_: string): string {
  const weeks = Math.max(1, Math.trunc(rule.cadenceWeeks));
  const anchor = normalizedAnchor(rule);
  const from = fromIso(fromIso_);
  if (from <= anchor) return toIso(anchor);
  const diffDays = daysBetween(anchor, from); // > 0
  const periods = Math.ceil(diffDays / (weeks * 7));
  return toIso(addDays(anchor, periods * weeks * 7));
}

export function occurrences(
  rule: RecurrenceRule,
  startIso: string,
  endIso: string,
): string[] {
  const weeks = Math.max(1, Math.trunc(rule.cadenceWeeks));
  const end = fromIso(endIso);
  const out: string[] = [];
  let cur = fromIso(nextVisit(rule, startIso));
  while (cur <= end) {
    out.push(toIso(cur));
    cur = addDays(cur, weeks * 7);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npm run test -- recurrence`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/recurrence.ts command-center/app/src/lib/recurrence.test.ts
git commit -m "feat(customers): recurrence math (weekly / every N weeks)"
```

---

### Task 2: Customer types, demo data, and selectors (`lib/customers.ts`)

Types, the demo customer set, and the pure selector that layers a recurrence rule
onto a customer to derive its segment + next visit.

**Files:**
- Create: `command-center/app/src/lib/customers.ts`
- Test: `command-center/app/src/lib/customers.test.ts`

**Interfaces:**
- Consumes: `RecurrenceRule`, `nextVisit` from `./recurrence`.
- Produces:
  - `interface CustomerJob { id: string; date: string; service: string; amount: number; paid: boolean }`
  - `interface Customer { id: string; name: string; business: string | null; phone: string; email: string; city: string; lifetimeValue: number; jobCount: number; lastJobAt: string; jobs: CustomerJob[] }`
  - `type CustomerSegment = "recurring" | "onetime"`
  - `interface CustomerWithSchedule extends Customer { segment: CustomerSegment; rule: RecurrenceRule | null; service: string | null; priceCents: number | null; nextVisit: string | null }`
  - `function applySchedule(c: Customer, rule: RecurrenceRule | null, opts: { service?: string | null; priceCents?: number | null; todayIso: string }): CustomerWithSchedule`
  - `const DEMO_CUSTOMERS: Customer[]` (Willis-flavoured; reuse names from `jobsPipeline.ts` demo so Jobs + Customers read as one dataset)
  - `const DEMO_RECURRENCE: Record<string, { rule: RecurrenceRule; service: string; priceCents: number }>` (keyed by customer id; the demo seed for the recurring subset)

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/lib/customers.test.ts
import { describe, it, expect } from "vitest";
import { applySchedule, DEMO_CUSTOMERS, DEMO_RECURRENCE, type Customer } from "./customers";

const base: Customer = {
  id: "c1", name: "Aaron Webb", business: "Ferndale Cafe", phone: "(248) 555-0121",
  email: "a@x.com", city: "Ferndale", lifetimeValue: 2880, jobCount: 12,
  lastJobAt: "2026-06-08", jobs: [],
};

describe("applySchedule", () => {
  it("no rule -> one-time, null nextVisit", () => {
    const r = applySchedule(base, null, { todayIso: "2026-07-01" });
    expect(r.segment).toBe("onetime");
    expect(r.nextVisit).toBeNull();
  });
  it("with rule -> recurring, computes nextVisit", () => {
    const r = applySchedule(base,
      { cadenceWeeks: 2, weekday: 2, anchorDate: "2026-07-07" },
      { service: "Storefront", priceCents: 24000, todayIso: "2026-07-01" });
    expect(r.segment).toBe("recurring");
    expect(r.nextVisit).toBe("2026-07-07");
    expect(r.service).toBe("Storefront");
  });
});

describe("demo data", () => {
  it("every recurrence key maps to a real customer id", () => {
    const ids = new Set(DEMO_CUSTOMERS.map((c) => c.id));
    for (const id of Object.keys(DEMO_RECURRENCE)) expect(ids.has(id)).toBe(true);
  });
  it("has both recurring and one-time customers", () => {
    expect(DEMO_CUSTOMERS.length).toBeGreaterThan(Object.keys(DEMO_RECURRENCE).length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npm run test -- customers`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `command-center/app/src/lib/customers.ts`. Define the types and
`applySchedule` exactly as below, then populate `DEMO_CUSTOMERS` /
`DEMO_RECURRENCE` from the mockup fixture at
`docs/mockups/customers-v1/data.js` (same names, cities, services, prices,
cadence, weekday). Convert prices to integer cents; give each customer a stable
id (`"cust-01"`, ...); build each `jobs` array from the customer's price/last
job like the mockup's `historyFor`.

```ts
// command-center/app/src/lib/customers.ts
import { nextVisit, type RecurrenceRule } from "./recurrence";

export interface CustomerJob {
  id: string;
  date: string;      // "YYYY-MM-DD"
  service: string;
  amount: number;    // whole dollars
  paid: boolean;
}

export interface Customer {
  id: string;
  name: string;
  business: string | null;
  phone: string;
  email: string;
  city: string;
  lifetimeValue: number; // whole dollars
  jobCount: number;
  lastJobAt: string;     // "YYYY-MM-DD"
  jobs: CustomerJob[];
}

export type CustomerSegment = "recurring" | "onetime";

export interface CustomerWithSchedule extends Customer {
  segment: CustomerSegment;
  rule: RecurrenceRule | null;
  service: string | null;
  priceCents: number | null;
  nextVisit: string | null;
}

// Layer a recurrence rule onto a customer to derive its segment + next visit.
export function applySchedule(
  c: Customer,
  rule: RecurrenceRule | null,
  opts: { service?: string | null; priceCents?: number | null; todayIso: string },
): CustomerWithSchedule {
  const active = rule !== null;
  return {
    ...c,
    segment: active ? "recurring" : "onetime",
    rule,
    service: opts.service ?? null,
    priceCents: opts.priceCents ?? null,
    nextVisit: active ? nextVisit(rule as RecurrenceRule, opts.todayIso) : null,
  };
}

// DEMO_CUSTOMERS + DEMO_RECURRENCE: port verbatim from
// docs/mockups/customers-v1/data.js (CUSTOMERS + the recurring subset). See
// Step 3 note. Recurring ids: cust-01..cust-07; one-time: cust-08..cust-14.
export const DEMO_CUSTOMERS: Customer[] = [
  // ... populate from the mockup fixture ...
];

export const DEMO_RECURRENCE: Record<
  string,
  { rule: RecurrenceRule; service: string; priceCents: number }
> = {
  // "cust-03": { rule: { cadenceWeeks: 2, weekday: 2, anchorDate: "2026-07-07" }, service: "Office exterior, ground floor", priceCents: 18000 },
  // ... one entry per recurring customer ...
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd command-center/app && npm run test -- customers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/customers.ts command-center/app/src/lib/customers.test.ts
git commit -m "feat(customers): customer types, demo data, applySchedule selector"
```

---

### Task 3: Recurrence table migration (`0022_customer_recurrence.sql`)

**Files:**
- Create: `command-center/app/supabase/migrations/0022_customer_recurrence.sql`

**Interfaces:**
- Produces: table `public.customer_recurrence` unique on `(tenant_id, contact_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- 0022: per-customer recurring schedule (app-owned).
-- One row per (tenant, GHL contact) describing a weekly / every-N-weeks visit
-- anchored to a weekday. The Customers tab edits this; useJobs generates the
-- upcoming visits onto the Jobs calendar. Reached only via the service-role
-- client in Functions (same convention as tour_progress, 0019). Idempotent.

create table if not exists public.customer_recurrence (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  contact_id    text not null,             -- GHL contact id (the customer)
  cadence_weeks int  not null default 1,   -- 1 weekly, 2 biweekly, 4 monthly-ish
  weekday       int  not null,             -- 0 Sunday .. 6 Saturday
  anchor_date   date not null,             -- interval reference; lands on weekday
  visit_time    text,                      -- display time e.g. "9:00 AM"
  service       text,
  price_cents   int,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, contact_id)
);

create index if not exists customer_recurrence_tenant_idx
  on public.customer_recurrence (tenant_id);
```

- [ ] **Step 2: Sanity-check the SQL locally**

Run: `cd command-center/app && node -e "const s=require('fs').readFileSync('supabase/migrations/0022_customer_recurrence.sql','utf8'); if(!/create table if not exists public.customer_recurrence/.test(s)) throw new Error('missing table'); console.log('ok')"`
Expected: `ok`. (Application to Supabase happens at integration via `npm run db:migrate`, which needs env creds; see Task 11.)

- [ ] **Step 3: Commit**

```bash
git add command-center/app/supabase/migrations/0022_customer_recurrence.sql
git commit -m "feat(customers): migration 0022 customer_recurrence"
```

---

### Task 4: Recurrence Function (`functions/api/recurrence.ts`)

Tenant-scoped GET (list) + PUT (upsert one) + DELETE (deactivate one). Modeled on
`functions/api/me/tour.ts`.

**Files:**
- Create: `command-center/app/functions/api/recurrence.ts`

**Interfaces:**
- Produces (wire shape consumed by Task 5):
  - `interface ApiRecurrence { contactId: string; cadenceWeeks: number; weekday: number; anchorDate: string; visitTime: string | null; service: string | null; priceCents: number | null; active: boolean }`
  - `GET /api/recurrence` -> `{ recurrences: ApiRecurrence[] }`
  - `PUT /api/recurrence` body `{ contactId, cadenceWeeks, weekday, anchorDate, visitTime?, service?, priceCents?, active? }` -> `{ recurrence: ApiRecurrence }`
  - `DELETE /api/recurrence?contactId=<id>` -> `{ ok: true }`

- [ ] **Step 1: Write the Function**

```ts
// command-center/app/functions/api/recurrence.ts
import type { Env, ApiData } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";

export interface ApiRecurrence {
  contactId: string;
  cadenceWeeks: number;
  weekday: number;
  anchorDate: string;
  visitTime: string | null;
  service: string | null;
  priceCents: number | null;
  active: boolean;
}

interface Row {
  contact_id: string;
  cadence_weeks: number;
  weekday: number;
  anchor_date: string;
  visit_time: string | null;
  service: string | null;
  price_cents: number | null;
  active: boolean;
}

function shape(r: Row): ApiRecurrence {
  return {
    contactId: r.contact_id,
    cadenceWeeks: r.cadence_weeks,
    weekday: r.weekday,
    anchorDate: r.anchor_date,
    visitTime: r.visit_time,
    service: r.service,
    priceCents: r.price_cents,
    active: r.active,
  };
}

// GET /api/recurrence -> { recurrences: ApiRecurrence[] } (active rows only)
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ recurrences: [] });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ recurrences: [] });

  const { data, error } = await client
    .from("customer_recurrence")
    .select("contact_id,cadence_weeks,weekday,anchor_date,visit_time,service,price_cents,active")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) return Response.json({ recurrences: [] });
  return Response.json({ recurrences: (data as Row[]).map(shape) });
};

// PUT /api/recurrence -> upsert one customer's schedule by (tenant, contactId)
export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "unavailable" }, { status: 503 });

  const body = (await ctx.request.json().catch(() => null)) as
    | Partial<ApiRecurrence>
    | null;
  const contactId = (body?.contactId ?? "").trim();
  const cadenceWeeks = Math.trunc(Number(body?.cadenceWeeks));
  const weekday = Math.trunc(Number(body?.weekday));
  const anchorDate = (body?.anchorDate ?? "").trim();
  if (
    !contactId ||
    !Number.isFinite(cadenceWeeks) || cadenceWeeks < 1 ||
    !Number.isFinite(weekday) || weekday < 0 || weekday > 6 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)
  ) {
    return Response.json({ error: "invalid recurrence" }, { status: 400 });
  }

  const row = {
    tenant_id: tenantId,
    contact_id: contactId,
    cadence_weeks: cadenceWeeks,
    weekday,
    anchor_date: anchorDate,
    visit_time: body?.visitTime ?? null,
    service: body?.service ?? null,
    price_cents:
      body?.priceCents == null ? null : Math.trunc(Number(body.priceCents)),
    active: body?.active ?? true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from("customer_recurrence")
    .upsert(row, { onConflict: "tenant_id,contact_id" })
    .select("contact_id,cadence_weeks,weekday,anchor_date,visit_time,service,price_cents,active")
    .single();
  if (error) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ recurrence: shape(data as Row) });
};

// DELETE /api/recurrence?contactId=<id> -> deactivate (soft) this schedule
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ ok: true });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ ok: true });
  const contactId = new URL(ctx.request.url).searchParams.get("contactId") ?? "";
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });

  const { error } = await client
    .from("customer_recurrence")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId);
  if (error) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ ok: true });
};
```

- [ ] **Step 2: Typecheck the Functions project**

Run: `cd command-center/app && npx tsc --noEmit -p functions/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/functions/api/recurrence.ts
git commit -m "feat(customers): tenant-scoped recurrence API (GET/PUT/DELETE)"
```

---

### Task 5: Recurrence API client + hooks (`lib/api.ts`, `hooks/useApi.ts`, `hooks/useRecurrence.ts`)

**Files:**
- Modify: `command-center/app/src/lib/api.ts` (add `ApiRecurrence` type; export)
- Modify: `command-center/app/src/hooks/useApi.ts` (add query + upsert/delete mutations)
- Create: `command-center/app/src/hooks/useRecurrence.ts`

**Interfaces:**
- Consumes: wire shape from Task 4; `api<T>()` from `lib/api.ts`.
- Produces:
  - `interface ApiRecurrence { contactId; cadenceWeeks; weekday; anchorDate; visitTime: string | null; service: string | null; priceCents: number | null; active: boolean }` (in `lib/api.ts`)
  - `useRecurrenceQuery(enabled: boolean)` -> `{ recurrences: ApiRecurrence[] }`, queryKey `["recurrence"]`
  - `useUpsertRecurrence()` mutation (body = `ApiRecurrence`), invalidates `["recurrence"]`, `["jobs"]`
  - `useDeleteRecurrence()` mutation (`{ contactId }`), same invalidations
  - `useRecurrence()` -> `{ byContact: Record<string, ApiRecurrence>, isLoading, upsert, remove }` (convenience wrapper the UI consumes)

- [ ] **Step 1: Add the wire type to `lib/api.ts`**

Add near the other `Api*` interfaces:

```ts
export interface ApiRecurrence {
  contactId: string;
  cadenceWeeks: number;
  weekday: number;
  anchorDate: string;    // "YYYY-MM-DD"
  visitTime: string | null;
  service: string | null;
  priceCents: number | null;
  active: boolean;
}
```

- [ ] **Step 2: Add query + mutations to `hooks/useApi.ts`**

Add `ApiRecurrence` to the type import block, then append:

```ts
// Per-customer recurring schedules (app-owned). Rare writes, so a modest
// staleTime; invalidated on upsert/delete and by the Jobs calendar merge.
export function useRecurrenceQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["recurrence"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<{ recurrences: ApiRecurrence[] }>("/api/recurrence"),
  });
}

export function useUpsertRecurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiRecurrence) =>
      api<{ recurrence: ApiRecurrence }>("/api/recurrence", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurrence"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDeleteRecurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string }) =>
      api<{ ok: boolean }>(
        `/api/recurrence?contactId=${encodeURIComponent(input.contactId)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurrence"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
```

- [ ] **Step 3: Create the convenience wrapper `hooks/useRecurrence.ts`**

```ts
// command-center/app/src/hooks/useRecurrence.ts
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  useRecurrenceQuery,
  useUpsertRecurrence,
  useDeleteRecurrence,
} from "./useApi";
import type { ApiRecurrence } from "../lib/api";

// Single entry point the Customers UI uses. In demo mode api() routes to the
// demo handler (Task 6), so this works in both preview and real sessions.
export function useRecurrence() {
  const { session } = useAuth();
  const query = useRecurrenceQuery(Boolean(session) || true);
  const upsert = useUpsertRecurrence();
  const remove = useDeleteRecurrence();
  const byContact = useMemo(() => {
    const map: Record<string, ApiRecurrence> = {};
    for (const r of query.data?.recurrences ?? []) map[r.contactId] = r;
    return map;
  }, [query.data]);
  return { byContact, isLoading: query.isLoading, upsert, remove };
}
```

- [ ] **Step 4: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/api.ts command-center/app/src/hooks/useApi.ts command-center/app/src/hooks/useRecurrence.ts
git commit -m "feat(customers): recurrence query + upsert/delete hooks"
```

---

### Task 6: Demo store + handler recurrence support (`demo/*`)

So a demo/preview tab persists schedule edits in-memory and the recurring
segment/calendar merge read as real. `api()` routes every `/api/*` call to the
demo handler when `demoMode()` is on.

**Files:**
- Modify: `command-center/app/src/demo/data.ts` (seed `recurrences` from `DEMO_RECURRENCE`)
- Modify: `command-center/app/src/demo/store.ts` (hold `recurrences`; add upsert/delete)
- Modify: `command-center/app/src/demo/handler.ts` (route `/api/recurrence` GET/PUT/DELETE)
- Modify: `command-center/app/src/demo/handler.test.ts` (add cases)

**Interfaces:**
- Consumes: `DEMO_RECURRENCE` (Task 2); `ApiRecurrence` (Task 5).
- Produces: demo `/api/recurrence` GET/PUT/DELETE behaving like the real Function.

- [ ] **Step 1: Write failing handler tests**

Add to `command-center/app/src/demo/handler.test.ts`:

```ts
it("GET /api/recurrence returns the seeded recurring set", async () => {
  const res = await handleDemoRequest<{ recurrences: { contactId: string }[] }>(
    "/api/recurrence",
  );
  expect(res.recurrences.length).toBeGreaterThan(0);
});

it("PUT then GET /api/recurrence reflects the upsert", async () => {
  await handleDemoRequest("/api/recurrence", {
    method: "PUT",
    body: JSON.stringify({
      contactId: "cust-08", cadenceWeeks: 1, weekday: 3,
      anchorDate: "2026-07-08", active: true,
    }),
  });
  const res = await handleDemoRequest<{ recurrences: { contactId: string }[] }>(
    "/api/recurrence",
  );
  expect(res.recurrences.some((r) => r.contactId === "cust-08")).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd command-center/app && npm run test -- handler`
Expected: FAIL (unknown endpoint 404).

- [ ] **Step 3: Seed the store and route the endpoint**

In `demo/data.ts`, build the initial `recurrences: ApiRecurrence[]` from
`DEMO_RECURRENCE` (map each entry to the wire shape with its `contactId`). In
`demo/store.ts`, add `recurrences` to the store state plus:

```ts
export function upsertRecurrence(r: ApiRecurrence): ApiRecurrence {
  const store = getStore();
  const i = store.recurrences.findIndex((x) => x.contactId === r.contactId);
  if (i >= 0) store.recurrences[i] = r;
  else store.recurrences.push(r);
  return r;
}
export function deleteRecurrence(contactId: string): void {
  const store = getStore();
  store.recurrences = store.recurrences.filter((x) => x.contactId !== contactId);
}
```

In `demo/handler.ts`, before the final 404, add:

```ts
if (clean === "/api/recurrence") {
  if (method === "GET")
    return r({ recurrences: d.recurrences.filter((x) => x.active) });
  if (method === "PUT") {
    const saved = store.upsertRecurrence(body as unknown as ApiRecurrence);
    return r({ recurrence: saved });
  }
  if (method === "DELETE") {
    store.deleteRecurrence(queryParam(path, "contactId") ?? "");
    return r({ ok: true });
  }
}
```

(Import `ApiRecurrence` type at the top of `handler.ts`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd command-center/app && npm run test -- handler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/demo/
git commit -m "feat(customers): demo store + handler recurrence support"
```

---

### Task 7: `useCustomers` hook (`hooks/useCustomers.ts`)

Assembles the customer list the UI renders: demo customers merged with live
recurrence, or an empty real-session list until the pipeline feed is wired.

**Files:**
- Create: `command-center/app/src/hooks/useCustomers.ts`
- Test: `command-center/app/src/hooks/useCustomers.test.ts`

**Interfaces:**
- Consumes: `DEMO_CUSTOMERS`, `applySchedule`, `CustomerWithSchedule` (Task 2); `useRecurrence` (Task 5); `demoMode`.
- Produces: `useCustomers(todayIso: string): { customers: CustomerWithSchedule[]; isLoading: boolean; connected: boolean }` and a pure `buildCustomers(base, byContact, todayIso)` helper (exported for the test).

- [ ] **Step 1: Write the failing test (pure helper)**

```ts
// command-center/app/src/hooks/useCustomers.test.ts
import { describe, it, expect } from "vitest";
import { buildCustomers } from "./useCustomers";
import { DEMO_CUSTOMERS } from "../lib/customers";

describe("buildCustomers", () => {
  it("marks a customer with an active recurrence as recurring", () => {
    const id = DEMO_CUSTOMERS[0].id;
    const out = buildCustomers(DEMO_CUSTOMERS, {
      [id]: { contactId: id, cadenceWeeks: 1, weekday: 1, anchorDate: "2026-07-06",
        visitTime: null, service: "X", priceCents: 12000, active: true },
    }, "2026-07-01");
    const c = out.find((x) => x.id === id)!;
    expect(c.segment).toBe("recurring");
    expect(c.nextVisit).not.toBeNull();
  });
  it("no recurrence -> one-time", () => {
    const out = buildCustomers(DEMO_CUSTOMERS, {}, "2026-07-01");
    expect(out.every((c) => c.segment === "onetime")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd command-center/app && npm run test -- useCustomers`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// command-center/app/src/hooks/useCustomers.ts
import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { useRecurrence } from "./useRecurrence";
import {
  DEMO_CUSTOMERS,
  applySchedule,
  type Customer,
  type CustomerWithSchedule,
} from "../lib/customers";
import type { ApiRecurrence } from "../lib/api";

// Pure: fold live recurrence rows onto the base customer set.
export function buildCustomers(
  base: Customer[],
  byContact: Record<string, ApiRecurrence>,
  todayIso: string,
): CustomerWithSchedule[] {
  return base.map((c) => {
    const r = byContact[c.id];
    if (!r || !r.active) return applySchedule(c, null, { todayIso });
    return applySchedule(
      c,
      { cadenceWeeks: r.cadenceWeeks, weekday: r.weekday, anchorDate: r.anchorDate },
      { service: r.service, priceCents: r.priceCents, todayIso },
    );
  });
}

// Demo/preview: the hand-authored set merged with in-tab recurrence edits.
// Real session: empty until the pipeline-derived customer feed lands (documented
// swap), but recurrence is still live. `connected` drives the not-connected notice.
export function useCustomers(todayIso: string): {
  customers: CustomerWithSchedule[];
  isLoading: boolean;
  connected: boolean;
} {
  const demo = demoMode();
  const { byContact, isLoading } = useRecurrence();
  const base = demo ? DEMO_CUSTOMERS : [];
  const customers = useMemo(
    () => buildCustomers(base, byContact, todayIso),
    [base, byContact, todayIso],
  );
  // v1: only the demo tab has a customer feed. A real session shows the
  // not-connected notice (recurrence still works) until the pipeline swap lands.
  return { customers, isLoading, connected: demo };
}
```

Note: `connected` is `true` only in demo for v1 (real customer feed unwired); the
UI shows `NotConnectedNotice` when `!connected` in a real session.

- [ ] **Step 4: Run to verify it passes**

Run: `cd command-center/app && npm run test -- useCustomers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/hooks/useCustomers.ts command-center/app/src/hooks/useCustomers.test.ts
git commit -m "feat(customers): useCustomers hook (demo-aware, recurrence-merged)"
```

---

### Task 8: Feed recurring visits into the Jobs calendar (`hooks/useJobs.ts`)

**Files:**
- Modify: `command-center/app/src/hooks/useJobs.ts`
- Test: `command-center/app/src/hooks/useJobs.test.ts` (create)

**Interfaces:**
- Consumes: `occurrences` (Task 1); `useRecurrence` + `DEMO_CUSTOMERS`; `Job` from `lib/jobsPipeline`.
- Produces: a pure `recurringJobs(customers, byContact, startIso, endIso): Job[]` helper and a widened `useJobs(window?: { startIso: string; endIso: string }): Job[]` that merges pipeline jobs with generated recurring visits.

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/hooks/useJobs.test.ts
import { describe, it, expect } from "vitest";
import { recurringJobs } from "./useJobs";
import { DEMO_CUSTOMERS } from "../lib/customers";

describe("recurringJobs", () => {
  it("generates booked jobs for an active recurrence in the window", () => {
    const c = DEMO_CUSTOMERS[0];
    const jobs = recurringJobs([c], {
      [c.id]: { contactId: c.id, cadenceWeeks: 2, weekday: 2,
        anchorDate: "2026-07-07", visitTime: "9:00 AM",
        service: "Storefront", priceCents: 24000, active: true },
    }, "2026-07-01", "2026-08-05");
    expect(jobs.length).toBe(3);
    expect(jobs[0]).toMatchObject({ status: "booked", customer: c.name, amount: 240 });
    expect(jobs[0].id.startsWith("rec:")).toBe(true);
  });
  it("skips inactive recurrences", () => {
    const c = DEMO_CUSTOMERS[0];
    const jobs = recurringJobs([c], {
      [c.id]: { contactId: c.id, cadenceWeeks: 1, weekday: 2,
        anchorDate: "2026-07-07", visitTime: null, service: null,
        priceCents: null, active: false },
    }, "2026-07-01", "2026-08-05");
    expect(jobs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd command-center/app && npm run test -- useJobs`
Expected: FAIL (`recurringJobs` not exported).

- [ ] **Step 3: Implement the merge**

```ts
// command-center/app/src/hooks/useJobs.ts
import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { DEMO_JOBS, type Job } from "../lib/jobsPipeline";
import { occurrences } from "../lib/recurrence";
import { DEMO_CUSTOMERS, type Customer } from "../lib/customers";
import { useRecurrence } from "./useRecurrence";
import type { ApiRecurrence } from "../lib/api";

// Minutes-past-midnight for a "9:00 AM" style time (defaults to 9:00 AM).
function toStartMinutes(time: string | null): { time: string; startMinutes: number } {
  const t = time && /\d/.test(time) ? time : "9:00 AM";
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return { time: t, startMinutes: 540 };
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return { time: t, startMinutes: h * 60 + Number(m[2]) };
}

// Pure: expand active recurrences into generated calendar jobs over a window.
export function recurringJobs(
  customers: Customer[],
  byContact: Record<string, ApiRecurrence>,
  startIso: string,
  endIso: string,
): Job[] {
  const jobs: Job[] = [];
  const byId = new Map(customers.map((c) => [c.id, c]));
  for (const r of Object.values(byContact)) {
    if (!r.active) continue;
    const c = byId.get(r.contactId);
    if (!c) continue;
    const { time, startMinutes } = toStartMinutes(r.visitTime);
    for (const date of occurrences(
      { cadenceWeeks: r.cadenceWeeks, weekday: r.weekday, anchorDate: r.anchorDate },
      startIso,
      endIso,
    )) {
      jobs.push({
        id: `rec:${c.id}:${date}`,
        customer: c.business || c.name,
        service: r.service || "Recurring visit",
        city: c.city,
        zip: "",
        phone: c.phone,
        date,
        time,
        startMinutes,
        amount: r.priceCents == null ? 0 : Math.round(r.priceCents / 100),
        status: "booked",
        paid: false,
      });
    }
  }
  return jobs;
}

// Default window: current month +/- one month, so a freshly opened calendar
// always has generated visits without the caller passing a range.
function isoOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function defaultWindow(): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { startIso: isoOf(start), endIso: isoOf(end) };
}

export function useJobs(window?: { startIso: string; endIso: string }): Job[] {
  const demo = demoMode();
  const { byContact } = useRecurrence();
  const win = window ?? defaultWindow();
  return useMemo(() => {
    const base = demo ? DEMO_JOBS : [];
    const generated = recurringJobs(demo ? DEMO_CUSTOMERS : [], byContact, win.startIso, win.endIso);
    return [...base, ...generated];
  }, [demo, byContact, win.startIso, win.endIso]);
}
```

(Simplify `defaultWindow` if the executor prefers: the only requirement is two
"YYYY-MM-DD" strings spanning the visible range.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd command-center/app && npm run test -- useJobs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/hooks/useJobs.ts command-center/app/src/hooks/useJobs.test.ts
git commit -m "feat(customers): recurring visits feed the Jobs calendar"
```

---

### Task 9: Customers desktop UI (`components/customers/*`)

The master-detail surface. Reproduce the layout, classes, and interactions from
the reference mockup `docs/mockups/customers-v1/variant-c-master-detail.html`,
translated to the app's Tailwind tokens (the mockup's `kit.css` maps 1:1 to
`src/index.css` tokens: `--brand`, `--surface`, `--ledger`, `--positive`,
`--warning`, `--border`, `--divider`, radii, shadows). The mockup is complete
working code; use it as the visual + behavioural source of truth.

**Files:**
- Create: `command-center/app/src/components/customers/CustomersDesktop.tsx` (master list + detail shell; owns selected-customer state)
- Create: `command-center/app/src/components/customers/RecurringScheduleEditor.tsx` (cadence pills, weekday picker, service/price, live "next 3 visits", Active toggle; Save via `useRecurrence().upsert`, off via `.remove`)
- Create: `command-center/app/src/components/customers/CustomerJobHistory.tsx` (reverse-chron list with paid/unpaid badge; reuse `formatMoney` from `lib/jobsPipeline`)

**Interfaces:**
- Consumes: `useCustomers`, `useRecurrence`, `RecurrenceRule`, `nextVisit`/`occurrences`, `CustomerWithSchedule`; `PageHeader`, `Panel`/`Badge`/`EmptyState` from `components/ui`; `NotConnectedNotice` from `routes/sales/shared`; `toIso`/`formatLongDay` from `lib/jobsPipeline`.
- Produces: `<CustomersDesktop />` (default export), driven by a `selectedId` prop (or the `:id` route param) with an `onSelect(id)` callback for the URL sync.

Implementation requirements (each becomes an inline detail, no placeholders):
- Layout: `grid grid-cols-[340px_1fr] gap-5 items-start`. Master card is `sticky top-6`.
- Master rows: avatar (reuse `components/Avatar`), name, a dot + cadence label ("Every 2 weeks") or "One-time", lifetime value in `text-ledger`. Selected row = `bg-brand-tint` (no side-stripe border). Segment toggle (All / Recurring / One-time) + search filter (reuse the Contacts filter logic: name/email/phone).
- Detail header: avatar, name, business + city, Call/Text buttons; stat row (lifetime value `text-ledger`, total jobs, last job).
- `RecurringScheduleEditor`: local editor state seeded from the selected customer's rule (or defaults for a one-time). Cadence pills map to `cadenceWeeks` 1/2/4; weekday picker 0..6; "Next 3 visits" from `occurrences(rule, todayIso, +90d)` sliced to 3. Save calls `upsert({ contactId: id, cadenceWeeks, weekday, anchorDate: nextVisit(rule, todayIso), service, priceCents, visitTime: null, active: true })` and toasts "Schedule saved". The Active toggle off / "Cancel recurring" calls `remove({ contactId })` and toasts. Empty state (one-time) shows a "Set up recurring" CTA that flips the editor on.
- `CustomerJobHistory`: list from `customer.jobs`, each row service + date + `Badge tone={paid?"positive":"warning"}` + `formatMoney(amount)`.
- `todayIso = toIso(new Date())`.

- [ ] **Step 1: Build `CustomerJobHistory.tsx`**

Small, presentational. Map `customer.jobs` to rows using `Panel` + `Badge` +
`formatMoney`. Reverse-chronological (data already newest-first).

- [ ] **Step 2: Build `RecurringScheduleEditor.tsx`**

Cadence pills + weekday picker + service/price inputs + live preview + Active
toggle, wired to `useRecurrence()`. Seed local state from `props.rule`.

- [ ] **Step 3: Build `CustomersDesktop.tsx`**

Compose the master list (search + segment toggle + rows) and the detail (header +
`RecurringScheduleEditor` + `CustomerJobHistory`). Owns `selectedId`; calls
`onSelect` on row click.

- [ ] **Step 4: Typecheck + lint**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/components/customers/
git commit -m "feat(customers): master-detail desktop UI + recurring editor"
```

---

### Task 10: Route, phone surface, and nav (`routes/*`, `App.tsx`, `lib/nav.ts`)

**Files:**
- Create: `command-center/app/src/routes/Customers.tsx` (phone list + `CustomersDesktop` on lg+, mirroring `routes/Contacts.tsx`)
- Create: `command-center/app/src/routes/CustomerDetail.tsx` (phone detail for `/customers/:id`; on lg+ renders `CustomersDesktop` with that id selected, mirroring `routes/ContactDetail.tsx` / `LeadDetail.tsx`)
- Modify: `command-center/app/src/App.tsx` (register `/customers` and `/customers/:customerId` inside `ProtectedRoute`, next to the contacts routes at lines 255-270)
- Modify: `command-center/app/src/lib/nav.ts` (add the Customers item to the Company section, before Revenue)

**Interfaces:**
- Consumes: `CustomersDesktop`, `useCustomers`; `Shell`, `BottomNav`; router `useParams`/`useNavigate`.

- [ ] **Step 1: Add the nav item**

In `lib/nav.ts`, import `Users` from lucide (already imported), and in the
`company` section insert before the Revenue item:

```ts
{ to: "/customers", label: "Customers", icon: Users, capability: "contacts", bottomNav: false },
```

(Distinct icon from Contacts' `Contact`. `bottomNav: false` keeps the phone bar
uncluttered; the tab lives in the desktop rail + is reachable on phone by URL.)

- [ ] **Step 2: Build `routes/Customers.tsx`**

Model on `routes/Contacts.tsx`: phone layout (list of customers, tap -> `/customers/:id`)
below `lg`, `CustomersDesktop` at `lg+`. Desktop selection defaults to the first
customer; row click does `navigate('/customers/' + id)` (shallow) so `:id` stays in sync.

- [ ] **Step 3: Build `routes/CustomerDetail.tsx`**

Model on `routes/ContactDetail.tsx`: read `:customerId`, render the three detail
panels on phone; at `lg+` render `CustomersDesktop` with `selectedId={customerId}`.

- [ ] **Step 4: Register routes in `App.tsx`**

After the `/contacts/:contactId` route (line ~270), add:

```tsx
<Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
<Route path="/customers/:customerId" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
```

Add the imports next to the Contacts imports (lines 23-24):

```tsx
import Customers from "./routes/Customers";
import CustomerDetail from "./routes/CustomerDetail";
```

- [ ] **Step 5: Typecheck, then commit**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

```bash
git add command-center/app/src/routes/Customers.tsx command-center/app/src/routes/CustomerDetail.tsx command-center/app/src/App.tsx command-center/app/src/lib/nav.ts
git commit -m "feat(customers): route, phone surface, and Company nav entry"
```

---

### Task 11: Verify end to end (build, migrate, screenshot)

**Files:** none (verification only).

- [ ] **Step 1: Full test suite + typecheck + build**

Run: `cd command-center/app && npm run test && npm run typecheck && npm run build`
Expected: all pass, production build succeeds.

- [ ] **Step 2: Apply the migration**

Run: `cd command-center/app && npm run db:migrate`
Expected: `0022_customer_recurrence` applied (ledger records it). Requires Supabase
env; run where those are configured (see the DB-migrations-automated note).

- [ ] **Step 3: Visual proof (demo tab)**

Run the app, open the Customers tab in a demo session (`?demo=1`). Confirm: the
segment toggle filters; selecting a customer shows job history; editing cadence
updates the "next 3 visits"; Save persists across a reselect; a saved recurring
customer's visits appear on `/sales/jobs`. Screenshot desktop light + dark.

- [ ] **Step 4: Commit any fixes, then finish the branch**

Follow `finishing-a-development-branch` (commit, push, watch deploy, smoke-test
the live URL). On ship, per the workspace rule, `git rm` this build-plan doc and
the `docs/mockups/customers-v1/` reference in the same commit.

---

## Self-Review

- **Spec coverage:** Customer=converted contact (Task 2 segment); recurring schedule real + app-owned (Tasks 3-6); recurrence math (Task 1); Jobs calendar feed (Task 8); master-detail UI (Task 9); nav before Revenue + `contacts` gate (Task 10); demo-aware identity (Tasks 2, 7); phone surface (Task 10). All spec sections map to a task.
- **Out-of-scope respected:** only weekly / every-N-weeks cadence; no GHL write-back; no live customer derivation; phone editing minimal.
- **Type consistency:** `ApiRecurrence` (Tasks 4/5/6/8), `RecurrenceRule` (Tasks 1/2/8), `Customer`/`CustomerWithSchedule` (Tasks 2/7/9), `recurringJobs`/`buildCustomers` names stable across tasks and tests.
- **No placeholders** except the two demo-data population notes (Task 2/6), which point at the exact committed fixture (`docs/mockups/customers-v1/data.js`) to copy from, not an invented structure.
