# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "Onboarding" tab to the command center that writes a client's 26 GHL custom values in one action and tracks launch-readiness with auto-checks + a manual checklist.

**Architecture:** All in `command-center/app`. A pure field-map module in `src/lib/onboarding.ts` (unit-tested) defines the form fields and their 1:1 GHL custom-value names and the checklist tasks. Cloudflare Pages Functions under `functions/api/admin/onboarding/*` persist form state to two new Supabase tables and call GHL via the existing `functions/lib/ghl.ts` using the target tenant's token. Two React admin pages (list + per-client setup) consume those endpoints.

**Tech Stack:** React 19 + Vite + React Router 7 + Tailwind v4, Cloudflare Pages Functions (TypeScript), Supabase (Postgres, service-role), Vitest, GHL public API (`services.leadconnectorhq.com`, version 2021-07-28).

## Global Constraints

- No em dashes anywhere in code, comments, copy, or UI text. Use commas, periods, parentheses, colons.
- Migrations are idempotent (`create table if not exists`), `enable row level security` with NO policies (service-role only), next number is `0018`. Applied with `npm run db:migrate`.
- Admin endpoints live under `functions/api/admin/`; middleware already gates them on `ctx.data.admin`. They do NOT receive `ctx.data.tenant` — load the target tenant by id with the service client.
- GHL calls use `ghlFetch`/`ghlJson` from `functions/lib/ghl.ts` with `GhlContext = { token, locationId }`. Custom-value writes are `PUT` (idempotent, retried). Never `POST` for the writes.
- The tenant GHL token is secret: it is read from the form and stored in `tenants.ghl_token`, never returned to the browser.
- Vitest only includes `src/**/*.test.ts`, so all unit-tested logic lives in `src/lib/`.
- Follow existing UI tokens: `text-text`, `text-muted`, `text-faint`, `bg-bg`, `bg-surface`, `border-border`, `text-danger`, `bg-danger-tint`, `rounded-[var(--radius)]`, `font-display`. Wrap pages in `<DesktopPage>`.

---

## File Structure

- Create `supabase/migrations/0018_onboarding.sql` — `onboarding` + `onboarding_checklist` tables.
- Create `src/lib/onboarding.ts` — field definitions (26 GHL custom values + Location API Token), checklist task definitions (~27), and pure functions `buildProvisionPlan()` and `summarizeReadiness()`.
- Create `src/lib/onboarding.test.ts` — unit tests for the pure functions.
- Create `functions/api/admin/onboarding/index.ts` — GET list of clients with onboarding status.
- Create `functions/api/admin/onboarding/[tenantId].ts` — GET (fields + status) / PUT (save draft fields).
- Create `functions/api/admin/onboarding/[tenantId]/checklist.ts` — GET / PUT checklist items.
- Create `functions/api/admin/onboarding/[tenantId]/provision.ts` — POST: write custom values to GHL.
- Create `functions/api/admin/onboarding/[tenantId]/readiness.ts` — GET: live auto-checks.
- Create `src/routes/admin/AdminOnboarding.tsx` — client list page.
- Create `src/routes/admin/AdminOnboardingDetail.tsx` — setup form + provision + readiness + checklist.
- Modify `src/routes/admin/AdminLayout.tsx:30-37` — add nav item.
- Modify `src/App.tsx` — import + register two routes.

---

## Task 1: Database migration

**Files:**
- Create: `command-center/app/supabase/migrations/0018_onboarding.sql`

**Interfaces:**
- Produces: tables `public.onboarding(tenant_id uuid pk, fields jsonb, status text, provision_result jsonb, provisioned_at timestamptz, updated_at timestamptz)` and `public.onboarding_checklist(tenant_id uuid, task_key text, done boolean, value text, done_at timestamptz, done_by text, pk(tenant_id, task_key))`.

- [ ] **Step 1: Write the migration**

```sql
-- 0018_onboarding.sql — agency onboarding wizard state (service-role only)

create table if not exists public.onboarding (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  fields           jsonb not null default '{}'::jsonb,
  status           text  not null default 'draft',
  provision_result jsonb,
  provisioned_at   timestamptz,
  updated_at       timestamptz not null default now()
);

alter table public.onboarding enable row level security;
-- No policies: service-role only, same as admin_tasks/admin_sop_flags.

create table if not exists public.onboarding_checklist (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  task_key   text not null,
  done       boolean not null default false,
  value      text,
  done_at    timestamptz,
  done_by    text,
  primary key (tenant_id, task_key)
);

alter table public.onboarding_checklist enable row level security;
-- No policies: service-role only.
```

- [ ] **Step 2: Apply it**

Run: `cd command-center/app && npm run db:migrate`
Expected: output shows `0018_onboarding.sql` applied, no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/supabase/migrations/0018_onboarding.sql
git commit -m "feat(onboarding): add onboarding + checklist tables (0018)"
```

---

## Task 2: Field map and pure provision/readiness logic

**Files:**
- Create: `command-center/app/src/lib/onboarding.ts`
- Test: `command-center/app/src/lib/onboarding.test.ts`

**Interfaces:**
- Produces:
  - `type FieldGroup = "connection" | "business" | "rep" | "calendars"`
  - `interface OnboardingField { key: string; label: string; group: FieldGroup; customValue: string | null }` (`customValue` is the GHL custom-value display name; `null` for connection fields stored on the tenant)
  - `const ONBOARDING_FIELDS: OnboardingField[]`
  - `interface ChecklistTask { key: string; phase: string; label: string; auto: boolean }`
  - `const CHECKLIST_TASKS: ChecklistTask[]`
  - `interface GhlCustomValue { id: string; name: string; value?: string }`
  - `interface ProvisionWrite { id: string; name: string; value: string }`
  - `interface ProvisionPlan { writes: ProvisionWrite[]; notFound: string[] }`
  - `function buildProvisionPlan(fields: Record<string,string>, customValues: GhlCustomValue[], token: string): ProvisionPlan`
  - `interface ReadinessInput { fields: Record<string,string>; customValues: GhlCustomValue[]; calendarIds: string[]; tokenValid: boolean }`
  - `interface ReadinessCheck { key: string; ok: boolean; detail: string }`
  - `function summarizeReadiness(input: ReadinessInput): ReadinessCheck[]`

- [ ] **Step 1: Write the failing test**

```typescript
// command-center/app/src/lib/onboarding.test.ts
import { describe, it, expect } from "vitest";
import {
  ONBOARDING_FIELDS,
  buildProvisionPlan,
  summarizeReadiness,
} from "./onboarding";

const CVS = [
  { id: "cv1", name: "Company Name", value: "" },
  { id: "cv2", name: "From Email", value: "" },
  { id: "cv3", name: "Location API Token", value: "" },
];

describe("buildProvisionPlan", () => {
  it("maps entered fields to custom-value ids by name", () => {
    const plan = buildProvisionPlan(
      { company_name: "Willis Windows", from_email: "a@b.com" },
      CVS,
      "pit-xyz",
    );
    expect(plan.writes).toEqual(
      expect.arrayContaining([
        { id: "cv1", name: "Company Name", value: "Willis Windows" },
        { id: "cv2", name: "From Email", value: "a@b.com" },
      ]),
    );
  });

  it("always writes the token into the Location API Token custom value", () => {
    const plan = buildProvisionPlan({}, CVS, "pit-xyz");
    expect(plan.writes).toContainEqual({ id: "cv3", name: "Location API Token", value: "pit-xyz" });
  });

  it("reports custom values missing from the subaccount as notFound", () => {
    const plan = buildProvisionPlan({ company_phone: "555" }, CVS, "pit-xyz");
    expect(plan.notFound).toContain("Company Phone Number");
  });

  it("skips blank fields (does not overwrite with empty)", () => {
    const plan = buildProvisionPlan({ company_name: "" }, CVS, "pit-xyz");
    expect(plan.writes.find((w) => w.name === "Company Name")).toBeUndefined();
  });
});

describe("summarizeReadiness", () => {
  it("fails the token check when token is invalid", () => {
    const checks = summarizeReadiness({ fields: {}, customValues: [], calendarIds: [], tokenValid: false });
    expect(checks.find((c) => c.key === "token")?.ok).toBe(false);
  });

  it("passes custom-values check only when all mapped values are non-empty in GHL", () => {
    const filled = ONBOARDING_FIELDS.filter((f) => f.customValue).map((f) => ({
      id: f.key, name: f.customValue as string, value: "x",
    }));
    const checks = summarizeReadiness({ fields: {}, customValues: filled, calendarIds: ["c"], tokenValid: true });
    expect(checks.find((c) => c.key === "custom_values")?.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npm run test -- src/lib/onboarding.test.ts`
Expected: FAIL (module `./onboarding` not found / exports undefined).

- [ ] **Step 3: Write the implementation**

```typescript
// command-center/app/src/lib/onboarding.ts

export type FieldGroup = "connection" | "business" | "rep" | "calendars";

export interface OnboardingField {
  key: string;
  label: string;
  group: FieldGroup;
  /** GHL custom-value display name this field writes to, or null if stored on the tenant. */
  customValue: string | null;
}

/** The name of the custom value that holds the subaccount's API token (read by the flip webhooks). */
export const LOCATION_TOKEN_CV = "Location API Token";

export const ONBOARDING_FIELDS: OnboardingField[] = [
  // connection (stored on tenants, not custom values)
  { key: "ghl_location_id", label: "GHL Location ID", group: "connection", customValue: null },
  { key: "ghl_token", label: "All-scopes Token", group: "connection", customValue: null },
  // business
  { key: "company_name", label: "Company Name", group: "business", customValue: "Company Name" },
  { key: "company_phone", label: "Company Phone Number", group: "business", customValue: "Company Phone Number" },
  { key: "from_name", label: "From Name", group: "business", customValue: "From Name" },
  { key: "from_email", label: "From Email", group: "business", customValue: "From Email" },
  { key: "review_google_url", label: "Review Google URL", group: "business", customValue: "Review Google URL" },
  { key: "gmb_link", label: "GMB Google Reviews Link", group: "business", customValue: "GMB Google Reviews Link" },
  { key: "review_request_link", label: "Review Request Link", group: "business", customValue: "review request link" },
  { key: "reactivation_offer", label: "Database Reactivation Offer", group: "business", customValue: "Database Reactivation Offer" },
  { key: "reactivation_relevance", label: "Database Reactivation Relevance", group: "business", customValue: "Database Reactivation Relevance" },
  { key: "contest_prize", label: "Custom Contest Prize", group: "business", customValue: "Custom Contest Prize" },
  // rep + internal alerts
  { key: "user_first_name", label: "Rep First Name", group: "rep", customValue: "user first name" },
  { key: "user_full_name", label: "Rep Full Name", group: "rep", customValue: "User Full Name" },
  { key: "user_phone", label: "Rep Personal Phone", group: "rep", customValue: "User Personal Phone Number" },
  { key: "notif_from_name", label: "Internal Notification From Name", group: "rep", customValue: "Internal Notification From Name" },
  { key: "notif_from_email", label: "Internal Notification From Email", group: "rep", customValue: "Internal Notification From Email" },
  { key: "notif_sms", label: "Internal Notification SMS", group: "rep", customValue: "Internal Notification SMS" },
  { key: "to_custom_email", label: "Alerts To Email", group: "rep", customValue: "To Custom Email" },
  { key: "to_custom_number", label: "Alerts To Number", group: "rep", customValue: "To Custom Number" },
  // calendars + confirmation pages
  { key: "intro_call_calendar", label: "Intro Call Calendar", group: "calendars", customValue: "Intro Call Calendar" },
  { key: "second_chance_calendar", label: "Intro Call 2nd Chance Calendar", group: "calendars", customValue: "Intro Call 2nd Chance Calendar" },
  { key: "home_estimate_calendar", label: "Home Estimate Calendar", group: "calendars", customValue: "Home Estimate Calendar" },
  { key: "fb_home_estimate_calendar", label: "Facebook Home Estimate Calendar", group: "calendars", customValue: "Facebook Home Estimate Calendar" },
  { key: "fb_calendar_link", label: "FB Calendar Link", group: "calendars", customValue: "FB Calendar Link" },
  { key: "calendar_link", label: "Calendar Link", group: "calendars", customValue: "Calendar Link" },
  { key: "intro_confirm_website", label: "Intro Call Confirmation Website", group: "calendars", customValue: "Intro Call Confirmation Website" },
  { key: "second_chance_confirm_website", label: "Intro Call 2nd Chance Confirmation Website", group: "calendars", customValue: "Intro Call 2nd Chance Confirmation Website" },
];

export interface ChecklistTask {
  key: string;
  phase: string;
  label: string;
  /** true if the readiness auto-checks can tick this without manual confirmation. */
  auto: boolean;
}

export const CHECKLIST_TASKS: ChecklistTask[] = [
  { key: "provision-values", phase: "GHL Setup", label: "Custom values written to GHL", auto: true },
  { key: "token-connected", phase: "GHL Setup", label: "API token valid + connected", auto: true },
  { key: "calendars-present", phase: "GHL Setup", label: "Calendars exist in subaccount", auto: true },
  { key: "google-calendar", phase: "Connections", label: "Connect Google Calendar (2-way sync)", auto: false },
  { key: "phone", phase: "Connections", label: "Connect phone number / LC Phone", auto: false },
  { key: "email-domain", phase: "Connections", label: "Verify sending email domain", auto: false },
  { key: "assign-user", phase: "Connections", label: "Add + assign the rep to calendars", auto: false },
  { key: "publish-workflows", phase: "Go Live", label: "Publish workflows + activate triggers", auto: false },
  { key: "smoke-test", phase: "Go Live", label: "Book + confirm test, watch title flip", auto: false },
];

export interface GhlCustomValue { id: string; name: string; value?: string }
export interface ProvisionWrite { id: string; name: string; value: string }
export interface ProvisionPlan { writes: ProvisionWrite[]; notFound: string[] }

function indexByName(customValues: GhlCustomValue[]): Map<string, GhlCustomValue> {
  const map = new Map<string, GhlCustomValue>();
  for (const cv of customValues) map.set(cv.name.trim().toLowerCase(), cv);
  return map;
}

export function buildProvisionPlan(
  fields: Record<string, string>,
  customValues: GhlCustomValue[],
  token: string,
): ProvisionPlan {
  const byName = indexByName(customValues);
  const writes: ProvisionWrite[] = [];
  const notFound: string[] = [];

  for (const f of ONBOARDING_FIELDS) {
    if (!f.customValue) continue; // connection fields handled on the tenant
    const value = (fields[f.key] ?? "").trim();
    if (!value) continue; // never overwrite with blank
    const cv = byName.get(f.customValue.toLowerCase());
    if (!cv) { notFound.push(f.customValue); continue; }
    writes.push({ id: cv.id, name: cv.name, value });
  }

  // Always push the token into the Location API Token custom value (the webhooks read it).
  const tokenCv = byName.get(LOCATION_TOKEN_CV.toLowerCase());
  if (token && tokenCv) {
    writes.push({ id: tokenCv.id, name: tokenCv.name, value: token });
  } else if (token && !tokenCv) {
    notFound.push(LOCATION_TOKEN_CV);
  }

  return { writes, notFound };
}

export interface ReadinessInput {
  fields: Record<string, string>;
  customValues: GhlCustomValue[];
  calendarIds: string[];
  tokenValid: boolean;
}
export interface ReadinessCheck { key: string; ok: boolean; detail: string }

export function summarizeReadiness(input: ReadinessInput): ReadinessCheck[] {
  const byName = indexByName(input.customValues);
  const mapped = ONBOARDING_FIELDS.filter((f) => f.customValue);
  const empties = mapped.filter((f) => {
    const cv = byName.get((f.customValue as string).toLowerCase());
    return !cv || !(cv.value ?? "").trim();
  });

  return [
    {
      key: "token",
      ok: input.tokenValid,
      detail: input.tokenValid ? "Token authenticates against GHL" : "Token invalid or missing scope",
    },
    {
      key: "custom_values",
      ok: empties.length === 0,
      detail: empties.length === 0
        ? "All mapped custom values are set"
        : `${empties.length} custom value(s) still blank in GHL`,
    },
    {
      key: "calendars",
      ok: input.calendarIds.length > 0,
      detail: input.calendarIds.length > 0
        ? `${input.calendarIds.length} calendar(s) present`
        : "No calendars found in subaccount",
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd command-center/app && npm run test -- src/lib/onboarding.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/onboarding.ts command-center/app/src/lib/onboarding.test.ts
git commit -m "feat(onboarding): field map + provision/readiness logic with tests"
```

---

## Task 3: Onboarding CRUD endpoints (list, fields, checklist)

**Files:**
- Create: `command-center/app/functions/api/admin/onboarding/index.ts`
- Create: `command-center/app/functions/api/admin/onboarding/[tenantId].ts`
- Create: `command-center/app/functions/api/admin/onboarding/[tenantId]/checklist.ts`

**Interfaces:**
- Consumes: `getServiceClient(ctx.env)` (from `functions/lib/supabase` — same import used in `functions/api/admin/clients/index.ts`), `ctx.data.admin` (guaranteed by middleware).
- Produces:
  - `GET /api/admin/onboarding` -> `{ clients: { id, name, slug, status, provisionedAt }[] }`
  - `GET /api/admin/onboarding/:tenantId` -> `{ fields: Record<string,string>, status, hasToken: boolean, provisionResult: unknown }`
  - `PUT /api/admin/onboarding/:tenantId` body `{ fields: Record<string,string> }` -> `{ ok: true }`
  - `GET /api/admin/onboarding/:tenantId/checklist` -> `{ items: { task_key, done, value }[] }`
  - `PUT /api/admin/onboarding/:tenantId/checklist` body `{ taskKey, done, value? }` -> `{ ok: true }`

- [ ] **Step 1: Write the list endpoint**

```typescript
// functions/api/admin/onboarding/index.ts
import { getServiceClient } from "../../../lib/supabase";

interface Env { [k: string]: string }
interface ApiData { admin?: { id: string } }

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, name, slug")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: ob } = await client
    .from("onboarding")
    .select("tenant_id, status, provisioned_at");
  const byId = new Map((ob ?? []).map((r: { tenant_id: string; status: string; provisioned_at: string | null }) => [r.tenant_id, r]));

  const clients = (tenants ?? []).map((t: { id: string; name: string; slug: string }) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: byId.get(t.id)?.status ?? "draft",
    provisionedAt: byId.get(t.id)?.provisioned_at ?? null,
  }));

  return Response.json({ clients });
};
```

- [ ] **Step 2: Write the fields get/save endpoint**

```typescript
// functions/api/admin/onboarding/[tenantId].ts
import { getServiceClient } from "../../../lib/supabase";

interface Env { [k: string]: string }
interface ApiData { admin?: { id: string } }

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: row } = await client
    .from("onboarding")
    .select("fields, status, provision_result")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const { data: tenant } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("id", tenantId)
    .maybeSingle();

  const fields = (row?.fields ?? {}) as Record<string, string>;
  // Surface location id from the tenant so the form shows it; never surface the token.
  if (tenant?.ghl_location_id && tenant.ghl_location_id !== "pending" && tenant.ghl_location_id !== "env") {
    fields.ghl_location_id = tenant.ghl_location_id;
  }
  const hasToken = Boolean(tenant?.ghl_token && tenant.ghl_token !== "pending" && tenant.ghl_token !== "env");

  return Response.json({
    fields,
    status: row?.status ?? "draft",
    hasToken,
    provisionResult: row?.provision_result ?? null,
  });
};

export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let body: { fields?: Record<string, string> };
  try { body = await ctx.request.json(); }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const fields = body.fields ?? {};

  // Persist the token + location to the tenant; keep the rest in onboarding.fields.
  const tenantPatch: Record<string, string> = {};
  if (typeof fields.ghl_location_id === "string" && fields.ghl_location_id.trim()) {
    tenantPatch.ghl_location_id = fields.ghl_location_id.trim();
  }
  if (typeof fields.ghl_token === "string" && fields.ghl_token.trim()) {
    tenantPatch.ghl_token = fields.ghl_token.trim();
  }
  if (Object.keys(tenantPatch).length > 0) {
    await client.from("tenants").update(tenantPatch).eq("id", tenantId);
  }

  // Do not store the raw token in onboarding.fields.
  const stored = { ...fields };
  delete stored.ghl_token;

  const { error } = await client
    .from("onboarding")
    .upsert({ tenant_id: tenantId, fields: stored, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};
```

- [ ] **Step 3: Write the checklist endpoint**

```typescript
// functions/api/admin/onboarding/[tenantId]/checklist.ts
import { getServiceClient } from "../../../../lib/supabase";

interface Env { [k: string]: string }
interface ApiData { admin?: { id: string } }

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const { data } = await client
    .from("onboarding_checklist")
    .select("task_key, done, value")
    .eq("tenant_id", tenantId);
  return Response.json({ items: data ?? [] });
};

export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  let body: { taskKey?: string; done?: boolean; value?: string };
  try { body = await ctx.request.json(); }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.taskKey) return Response.json({ error: "taskKey required" }, { status: 400 });

  const { error } = await client.from("onboarding_checklist").upsert({
    tenant_id: tenantId,
    task_key: body.taskKey,
    done: Boolean(body.done),
    value: body.value ?? null,
    done_at: body.done ? new Date().toISOString() : null,
    done_by: ctx.data.admin?.id ?? null,
  }, { onConflict: "tenant_id,task_key" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
```

- [ ] **Step 4: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS (no type errors). If `getServiceClient` import path differs, match the path used in `functions/api/admin/clients/index.ts`.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/admin/onboarding
git commit -m "feat(onboarding): CRUD endpoints for fields + checklist"
```

---

## Task 4: Provision endpoint

**Files:**
- Create: `command-center/app/functions/api/admin/onboarding/[tenantId]/provision.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `ghlFetch`, `ghlJson` (`functions/lib/ghl.ts`), `buildProvisionPlan`, `GhlCustomValue` (`src/lib/onboarding`).
- Produces: `POST /api/admin/onboarding/:tenantId/provision` -> `{ ok: boolean, written: string[], failed: { name: string; status: number }[], notFound: string[] }`

- [ ] **Step 1: Write the provision endpoint**

```typescript
// functions/api/admin/onboarding/[tenantId]/provision.ts
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch, ghlJson } from "../../../../lib/ghl";
import { buildProvisionPlan, type GhlCustomValue } from "../../../../../src/lib/onboarding";

interface Env { [k: string]: string }
interface ApiData { admin?: { id: string } }

export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client
    .from("tenants").select("ghl_location_id, ghl_token").eq("id", tenantId).maybeSingle();
  const { data: ob } = await client
    .from("onboarding").select("fields").eq("tenant_id", tenantId).maybeSingle();

  const locationId = tenant?.ghl_location_id ?? "";
  const token = tenant?.ghl_token ?? "";
  if (!locationId || !token || locationId === "pending" || token === "pending") {
    return Response.json({ error: "Set the GHL location id and token first." }, { status: 400 });
  }
  const gctx = { token, locationId };

  // Token preflight: cheap authed call. Stop and write nothing on failure.
  const probe = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}/customValues`);
  if (!probe.ok) {
    return Response.json(
      { error: "Token invalid or missing scope.", status: probe.status },
      { status: 400 },
    );
  }
  const cvData = (await probe.json()) as { customValues?: GhlCustomValue[] };
  const customValues = cvData.customValues ?? [];

  const fields = ((ob?.fields ?? {}) as Record<string, string>);
  const plan = buildProvisionPlan(fields, customValues, token);

  const written: string[] = [];
  const failed: { name: string; status: number }[] = [];
  for (const w of plan.writes) {
    const res = await ghlFetch(
      gctx,
      `/locations/${encodeURIComponent(locationId)}/customValues/${encodeURIComponent(w.id)}`,
      { method: "PUT", body: JSON.stringify({ name: w.name, value: w.value }) },
    );
    if (res.ok) written.push(w.name);
    else failed.push({ name: w.name, status: res.status });
  }

  const result = { written, failed, notFound: plan.notFound, at: new Date().toISOString() };
  await client.from("onboarding").upsert({
    tenant_id: tenantId,
    status: failed.length === 0 ? "provisioned" : "draft",
    provision_result: result,
    provisioned_at: failed.length === 0 ? result.at : null,
    updated_at: result.at,
  }, { onConflict: "tenant_id" });

  // Auto-tick the provision checklist item when everything wrote.
  if (failed.length === 0 && plan.notFound.length === 0) {
    await client.from("onboarding_checklist").upsert({
      tenant_id: tenantId, task_key: "provision-values", done: true,
      done_at: result.at, done_by: ctx.data.admin?.id ?? null,
    }, { onConflict: "tenant_id,task_key" });
  }

  return Response.json({ ok: failed.length === 0, written, failed, notFound: plan.notFound });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS. If importing from `src/lib/onboarding` across the `functions/` boundary errors at build, move the pure map to a path both can import (e.g. `functions/lib/onboardingFields.ts`) and re-export it from `src/lib/onboarding.ts`; update Task 2 imports accordingly. Verify with the build in Task 8.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/functions/api/admin/onboarding/[tenantId]/provision.ts
git commit -m "feat(onboarding): provision endpoint writes custom values to GHL"
```

---

## Task 5: Readiness endpoint

**Files:**
- Create: `command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `ghlFetch`, `summarizeReadiness`, `GhlCustomValue` (`src/lib/onboarding`).
- Produces: `GET /api/admin/onboarding/:tenantId/readiness` -> `{ checks: { key, ok, detail }[] }`

- [ ] **Step 1: Write the readiness endpoint**

```typescript
// functions/api/admin/onboarding/[tenantId]/readiness.ts
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch } from "../../../../lib/ghl";
import { summarizeReadiness, type GhlCustomValue } from "../../../../../src/lib/onboarding";

interface Env { [k: string]: string }
interface ApiData { admin?: { id: string } }

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client
    .from("tenants").select("ghl_location_id, ghl_token").eq("id", tenantId).maybeSingle();
  const locationId = tenant?.ghl_location_id ?? "";
  const token = tenant?.ghl_token ?? "";
  if (!locationId || !token || locationId === "pending" || token === "pending") {
    return Response.json({ checks: [{ key: "token", ok: false, detail: "No token/location set yet" }] });
  }
  const gctx = { token, locationId };

  let tokenValid = false;
  let customValues: GhlCustomValue[] = [];
  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}/customValues`);
  if (cvRes.ok) {
    tokenValid = true;
    const data = (await cvRes.json()) as { customValues?: GhlCustomValue[] };
    customValues = data.customValues ?? [];
  }

  let calendarIds: string[] = [];
  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(locationId)}`, {
    headers: { Version: "2021-04-15" },
  });
  if (calRes.ok) {
    const data = (await calRes.json()) as { calendars?: { id: string }[] };
    calendarIds = (data.calendars ?? []).map((c) => c.id);
  }

  const checks = summarizeReadiness({ fields: {}, customValues, calendarIds, tokenValid });
  return Response.json({ checks });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/functions/api/admin/onboarding/[tenantId]/readiness.ts
git commit -m "feat(onboarding): readiness endpoint with live auto-checks"
```

---

## Task 6: Onboarding list page + nav + routes

**Files:**
- Create: `command-center/app/src/routes/admin/AdminOnboarding.tsx`
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx:30-37`
- Modify: `command-center/app/src/App.tsx` (imports + routes)

**Interfaces:**
- Consumes: `GET /api/admin/onboarding`, `api<T>()`, `DesktopPage`.

- [ ] **Step 1: Create the list page**

```tsx
// src/routes/admin/AdminOnboarding.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Rocket } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { api } from "../../lib/api";

interface Row { id: string; name: string; slug: string; status: string; provisionedAt: string | null }

export default function AdminOnboarding() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ clients: Row[] }>("/api/admin/onboarding");
        if (!cancelled) setRows(data.clients ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <DesktopPage title="Onboarding" subtitle="Provision a new client's GHL and track launch readiness">
      {loading ? (
        <div className="flex items-center gap-2 px-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading clients...
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-2 py-16 text-center text-sm text-muted">No clients yet.</div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border">
          {rows.map((r) => (
            <Link key={r.id} to={`/admin/onboarding/${r.id}`}
              className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 last:border-b-0 hover:bg-surface-2">
              <span className="font-medium text-text">{r.name}</span>
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <Rocket size={14} /> {r.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </DesktopPage>
  );
}
```

- [ ] **Step 2: Add the nav item**

Modify `src/routes/admin/AdminLayout.tsx` ADMIN_NAV (after the Clients entry). Add `Rocket` to the existing `lucide-react` import.

```typescript
const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin/clients", label: "Clients", icon: Building2 },
  { to: "/admin/onboarding", label: "Onboarding", icon: Rocket },
  { to: "/admin/tasks", label: "Tasks", icon: ListChecks },
  { to: "/admin/build", label: "Build Lab", icon: Hammer },
  { to: "/admin/plans", label: "Plans", icon: ClipboardList },
  { to: "/admin/sops", label: "SOP Hub", icon: BookText },
  { to: "/admin/assets", label: "Assets", icon: FolderOpen },
];
```

- [ ] **Step 3: Register routes in App.tsx**

Add imports near the other admin imports:
```typescript
import AdminOnboarding from "./routes/admin/AdminOnboarding";
import AdminOnboardingDetail from "./routes/admin/AdminOnboardingDetail";
```
Add routes alongside the other admin routes:
```tsx
<Route path="/admin/onboarding" element={<AdminRoute><AdminOnboarding /></AdminRoute>} />
<Route path="/admin/onboarding/:id" element={<AdminRoute><AdminOnboardingDetail /></AdminRoute>} />
```

- [ ] **Step 4: Typecheck (detail import will fail until Task 7)**

Run: `cd command-center/app && npm run typecheck`
Expected: one error: cannot find `AdminOnboardingDetail`. That is resolved in Task 7. (If executing strictly task-by-task, create a one-line placeholder export now and replace it in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/routes/admin/AdminOnboarding.tsx command-center/app/src/routes/admin/AdminLayout.tsx command-center/app/src/App.tsx
git commit -m "feat(onboarding): list page, nav item, routes"
```

---

## Task 7: Onboarding detail page (form + provision + readiness + checklist)

**Files:**
- Create: `command-center/app/src/routes/admin/AdminOnboardingDetail.tsx`

**Interfaces:**
- Consumes: `ONBOARDING_FIELDS`, `CHECKLIST_TASKS` (`src/lib/onboarding`), the four onboarding endpoints, `api<T>()`, `DesktopPage`.

- [ ] **Step 1: Build the detail page**

```tsx
// src/routes/admin/AdminOnboardingDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Check, X } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { api } from "../../lib/api";
import { ONBOARDING_FIELDS, CHECKLIST_TASKS, type FieldGroup } from "../../lib/onboarding";

const GROUPS: { key: FieldGroup; label: string }[] = [
  { key: "connection", label: "Connection" },
  { key: "business", label: "Business" },
  { key: "rep", label: "Rep & internal alerts" },
  { key: "calendars", label: "Calendars & confirmation pages" },
];

interface Check { key: string; ok: boolean; detail: string }

export default function AdminOnboardingDetail() {
  const { id = "" } = useParams();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [hasToken, setHasToken] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [f, c] = await Promise.all([
          api<{ fields: Record<string, string>; hasToken: boolean }>(`/api/admin/onboarding/${id}`),
          api<{ items: { task_key: string; done: boolean }[] }>(`/api/admin/onboarding/${id}/checklist`),
        ]);
        if (cancelled) return;
        setFields(f.fields ?? {});
        setHasToken(f.hasToken);
        setDone(Object.fromEntries((c.items ?? []).map((i) => [i.task_key, i.done])));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const set = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  const saveDraft = async () => {
    setBusy("save"); setMsg(null);
    try { await api(`/api/admin/onboarding/${id}`, { method: "PUT", body: JSON.stringify({ fields }) }); setMsg("Draft saved."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(null); }
  };

  const provision = async () => {
    setBusy("provision"); setMsg(null);
    try {
      await api(`/api/admin/onboarding/${id}`, { method: "PUT", body: JSON.stringify({ fields }) });
      const r = await api<{ ok: boolean; written: string[]; failed: { name: string }[]; notFound: string[] }>(
        `/api/admin/onboarding/${id}/provision`, { method: "POST" });
      setMsg(r.ok
        ? `Provisioned ${r.written.length} values.`
        : `Wrote ${r.written.length}, ${r.failed.length} failed, ${r.notFound.length} missing.`);
      await runReadiness();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Provision failed"); }
    finally { setBusy(null); }
  };

  const runReadiness = async () => {
    const r = await api<{ checks: Check[] }>(`/api/admin/onboarding/${id}/readiness`);
    setChecks(r.checks ?? []);
  };

  const toggle = async (taskKey: string, value: boolean) => {
    setDone((p) => ({ ...p, [taskKey]: value }));
    await api(`/api/admin/onboarding/${id}/checklist`, { method: "PUT", body: JSON.stringify({ taskKey, done: value }) });
  };

  const phases = useMemo(() => Array.from(new Set(CHECKLIST_TASKS.map((t) => t.phase))), []);

  if (loading) return <DesktopPage title="Onboarding"><div className="flex items-center gap-2 py-16 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading...</div></DesktopPage>;

  return (
    <DesktopPage title="Onboarding" subtitle="Fill, provision, verify" actions={
      <div className="flex items-center gap-2">
        <button onClick={saveDraft} disabled={busy !== null} className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-2">Save draft</button>
        <button onClick={provision} disabled={busy !== null} className="rounded-[var(--radius)] bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {busy === "provision" ? "Provisioning..." : "Provision to GHL"}
        </button>
      </div>
    }>
      {msg && <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface px-4 py-2 text-sm text-text">{msg}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Setup form */}
        <div className="space-y-6">
          {GROUPS.map((g) => (
            <section key={g.key} className="rounded-[var(--radius)] border border-border bg-surface p-4">
              <h2 className="mb-3 font-display text-[15px] font-semibold text-text">{g.label}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ONBOARDING_FIELDS.filter((f) => f.group === g.key).map((f) => {
                  const isToken = f.key === "ghl_token";
                  return (
                    <label key={f.key} className="block text-sm">
                      <span className="mb-1 block text-[13px] text-muted">{f.label}</span>
                      <input
                        type={isToken ? "password" : "text"}
                        value={fields[f.key] ?? ""}
                        placeholder={isToken && hasToken ? "Token set (leave blank to keep)" : ""}
                        onChange={(e) => set(f.key, e.target.value)}
                        className="w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-text outline-none focus:border-brand"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Readiness panel */}
        <aside className="space-y-4">
          <section className="rounded-[var(--radius)] border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[15px] font-semibold text-text">Readiness</h2>
              <button onClick={runReadiness} className="text-[12px] text-brand hover:underline">Re-check</button>
            </div>
            <ul className="space-y-2">
              {checks.length === 0 ? <li className="text-[13px] text-muted">Run a check or provision first.</li> :
                checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-[13px]">
                    {c.ok ? <Check size={15} className="mt-0.5 text-brand" /> : <X size={15} className="mt-0.5 text-danger" />}
                    <span className="text-muted">{c.detail}</span>
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-[var(--radius)] border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-[15px] font-semibold text-text">Launch checklist</h2>
            {phases.map((phase) => (
              <div key={phase} className="mb-3 last:mb-0">
                <p className="mb-1 text-[12px] uppercase tracking-wide text-faint">{phase}</p>
                {CHECKLIST_TASKS.filter((t) => t.phase === phase).map((t) => (
                  <label key={t.key} className="flex items-center gap-2 py-1 text-[13px] text-text">
                    <input type="checkbox" checked={Boolean(done[t.key])} onChange={(e) => toggle(t.key, e.target.checked)} />
                    <span className={done[t.key] ? "text-muted line-through" : ""}>{t.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </DesktopPage>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: PASS (the Task 6 import now resolves).

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/admin/AdminOnboardingDetail.tsx
git commit -m "feat(onboarding): detail page with form, provision, readiness, checklist"
```

---

## Task 8: Verify (typecheck, build, unit tests, real smoke test)

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + build + tests**

Run: `cd command-center/app && npm run typecheck && npm run build && npm run test`
Expected: all PASS. If the cross-boundary import from `functions/` to `src/lib/onboarding` fails the build, apply the fallback from Task 4 Step 2 (move the pure map to `functions/lib/onboardingFields.ts`, re-export from `src/lib/onboarding.ts`), then re-run.

- [ ] **Step 2: Real smoke test against the test subaccount**

Using the test subaccount `r0WfsA12qpBv7M185V3v` and its all-scopes token, exercise the provision + readiness path against the real GHL account (local `npm run dev:full`, log in as admin, open the test client's onboarding page, fill a couple of fields, Provision, then Re-check). Confirm: custom values are written in GHL, readiness checks go green, the provision checklist item auto-ticks. Capture the result.

- [ ] **Step 3: Edge paths**

Confirm: a bad token returns the clean "Token invalid or missing scope" message and writes nothing; running Provision twice yields the same result (idempotent); a deliberately-renamed custom value appears under `notFound`, not a crash.

- [ ] **Step 4: Commit any fixes + final**

```bash
git add -A
git commit -m "test(onboarding): verify provision + readiness end to end"
```

---

## Self-review notes

- **Spec coverage:** unified tab (Tasks 6-7), agency-entered form (Task 7), configure-only provision (Task 4), merged readiness + checklist (Tasks 5, 7), two tables (Task 1), 1:1 name mapping (Task 2), idempotent PUT writes (Task 4), token preflight + partial-failure reporting (Task 4), token never returned to browser (Task 3 GET omits it; PUT stores it), public-API-only checks (Task 5). Covered.
- **Cross-boundary import risk** (functions importing `src/lib/onboarding`) is called out with a concrete fallback in Task 4 Step 2 and Task 8 Step 1.
- **Type consistency:** `GhlCustomValue`, `buildProvisionPlan`, `summarizeReadiness`, `ProvisionPlan` names are consistent across Tasks 2, 4, 5.
