# Setter Suite: Spec + Implementation Plan

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Hauck team one admin screen where a setter works a client's leads across all 8 GHL pipelines, logs every dial, applies tags, and books estimates, so the per-lead ledger Jake specced can actually be measured.

**Architecture:** A new admin-only route under the Sales spine slot. Board of real GHL stage columns on the left, a docked cockpit for the selected lead on the right. Reads come live from GHL per request. The only new persistence is one append-only table of dial events; every per-lead field and every roll-up rate derives from it. All writes to GHL are **tags**, never stage IDs, because the GHL automations own stage movement.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), React 18 + React Router, Tailwind v4 with the existing `.pk-*` admin token layer, Supabase (Management API migrations), Vitest.

---

## Global Constraints

- **Never name GoHighLevel or GHL in any client-facing UI.** This surface is admin-only so internal labels are fine, but no string here may leak into the client app.
- **Never use an em dash** in code, comments, copy, or UI text.
- **The client app is not touched.** Zero changes under `src/routes/` or `src/components/` outside the new admin directories. The client's view stays read-only and exactly as it is today.
- **The app never writes a pipeline stage.** All stage movement is a consequence of a tag. Any code path that PUTs `pipelineStageId` is out of scope and must not be added.
- **Target is the test account structure** (`r0WfsA12qpBv7M185V3v`), 8 pipelines. Willis (`OznT3yyuwK3dqVXDsCaD`) still runs the old 6-pipeline structure and is explicitly **not** migrated by this work.
- **Stages and tags are resolved live by name**, never by hardcoded ID. The existing `resolveStageByName` / `resolveCalendarByName` convention applies.
- Fonts and tokens come from `src/index.css` and the `.pk-kit` layer. Poppins for display, Inter for body, JetBrains Mono for all numerals and timestamps.
- Money and rate columns use `.tabular-figs`.

---

# Part 1: Spec

## 1.1 Who this is for

The Hauck Marketing team only. Not clients, not client staff. There is deliberately **no per-setter account model in v1** because Jake is currently the only setter. Every dial row still records `created_by` (the admin account id) so per-setter reporting becomes possible later without a migration.

Access is the existing super-admin session. `/api/admin/*` is already gated at `functions/api/_middleware.ts:87-100`.

## 1.2 The 8 pipelines

Pulled live from the test account on 2026-07-20. Stage names are shown exactly as GHL returns them and must be rendered verbatim.

| Pipeline | ID | Stages |
|---|---|---|
| Lead Form | `RCyACzwH01bRE5IFFlxg` | Opted In *(needs dialing)*, Hot Lead *(needs dialing)*, Opted In Follow Up, No Answer Day 1-4 *(needs dialing)*, Long Term Nurture |
| Funnel | `LDN8YJmUgfm17NE4WtQR` | Survey Completed No Call Booked *(needs dialing)*, Survey Follow Up, Phone Appt Booked *(needs dialing)*, No Answer Day 1-4 *(needs dialing)*, Long Term Nurture |
| Sales | `tnIfXFx8cO88IMvs01ut` | Phone Appt Confirmed, Estimate Booked, Job Booked, Job Completed, Follow Up |
| Customers | `n9pWlPP6ngO21ycJ2qUd` | One-Time Customer, Recurring Customer |
| Cancelled Appointments | `S6DacYm6m4e4fz80spGM` | Follow-Up *(needs dialing)*, Rescheduling, Unspecified |
| Trash | `T1BFJ3GXS4jps2aszcJ5` | Services Uninterested, Services Unqualified |
| Google Reviews | `mEo0ggVpus8P13SNDkcb` | Asked For Review, Review Link Clicked, Negative Feedback Received, Positive Review Submission |
| Reactivation | `nf16UDAkcgqLUU8yFq83` | Lead Contacted, Lead Responded, No Answer, Not Qualified |

IDs are recorded here for reference only. **Code resolves by name**, because these IDs are per-location and will differ for every future client.

A stage is flagged "needs dialing" purely by matching `/needs dialing/i` against the live stage name. No mapping table, nothing to maintain. If GHL renames a stage the flag follows automatically.

## 1.3 The data model

Jake's spec is one row per lead with 13 columns. Storing it that way loses history the moment a second dial happens, so the table is **one row per dial** and the per-lead row is derived.

```
setter_dials
  id              uuid pk
  tenant_id       uuid  -> tenants(id)
  contact_id      text  -- GHL contact id
  opportunity_id  text  -- GHL opportunity id, nullable
  pipeline_name   text  -- snapshot at time of dial
  stage_name      text  -- snapshot at time of dial
  dialed_at       timestamptz
  spoke           boolean  -- did a human answer
  outcome         text     -- booked | not_interested | no_answer | reschedule | bad_lead
  note            text
  tags_applied    jsonb    -- tags this dial pushed to GHL, for audit
  created_by      uuid  -> admin_accounts(id)
  created_at      timestamptz
```

Derivation of Jake's 13 columns:

| Column | Source |
|---|---|
| Date lead in | GHL `createdAt` on the opportunity |
| Name, Phone | GHL contact |
| City / Area | GHL contact address, regex-scraped like `sales/jobs/index.ts:194-201` |
| Source | Which pipeline the lead sits in, plus the source tag |
| First call time | `min(dialed_at)` for that contact |
| Call attempts | `count(*)` for that contact |
| Contacted Y/N | `bool_or(spoke)` for that contact |
| Outcome | `outcome` of the most recent dial |
| Estimate date/time | GHL appointment, via the existing appointments lib |
| Showed Y/N | **Not available.** Comes from the Estimate Close-out flow, which is not built |
| Won job Y/N | **Not available.** Comes from the Job Close-out flow, which is not built |
| Notes | The dial rows themselves, rendered as a timeline |

`spoke` is stored explicitly rather than inferred from `outcome`, because "Bad lead" is ambiguous (a wrong number is not a conversation, a tyre-kicker is). The UI defaults it from the outcome button and the setter can override.

## 1.4 The five rates

| Rate | Formula | Live on day one? |
|---|---|---|
| Total leads in | count of opportunities created in range | **Yes.** Pure GHL |
| Contact rate | contacts with any `spoke=true` dial ÷ total leads | No. Needs dial logging |
| Booking rate | leads with an appointment ÷ total leads | **Yes.** Pure GHL |
| Show rate | showed ÷ booked | No. Needs Estimate Close-out |
| Close rate | won ÷ showed | No. Needs Job Close-out |

This is stated plainly so nobody is surprised when three of five tiles read "Not yet wired" on launch day. That is the existing `.pk-report-tile.pk-pending` pattern and it is the honest thing to render.

## 1.5 Writes

**Tags.** Add is proven live already at `functions/api/reviews/index.ts:170` (`POST /contacts/{id}/tags`, body `{tags:[...]}`). Remove is `DELETE /contacts/{id}/tags` with body `{tags:[...]}` and is **unproven**. Task 0 exists solely to prove it before Task 5 builds on it.

The cockpit shows the lead's current tags as removable chips plus a free input over the location's live tag list. There is no curated button-to-tag mapping to maintain: what the setter picks is what GHL receives.

**Booking.** Reuses `functions/api/lib/appointments.ts` wholesale: `resolveCalendarByName`, `getFreeSlots`, `createAppointment`. That lib already handles the calendars API needing `Version: 2021-04-15` rather than the `2021-07-28` the shared `ghlFetch` pins, and it deliberately does not retry POSTs to avoid double-booking. Do not re-implement any of it.

## 1.6 Known constraints, discovered during verification

1. **Admin routes have no tenant context.** `_middleware.ts:87-100` returns early for `/api/admin/*` with no GHL client. There is no shared helper for this. Three existing admin routes each hand-roll the same `tenants` select. Task 1 extracts it once.
2. **List endpoints omit tags.** `functions/lib/ghl.ts:108-110` drops `tags` and `attribution` from list results for cost. Showing tags on board cards would be an N+1 contact fetch across the whole board. **Therefore board cards do not show tags.** Tags appear in the cockpit only, where it is one lead and one fetch.
3. **Opportunity fetch caps at 1000.** `fetchAllOpportunities` defaults `maxPages: 10` at 100 per page and warns on cap (`ghl.ts:183`). Acceptable for now, but the board must surface the warning rather than silently truncate.
4. **No per-client calendar mapping exists.** Calendars are resolved by name at request time and the names are passed from the caller. The Automation Library's "map an Estimate calendar and a Job calendar per client" step is net-new and is **out of scope here**; v1 resolves by the name the setter picks.
5. **Migration numbering is a race.** Current max is `0026_tenant_ga4_property.sql`, and `0012` is already duplicated. Re-check the max immediately before creating the file.
6. **No test harness exists for GHL write paths.** Nothing under `functions/api/appointments/`, `functions/api/sales/`, or `functions/api/lib/` has tests. This plan sets that pattern.

## 1.7 Out of scope

- Migrating Willis to the new pipeline structure
- Per-setter accounts and per-setter leaderboards
- Inline SMS or email (GHL keeps comms, per the standing baseline)
- The Estimate and Job Close-out flows, and therefore Show rate and Close rate
- Per-client calendar mapping config
- Any change to the client-facing app

---

# Part 2: Implementation Plan

## File structure

**Create**
- `command-center/app/supabase/migrations/0027_setter_dials.sql`
- `command-center/app/functions/lib/tenantGhl.ts` + `.test.ts` — the missing shared helper
- `command-center/app/functions/lib/setterMetrics.ts` + `.test.ts` — pure derivation, no I/O
- `command-center/app/functions/api/admin/setter/pipelines.ts`
- `command-center/app/functions/api/admin/setter/leads.ts`
- `command-center/app/functions/api/admin/setter/lead/[contactId].ts`
- `command-center/app/functions/api/admin/setter/dials.ts` + `.test.ts`
- `command-center/app/functions/api/admin/setter/tags.ts` + `.test.ts`
- `command-center/app/functions/api/admin/setter/slots.ts`
- `command-center/app/functions/api/admin/setter/book.ts`
- `command-center/app/src/routes/admin/SetterSuite.tsx`
- `command-center/app/src/components/admin/setter/SetterBoard.tsx`
- `command-center/app/src/components/admin/setter/SetterCard.tsx`
- `command-center/app/src/components/admin/setter/SetterCockpit.tsx`
- `command-center/app/src/components/admin/setter/DialLogger.tsx`
- `command-center/app/src/components/admin/setter/TagField.tsx`
- `command-center/app/src/components/admin/setter/SlotPicker.tsx`
- `command-center/app/src/lib/setterModel.ts` + `.test.ts` — shared types, `needsDialing()`

**Modify**
- `command-center/app/src/App.tsx` — register `/admin/setter`
- `command-center/app/src/routes/admin/AdminLayout.tsx` — point the Sales spine slot at it

**Refactor to use the new helper (Task 1)**
- `functions/api/admin/onboarding/[tenantId]/readiness.ts:12-22`
- `functions/api/admin/clients/[tenantId]/import-staff.ts:21-43`

---

### Task 0: Prove the tag remove endpoint

Blocking spike. Everything in Task 7 assumes this works. The CLI's implementation drops the body, so it is not evidence.

**Files:** none. This is a manual verification.

- [ ] **Step 1: Pick a throwaway contact in the test account**

Use the internal-API method that worked on 2026-07-20 (Firebase refresh token plus `Version: 2021-07-28`), or the public API if a test-account PIT is available. Note the contact id and its current tags.

- [ ] **Step 2: Add a tag, confirm it lands**

```
POST /contacts/{contactId}/tags
{"tags":["setter suite probe"]}
```
Expected: 200, and a re-read of the contact shows the tag.

- [ ] **Step 3: Remove it with a body, confirm it goes**

```
DELETE /contacts/{contactId}/tags
{"tags":["setter suite probe"]}
```
Expected: 200, and a re-read shows the tag gone.

- [ ] **Step 4: Record the result in this file**

If DELETE-with-body does not work, stop and report. The fallback is read-modify-write on the contact's full tag array, which is lossy under concurrency and changes the design of Task 7.

---

### Task 1: Shared tenant-to-GHL helper

**Files:**
- Create: `command-center/app/functions/lib/tenantGhl.ts`
- Test: `command-center/app/functions/lib/tenantGhl.test.ts`
- Modify: `functions/api/admin/onboarding/[tenantId]/readiness.ts:12-22`
- Modify: `functions/api/admin/clients/[tenantId]/import-staff.ts:21-43`

**Interfaces:**
- Consumes: `getServiceClient` from `functions/lib/supabase.ts`, `GhlContext` from `functions/lib/ghl.ts`
- Produces: `getGhlContextForTenant(env, tenantId): Promise<GhlContext>`, throws `TenantGhlError` with `.status` and `.code`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isPlaceholder } from "./tenantGhl";

describe("isPlaceholder", () => {
  it("rejects the three known placeholder values", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("pending")).toBe(true);
    expect(isPlaceholder("env")).toBe(true);
  });
  it("accepts a real value", () => {
    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
  });
  it("treats null and undefined as placeholder", () => {
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd command-center/app && npx vitest run functions/lib/tenantGhl.test.ts`
Expected: FAIL, cannot resolve `./tenantGhl`.

- [ ] **Step 3: Implement**

```ts
import { getServiceClient } from "./supabase";
import type { GhlContext } from "./ghl";

const PLACEHOLDERS = new Set(["", "pending", "env"]);

export function isPlaceholder(v: string | null | undefined): boolean {
  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
}

export class TenantGhlError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

// Admin routes run above tenant resolution (functions/api/_middleware.ts:87-100),
// so ctx.data.tenant is never populated. This is the one place that turns a
// tenantId into a usable GHL context. Note getTenantById in adminAuth.ts
// deliberately omits ghl_token, so it cannot be used here.
export async function getGhlContextForTenant(env: any, tenantId: string): Promise<GhlContext> {
  const client = getServiceClient(env);
  const { data, error } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw new TenantGhlError(500, "tenant_lookup_failed", error.message);
  if (!data) throw new TenantGhlError(404, "tenant_not_found", "No such client.");
  if (isPlaceholder(data.ghl_location_id) || isPlaceholder(data.ghl_token)) {
    throw new TenantGhlError(400, "ghl_not_connected", "Connect this client to the booking system first.");
  }
  return { token: data.ghl_token, locationId: data.ghl_location_id };
}
```

- [ ] **Step 4: Run the test, watch it pass**

Run: `npx vitest run functions/lib/tenantGhl.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Refactor the two existing call sites onto it**

Replace the hand-rolled select in `readiness.ts:12-22` and `import-staff.ts:21-43` with `getGhlContextForTenant`, catching `TenantGhlError` and returning `{ error: e.code }` at `e.status`. Preserve each route's existing response shape exactly.

- [ ] **Step 6: Full suite plus typecheck**

Run: `npm test && npm run typecheck`
Expected: all green, no new failures.

- [ ] **Step 7: Commit**

```bash
git add command-center/app/functions/lib/tenantGhl.ts command-center/app/functions/lib/tenantGhl.test.ts command-center/app/functions/api/admin/onboarding/ command-center/app/functions/api/admin/clients/
git commit -m "refactor(admin): extract getGhlContextForTenant, the missing shared helper"
```

---

### Task 2: The setter_dials table

**Files:**
- Create: `command-center/app/supabase/migrations/0027_setter_dials.sql`

- [ ] **Step 1: Re-check the migration number**

Run: `ls command-center/app/supabase/migrations/ | sort | tail -3`
If the max is no longer `0026`, rename accordingly. This numbering has collided before.

- [ ] **Step 2: Read 0026 for conventions**

Read `command-center/app/supabase/migrations/0026_tenant_ga4_property.sql` and match its RLS and grant style exactly. Do not invent a different convention.

- [ ] **Step 3: Write the migration**

```sql
-- Setter Suite: one row per dial. Every per-lead field and every roll-up rate
-- derives from this table. Append-only by design so history is never lost.
create table if not exists public.setter_dials (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  contact_id     text not null,
  opportunity_id text,
  pipeline_name  text,
  stage_name     text,
  dialed_at      timestamptz not null default now(),
  spoke          boolean not null default false,
  outcome        text not null check (outcome in
                   ('booked','not_interested','no_answer','reschedule','bad_lead')),
  note           text,
  tags_applied   jsonb not null default '[]'::jsonb,
  created_by     uuid references public.admin_accounts(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- The board and cockpit both query by tenant then contact.
create index if not exists setter_dials_tenant_contact_idx
  on public.setter_dials (tenant_id, contact_id, dialed_at desc);

-- The metrics roll-up scans a tenant over a date range.
create index if not exists setter_dials_tenant_dialed_idx
  on public.setter_dials (tenant_id, dialed_at desc);

alter table public.setter_dials enable row level security;
-- No policies: every read and write goes through the service client inside
-- Pages Functions, behind the admin session gate. Anon and authenticated
-- roles get nothing.
```

- [ ] **Step 4: Apply it**

Run: `cd command-center/app && npm run db:migrate`
Expected: `0027_setter_dials.sql` reported applied, and it appears in `public._hml_migrations`.

- [ ] **Step 5: Prove it is idempotent**

Run: `npm run db:migrate` again.
Expected: skipped, no error.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/supabase/migrations/0027_setter_dials.sql
git commit -m "feat(setter): add setter_dials, the per-dial event table"
```

---

### Task 3: Metric derivation, pure and tested

The riskiest logic in the feature, and the cheapest to test because it touches nothing.

**Files:**
- Create: `command-center/app/functions/lib/setterMetrics.ts`
- Test: `command-center/app/functions/lib/setterMetrics.test.ts`

**Interfaces:**
- Produces: `rollUpByContact(dials): Map<string, ContactRollUp>`, `computeRates(leads, rollUps, appointments): Rates`
- `ContactRollUp = { attempts: number; firstDialedAt: string | null; contacted: boolean; lastOutcome: string | null }`
- `Rates = { totalLeads: number; contactRate: number | null; bookingRate: number | null; showRate: null; closeRate: null }`

`showRate` and `closeRate` are typed `null` deliberately. They cannot be computed until the close-out flows exist, and typing them `null` makes any attempt to fake them a type error.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { rollUpByContact, computeRates } from "./setterMetrics";

const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
  ({ contact_id: contact, dialed_at: at, spoke, outcome });

describe("rollUpByContact", () => {
  it("counts attempts and takes the earliest dial as first call", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.attempts).toBe(3);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
  });

  it("marks contacted when any dial spoke, regardless of order", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "not_interested"),
      dial("c1", "2026-07-20T10:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
  });

  it("takes the outcome of the most recent dial, not the last in the array", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.lastOutcome).toBe("booked");
  });

  it("keeps contacts separate", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
      dial("c2", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
    expect(r.get("c2")!.contacted).toBe(false);
  });
});

describe("computeRates", () => {
  it("returns null rates rather than NaN when there are no leads", () => {
    const r = computeRates([], new Map(), []);
    expect(r.totalLeads).toBe(0);
    expect(r.contactRate).toBeNull();
    expect(r.bookingRate).toBeNull();
  });

  it("counts a lead as contacted only via its own roll-up", () => {
    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
    const rollUps = rollUpByContact([dial("c1", "2026-07-20T09:00:00Z", true, "booked")]);
    const r = computeRates(leads, rollUps, []);
    expect(r.totalLeads).toBe(2);
    expect(r.contactRate).toBeCloseTo(0.5);
  });

  it("never computes show or close rate", () => {
    const r = computeRates([{ contactId: "c1" }], new Map(), [{ contactId: "c1" }]);
    expect(r.showRate).toBeNull();
    expect(r.closeRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run functions/lib/setterMetrics.test.ts`
Expected: FAIL, cannot resolve `./setterMetrics`.

- [ ] **Step 3: Implement**

```ts
export type DialRow = {
  contact_id: string;
  dialed_at: string;
  spoke: boolean;
  outcome: string;
};

export type ContactRollUp = {
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
};

export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
  const out = new Map<string, ContactRollUp>();
  // Input sort order is not trusted, so the latest timestamp per contact is
  // tracked alongside rather than assumed from array position.
  const latestAt = new Map<string, string>();

  for (const d of dials) {
    const cur = out.get(d.contact_id) ?? {
      attempts: 0, firstDialedAt: null, contacted: false, lastOutcome: null,
    };
    cur.attempts += 1;
    if (cur.firstDialedAt === null || d.dialed_at < cur.firstDialedAt) {
      cur.firstDialedAt = d.dialed_at;
    }
    const seen = latestAt.get(d.contact_id);
    if (seen === undefined || d.dialed_at >= seen) {
      cur.lastOutcome = d.outcome;
      latestAt.set(d.contact_id, d.dialed_at);
    }
    if (d.spoke) cur.contacted = true;
    out.set(d.contact_id, cur);
  }
  return out;
}

export type Rates = {
  totalLeads: number;
  contactRate: number | null;
  bookingRate: number | null;
  showRate: null;
  closeRate: null;
};

export function computeRates(
  leads: { contactId: string }[],
  rollUps: Map<string, ContactRollUp>,
  appointments: { contactId: string }[],
): Rates {
  const total = leads.length;
  if (total === 0) {
    return { totalLeads: 0, contactRate: null, bookingRate: null, showRate: null, closeRate: null };
  }
  const contacted = leads.filter((l) => rollUps.get(l.contactId)?.contacted).length;
  const booked = new Set(appointments.map((a) => a.contactId));
  const bookedLeads = leads.filter((l) => booked.has(l.contactId)).length;
  return {
    totalLeads: total,
    contactRate: contacted / total,
    bookingRate: bookedLeads / total,
    // Both require the Estimate and Job Close-out flows, which do not exist.
    showRate: null,
    closeRate: null,
  };
}
```

- [ ] **Step 4: Run, watch pass**

Run: `npx vitest run functions/lib/setterMetrics.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/lib/setterMetrics.ts command-center/app/functions/lib/setterMetrics.test.ts
git commit -m "feat(setter): derive per-contact roll-ups and rates from dial events"
```

---

### Task 4: Read endpoints, pipelines and board

**Files:**
- Create: `functions/api/admin/setter/pipelines.ts`
- Create: `functions/api/admin/setter/leads.ts`

**Interfaces:**
- Consumes: `getGhlContextForTenant` (Task 1), `fetchAllOpportunities` and `ghlJson` from `functions/lib/ghl.ts`
- Produces: `GET /api/admin/setter/pipelines?tenantId=` → `{ pipelines: [{ id, name, stages: [{ id, name, color, needsDialing }] }] }`
- Produces: `GET /api/admin/setter/leads?tenantId=&pipelineId=` → `{ leads: ApiSetterLead[], truncated: boolean }`

`ApiSetterLead = { id, contactId, name, phone, city, stageName, createdAt, attempts, firstDialedAt, contacted, lastOutcome }`

Note what is absent: **no `tags` field.** The list endpoint cannot supply it without an N+1 per card (`ghl.ts:108-110`). Tags come from the detail endpoint in Task 5.

- [ ] **Step 1: Implement pipelines.ts**

Fetch `/opportunities/pipelines?locationId=`, sort stages by `position`, and set `needsDialing: /needs dialing/i.test(stage.name)`. Return all 8, unfiltered: unlike the client `PipelinesContext`, the setter view hides nothing.

- [ ] **Step 2: Implement leads.ts**

Call `fetchAllOpportunities(gctx, { pipelineId })`. Set `truncated: true` when the page cap is hit so the UI can say so rather than silently lie. Then in one query fetch every `setter_dials` row for that tenant and those contact ids, run `rollUpByContact`, and merge.

- [ ] **Step 3: Verify against the live test account**

Run the dev server and curl both endpoints with a real admin session and the test account tenant id. Expected: 8 pipelines, and stage names matching section 1.2 of this document character for character, emoji included.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/api/admin/setter/
git commit -m "feat(setter): read endpoints for pipelines and board leads"
```

---

### Task 5: Cockpit detail, dial logging, and tags

**Files:**
- Create: `functions/api/admin/setter/lead/[contactId].ts`
- Create: `functions/api/admin/setter/dials.ts` + `.test.ts`
- Create: `functions/api/admin/setter/tags.ts` + `.test.ts`

**Interfaces:**
- `GET /api/admin/setter/lead/:contactId?tenantId=` → contact detail plus `tags: string[]` plus `dials: DialRow[]` ordered newest first
- `POST /api/admin/setter/dials` body `{ tenantId, contactId, opportunityId?, pipelineName, stageName, spoke, outcome, note?, tagsApplied? }` → `{ dial }`
- `POST /api/admin/setter/tags` body `{ tenantId, contactId, add?: string[], remove?: string[] }` → `{ tags }`

- [ ] **Step 1: Write the failing validation tests for dials.ts**

```ts
import { describe, it, expect } from "vitest";
import { validateDialBody } from "./dials";

describe("validateDialBody", () => {
  it("rejects an outcome outside the five allowed values", () => {
    const r = validateDialBody({ tenantId: "t", contactId: "c", spoke: true, outcome: "maybe" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("bad_outcome");
  });
  it("accepts each of the five allowed outcomes", () => {
    for (const o of ["booked","not_interested","no_answer","reschedule","bad_lead"]) {
      expect(validateDialBody({ tenantId:"t", contactId:"c", spoke:false, outcome:o }).ok).toBe(true);
    }
  });
  it("requires tenantId and contactId", () => {
    expect(validateDialBody({ contactId: "c", spoke: true, outcome: "booked" }).ok).toBe(false);
    expect(validateDialBody({ tenantId: "t", spoke: true, outcome: "booked" }).ok).toBe(false);
  });
  it("rejects a no_answer that claims someone spoke", () => {
    const r = validateDialBody({ tenantId:"t", contactId:"c", spoke:true, outcome:"no_answer" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("contradictory");
  });
});
```

That last case matters: it is the one way the Contact rate can be silently corrupted.

- [ ] **Step 2: Run, watch fail**

Run: `npx vitest run functions/api/admin/setter/dials.test.ts`
Expected: FAIL, `validateDialBody` is not exported.

- [ ] **Step 3: Implement `validateDialBody` and the POST handler**

Export the validator separately from the handler so it is testable without a request. The handler resolves the admin via `getActiveAdmin`, writes the row with `created_by`, and calls `logAdminAction`.

- [ ] **Step 4: Run, watch pass**

Run: `npx vitest run functions/api/admin/setter/dials.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Implement tags.ts using the shape proven in Task 0**

```ts
// Add is proven live (functions/api/reviews/index.ts:170). Remove was proven
// in Task 0. Do not copy the CLI's remove: it omits the body entirely.
if (add?.length) {
  await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`,
    { method: "POST", body: JSON.stringify({ tags: add }) });
}
if (remove?.length) {
  await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`,
    { method: "DELETE", body: JSON.stringify({ tags: remove }) });
}
```

Re-read the contact afterwards and return its actual tag list, rather than echoing what was asked for. The setter must see what GHL really holds, because those tags fire workflows.

- [ ] **Step 6: Full suite plus typecheck, then commit**

```bash
npm test && npm run typecheck
git add command-center/app/functions/api/admin/setter/
git commit -m "feat(setter): lead detail, dial logging, and tag add/remove"
```

---

### Task 6: Booking, on top of the existing appointments lib

**Files:**
- Create: `functions/api/admin/setter/slots.ts`
- Create: `functions/api/admin/setter/book.ts`

- [ ] **Step 1: Read the existing lib first**

Read `functions/api/lib/appointments.ts` in full, and `functions/api/appointments/slots.ts` as the closest existing caller. Reuse `resolveCalendarByName`, `getFreeSlots` and `createAppointment` unchanged. Do not re-implement the calendars `Version: 2021-04-15` handling.

- [ ] **Step 2: Implement slots.ts**

`GET ?tenantId=&calendarName=&days=` proxying `getFreeSlots`. Surface `needsStaff: true` straight through: a round-robin calendar with no team members returns a 422 and the setter needs to see that plainly, not an empty grid.

- [ ] **Step 3: Implement book.ts**

`POST { tenantId, calendarName, contactId, startTime, endTime, title? }`. Do not retry on failure. The lib deliberately avoids retrying POSTs to prevent double-booking and this endpoint must honour that.

- [ ] **Step 4: Verify against the test account**

Book a real slot on a test calendar, confirm in GHL, then cancel it there.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/admin/setter/
git commit -m "feat(setter): live slot lookup and booking via the existing appointments lib"
```

---

### Task 7: The board

**Files:**
- Create: `src/lib/setterModel.ts` + `.test.ts`
- Create: `src/components/admin/setter/SetterCard.tsx`
- Create: `src/components/admin/setter/SetterBoard.tsx`
- Create: `src/routes/admin/SetterSuite.tsx`
- Modify: `src/App.tsx`, `src/routes/admin/AdminLayout.tsx`

- [ ] **Step 1: Write the failing test for `needsDialing`**

```ts
import { describe, it, expect } from "vitest";
import { needsDialing } from "./setterModel";

describe("needsDialing", () => {
  it("matches the live stage names case-insensitively", () => {
    expect(needsDialing("Opted In (needs dialing)")).toBe(true);
    expect(needsDialing("No Answer Day 4 (Needs Dialing)")).toBe(true);
  });
  it("does not match stages without the marker", () => {
    expect(needsDialing("Long Term Nurture")).toBe(false);
    expect(needsDialing("Estimate Booked")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, fail, implement, run, pass**

Run: `npx vitest run src/lib/setterModel.test.ts`

```ts
export const needsDialing = (stageName: string): boolean => /needs dialing/i.test(stageName);
```

- [ ] **Step 3: Build the board to match the approved mockup**

Column header is the stage dot in the live GHL hex plus the verbatim stage name plus a count, exactly the pattern in `src/components/Board.tsx`. The stage hex is a dot only, never a background or text colour. Add the "needs dialing" chip under the header for flagged stages.

Card shows name, city, time in, a source chip, and an attempts badge. **No tags on the card.** Cards with `attempts === 0` get the danger inset rail; cards untouched for over 24 hours in a needs-dialing stage get the warning rail.

- [ ] **Step 4: Show truncation honestly**

When the leads endpoint returns `truncated: true`, render a visible banner saying the list is capped at 1000. Never silently drop leads.

- [ ] **Step 5: Register the route and point the Sales spine slot at it**

- [ ] **Step 6: Full suite, typecheck, commit**

```bash
npm test && npm run typecheck
git add command-center/app/src/
git commit -m "feat(setter): pipeline board across all 8 pipelines"
```

---

### Task 8: The cockpit

**Files:**
- Create: `src/components/admin/setter/SetterCockpit.tsx`
- Create: `src/components/admin/setter/DialLogger.tsx`
- Create: `src/components/admin/setter/TagField.tsx`
- Create: `src/components/admin/setter/SlotPicker.tsx`

- [ ] **Step 1: Cockpit shell, docked right, own scroll container**

Sections in the order a real call happens: identity and dial, outcome, tags, booking, history, notes. The board keeps its own scroll position while the cockpit scrolls independently.

- [ ] **Step 2: DialLogger**

Five outcome buttons matching Jake's set exactly: Booked, Not interested, No answer, Reschedule, Bad lead. Picking one sets `spoke` automatically (No answer sets false, the rest set true) with a visible override, because the API rejects the contradictory combination.

- [ ] **Step 3: TagField**

Current tags as removable chips, a free input over the location's live tag list, and a short suggestion row. Under it, one line of honest warning copy: applying a tag fires the workflows.

- [ ] **Step 4: SlotPicker**

Day selector plus a grid of live slots. Render the `needsStaff` case as explicit copy: "This calendar has no team members assigned, so it cannot return availability."

- [ ] **Step 5: Optimistic update, with rollback**

A logged dial appears in the timeline immediately and increments the card's attempt badge. On failure it rolls back and a toast explains why. Never leave a phantom dial on screen: the attempt count is a metric.

- [ ] **Step 6: Full suite, typecheck, commit**

```bash
npm test && npm run typecheck
git add command-center/app/src/components/admin/setter/
git commit -m "feat(setter): lead cockpit with dial logging, tags, and booking"
```

---

### Task 9: The metric strip, honestly

**Files:**
- Modify: `src/routes/admin/SetterSuite.tsx`

- [ ] **Step 1: Render the five tiles**

Total leads in, Contact rate, Booking rate, Show rate, Close rate, each with its formula as a mono sub-label so nobody has to guess what it means.

- [ ] **Step 2: Render the unavailable ones as pending, not as zero**

Show rate and Close rate use the existing `.pk-report-tile.pk-pending` treatment and read "Needs close-out flow". A zero would be a lie: the data does not exist, it is not that the number is zero.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/admin/SetterSuite.tsx
git commit -m "feat(setter): rate strip, with unavailable rates marked pending"
```

---

### Task 10: Ship

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green. Record the built bundle hash.

- [ ] **Step 2: Push and watch the deploy**

- [ ] **Step 3: Verify the served bundle matches the build**

Per the standing rule: assert the served bundle hash matches the fresh build before trusting any browser check. Poll for a distinctive string, not the local hash, because Cloudflare builds a different one.

- [ ] **Step 4: Smoke test live**

Log in as admin, open the Setter Suite against the test account, confirm all 8 pipelines render with correct stage names. Log one real dial. Add and remove one real tag. Confirm both in GHL.

- [ ] **Step 5: Delete the mockup file and update the architecture map**

```bash
rm "C:/Users/games/Desktop/setter-suite-mockups.html"
```
Update `blueprint/index.html` NODES and GAPS per the standing rule.

- [ ] **Step 6: Delete this plan**

Per the standing rule that shipped build plans are removed in the same commit, and append any outstanding Jake actions to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` first.

---

## What Jake owes

1. Confirm whether tag remove works (Task 0 will tell us, but if it fails Jake's call on the fallback).
2. Log dials consistently for at least two weeks, or Contact rate stays meaningless.
3. Decide when the Estimate and Job Close-out flows get built, since Show rate and Close rate are blocked behind them.
4. Decide when Willis migrates to the new 8-pipeline structure.
