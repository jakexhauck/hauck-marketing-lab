# In-App Onboarding — Plan 2: The Ops Checklist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisite:** Plan 1 (the intake loop) is shipped. This plan adds the 6-phase / 27-task fulfilment checklist to the admin onboarding detail view.

**Goal:** On each client's admin onboarding detail page, show the full 6-phase / 27-task ops checklist (ported from the retired Tauri app) with tickable tasks, optional-skip, inline fields, and phase-completion stamps, all persisted per client in Supabase.

**Architecture:** A new `onboarding_progress` table holds per-tenant checklist state (`done[]`, `skipped_optional[]`, `phase_done_at`, `inline_values`). The `ONBOARDING_PLAN` definition is ported verbatim from the old app into command-center. New admin endpoints read and mutate progress. A checklist panel is added beside the submission panel on the admin detail screen.

**Tech Stack:** Same as Plan 1.

## Global Constraints

- Spec: `docs/build-plans/Onboarding/2026-06-22-in-app-onboarding-design.md`.
- Work in `command-center/app/` only.
- Never use an em dash (—) anywhere.
- Migrations: sequential SQL in `command-center/app/supabase/migrations/`, idempotent, applied via `npm run db:migrate`. Use the next free number after Plan 1's migration.
- GHL pipeline sync from the old app is DROPPED. Checklist tasks that mention GHL/mobile/vault stay as descriptive manual to-dos; nothing integrates.
- Inline-field values persist to `onboarding_progress.inline_values` (Supabase), NOT to a vault.
- Reuse the design tokens and `ui/` components established in Plan 1.

---

## File Structure

**Create:**
- `supabase/migrations/NNNN_onboarding_progress.sql` — progress table + RLS.
- `src/lib/onboardingPlan.ts` — ported `ONBOARDING_PLAN` + types + helper functions.
- `src/lib/onboardingPlan.test.ts` — unit tests for the helper math.
- `src/components/onboarding/OnboardingChecklist.tsx` — the checklist panel UI.
- `functions/api/admin/onboarding/[tenantId]/checklist.ts` — `GET` progress, `POST` mutate.

**Modify:**
- `src/lib/api.ts` — add progress types + client functions.
- `src/routes/admin/AdminOnboardingDetail.tsx` — mount the checklist panel.

---

### Task 1: Progress table migration

**Files:**
- Create: `command-center/app/supabase/migrations/NNNN_onboarding_progress.sql`

**Interfaces:**
- Produces: `public.onboarding_progress` (one row per tenant).

- [ ] **Step 1: Confirm next migration number**

Run: `ls command-center/app/supabase/migrations`
Use the highest prefix + 1.

- [ ] **Step 2: Write the migration**

```sql
-- In-app onboarding: per-tenant ops checklist progress. Idempotent.

create table if not exists public.onboarding_progress (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  done             text[] not null default '{}',
  skipped_optional text[] not null default '{}',
  phase_done_at    jsonb  not null default '{}'::jsonb,
  inline_values    jsonb  not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

alter table public.onboarding_progress enable row level security;
-- Service-role only; browser never touches this table directly.
```

- [ ] **Step 3: Apply + commit**

```bash
cd command-center/app && npm run db:migrate
git add command-center/app/supabase/migrations/
git commit -m "feat(onboarding): checklist progress table"
```

---

### Task 2: Port the onboarding plan (definition + helpers, TDD)

**Files:**
- Create: `command-center/app/src/lib/onboardingPlan.ts`
- Test: `command-center/app/src/lib/onboardingPlan.test.ts`

**Interfaces:**
- Produces: `ONBOARDING_PLAN: OnboardingPhase[]`, the types (`OnboardingPhase`, `OnboardingSubsection`, `OnboardingTask`, `OnboardingInlineField`, `OnboardingInlineFieldKind`), and helpers `totalTasks`, `requiredTotalTasks`, `phaseTaskCount`, `requiredPhaseTaskCount`, `phaseTaskIds`, `requiredPhaseTaskIds`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  ONBOARDING_PLAN,
  totalTasks,
  requiredTotalTasks,
  phaseTaskIds,
  requiredPhaseTaskIds,
} from "./onboardingPlan";

describe("onboarding plan", () => {
  it("has 6 phases", () => {
    expect(ONBOARDING_PLAN.map((p) => p.num)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("counts 27 total tasks", () => {
    expect(totalTasks()).toBe(27);
  });

  it("required total excludes the 3 optional tasks", () => {
    // 02-ga, 03-pixel, 03-pixel-verify are optional.
    expect(requiredTotalTasks()).toBe(totalTasks() - 3);
    expect(requiredTotalTasks()).toBe(24);
  });

  it("phase 2 has 14 tasks", () => {
    const phase2 = ONBOARDING_PLAN.find((p) => p.num === 2)!;
    expect(phaseTaskIds(phase2).length).toBe(14);
  });

  it("required ids never include an optional task", () => {
    const phase3 = ONBOARDING_PLAN.find((p) => p.num === 3)!;
    expect(requiredPhaseTaskIds(phase3)).not.toContain("03-pixel");
  });

  it("every task id is unique", () => {
    const ids = ONBOARDING_PLAN.flatMap((p) => phaseTaskIds(p));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/onboardingPlan.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Port the file**

Copy `app/src/lib/onboardingPlan.ts` (the retired Tauri app) into `command-center/app/src/lib/onboardingPlan.ts` VERBATIM. It is already a pure module with no Tauri/vault imports (it only defines data + helper functions). Do not change task text, ids, optional flags, or inline fields. The full source is in the old file; reproduce it exactly.

Reference checks the port must preserve (counted from the source file):
- 6 phases with these task counts: Pre-Call Prep (2), Onboarding Call (14: subsections 2.1=6, 2.2=4, 2.3=3, 2.4=1), Technical Setup (4), Creative Production (1), Campaign Build + QA (3), Launch + Monitor (3). Total = 27. The Phase 2 `meta` string in the source reads "15 tasks" but the actual task array is 14; the array is authoritative, leave the meta string as-is (it is display copy, not logic).
- Optional tasks: `02-ga`, `03-pixel`, `03-pixel-verify` (3 total). Required = 24.
- Inline fields: `profile-budget` (02-expect), `profile-offer-cta` (02-offer), `memory-fathom` (01ag-memory).
- If after a verbatim copy the test reports a count other than 27/14/24, the port is authoritative: re-count, fix the test expectation to match the real numbers, and do NOT edit the plan data to hit a number.

- [ ] **Step 4: Run to verify**

Run: `cd command-center/app && npx vitest run src/lib/onboardingPlan.test.ts`
Expected: PASS. If a count differs from 27/14/24, correct the test expectation to the real count (the port is authoritative), then re-run to green.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/onboardingPlan.ts command-center/app/src/lib/onboardingPlan.test.ts
git commit -m "feat(onboarding): port 6-phase ops plan"
```

---

### Task 3: Progress endpoints

**Files:**
- Create: `command-center/app/functions/api/admin/onboarding/[tenantId]/checklist.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `ctx.params.tenantId`.
- Produces:
  - `GET .../checklist` → `{ done: string[]; skippedOptional: string[]; phaseDoneAt: Record<string,string>; inlineValues: Record<string,string> }` (defaults if no row).
  - `POST .../checklist` body one of:
    - `{ action: "toggle"; taskId; value: boolean }` (add/remove from `done`)
    - `{ action: "skip"; taskId; value: boolean }` (add/remove from `skipped_optional`)
    - `{ action: "phase"; phase: string; doneAt: string | null }` (set/clear `phase_done_at[phase]`)
    - `{ action: "inline"; key: string; value: string }` (set `inline_values[key]`)
    Returns the full updated progress object.

- [ ] **Step 1: Implement**

```typescript
import type { Env } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

type Progress = {
  done: string[];
  skippedOptional: string[];
  phaseDoneAt: Record<string, string>;
  inlineValues: Record<string, string>;
};

const EMPTY: Progress = { done: [], skippedOptional: [], phaseDoneAt: {}, inlineValues: {} };

async function load(client: ReturnType<typeof getServiceClient>, tenantId: string): Promise<Progress> {
  if (!client) return EMPTY;
  const { data } = await client
    .from("onboarding_progress")
    .select("done, skipped_optional, phase_done_at, inline_values")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const r = data as Record<string, unknown> | null;
  if (!r) return EMPTY;
  return {
    done: (r.done as string[]) ?? [],
    skippedOptional: (r.skipped_optional as string[]) ?? [],
    phaseDoneAt: (r.phase_done_at as Record<string, string>) ?? {},
    inlineValues: (r.inline_values as Record<string, string>) ?? {},
  };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });
  const tenantId = String(ctx.params.tenantId ?? "");
  return Response.json(await load(client, tenantId));
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "unavailable" }, { status: 503 });
  const tenantId = String(ctx.params.tenantId ?? "");
  if (!tenantId) return Response.json({ error: "missing tenant" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const cur = await load(client, tenantId);
  const action = String(body.action ?? "");
  const toggleList = (list: string[], id: string, on: boolean) =>
    on ? Array.from(new Set([...list, id])) : list.filter((x) => x !== id);

  if (action === "toggle") {
    cur.done = toggleList(cur.done, String(body.taskId), Boolean(body.value));
  } else if (action === "skip") {
    cur.skippedOptional = toggleList(cur.skippedOptional, String(body.taskId), Boolean(body.value));
  } else if (action === "phase") {
    const phase = String(body.phase);
    if (body.doneAt == null) delete cur.phaseDoneAt[phase];
    else cur.phaseDoneAt[phase] = String(body.doneAt);
  } else if (action === "inline") {
    cur.inlineValues[String(body.key)] = String(body.value ?? "");
  } else {
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  const { error } = await client.from("onboarding_progress").upsert(
    {
      tenant_id: tenantId,
      done: cur.done,
      skipped_optional: cur.skippedOptional,
      phase_done_at: cur.phaseDoneAt,
      inline_values: cur.inlineValues,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(cur);
};
```

- [ ] **Step 2: Verify**

With an admin session, GET `.../<tenantId>/checklist` -> defaults. POST `{ action: "toggle", taskId: "03-competitors", value: true }` -> `done` contains it. POST `{ action: "inline", key: "profile-budget", value: "$1,500/mo" }` -> `inlineValues` updated. POST `{ action: "phase", phase: "1", doneAt: "2026-06-22" }` -> `phaseDoneAt["1"]` set. Confirm persistence via a fresh GET.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/functions/api/admin/onboarding/
git commit -m "feat(onboarding): checklist progress endpoints"
```

---

### Task 4: Client API for progress

**Files:**
- Modify: `command-center/app/src/lib/api.ts`

**Interfaces:**
- Produces:
  - `interface OnboardingProgress { done: string[]; skippedOptional: string[]; phaseDoneAt: Record<string,string>; inlineValues: Record<string,string> }`
  - `getChecklist(tenantId): Promise<OnboardingProgress>`
  - `mutateChecklist(tenantId, payload): Promise<OnboardingProgress>` where payload is the discriminated union from Task 3.

- [ ] **Step 1: Add the code**

```typescript
export interface OnboardingProgress {
  done: string[];
  skippedOptional: string[];
  phaseDoneAt: Record<string, string>;
  inlineValues: Record<string, string>;
}

export type ChecklistMutation =
  | { action: "toggle"; taskId: string; value: boolean }
  | { action: "skip"; taskId: string; value: boolean }
  | { action: "phase"; phase: string; doneAt: string | null }
  | { action: "inline"; key: string; value: string };

export function getChecklist(tenantId: string): Promise<OnboardingProgress> {
  return api<OnboardingProgress>(`/api/admin/onboarding/${tenantId}/checklist`);
}

export function mutateChecklist(
  tenantId: string,
  payload: ChecklistMutation,
): Promise<OnboardingProgress> {
  return api(`/api/admin/onboarding/${tenantId}/checklist`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd command-center/app && npx tsc --noEmit
git add command-center/app/src/lib/api.ts
git commit -m "feat(onboarding): checklist client API"
```

---

### Task 5: Checklist panel UI

**Files:**
- Create: `command-center/app/src/components/onboarding/OnboardingChecklist.tsx`

**Interfaces:**
- Consumes: `ONBOARDING_PLAN` + helpers (Task 2); `getChecklist`, `mutateChecklist`, `OnboardingProgress` (Task 4); `Panel`/`PanelHeader`, `Badge`, `Button`.
- Produces: `OnboardingChecklist({ tenantId }: { tenantId: string })` default export.

- [ ] **Step 1: Build the panel**

Behavior:
- On mount, `getChecklist(tenantId)` into state.
- Render each phase as a section: phase number + name + `meta` (e.g. "Day 0 · 15 tasks"), a progress count `X / requiredPhaseTaskCount` based on `done`, and a phase-complete stamp when `phaseDoneAt[String(num)]` is set.
- Render each subsection with its title/meta, then each task as a row: a checkbox (checked if `done.includes(task.id)`), the label, and the `howto` (string or string[]) shown as muted help text (render the HTML via `dangerouslySetInnerHTML` since the source `howto` contains intentional inline markup; it is trusted static content from the ported plan).
- Optional tasks show an "N/A" toggle that adds/removes from `skippedOptional`.
- Tasks with an `inlineField` render a small text/url input + Save button; Save calls `mutateChecklist({ action: "inline", key: inlineField.kind, value })` and also ticks the task (`toggle` true). Pre-fill from `inlineValues[inlineField.kind]`.
- Checkbox change calls `mutateChecklist({ action: "toggle", taskId, value })` and updates local state from the response.
- When all required tasks in a phase are done and `phaseDoneAt` is unset, call `mutateChecklist({ action: "phase", phase: String(num), doneAt: <todayISODate> })` to stamp it. Compute today as `new Date().toISOString().slice(0,10)`.

Styling: wrap in `<Panel>` with a `<PanelHeader title="Fulfilment checklist" kicker="Onboarding ops" />`. Phase headers use `font-display`. Completed task labels get `text-muted line-through`. Checkboxes styled with brand accent. Keep it a single scrollable column.

Provide the full component (no placeholders). Use the helpers `requiredPhaseTaskCount`, `requiredPhaseTaskIds` to compute phase completion.

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/onboarding/OnboardingChecklist.tsx
git commit -m "feat(onboarding): checklist panel component"
```

---

### Task 6: Mount checklist on admin detail

**Files:**
- Modify: `command-center/app/src/routes/admin/AdminOnboardingDetail.tsx`

- [ ] **Step 1: Add the panel**

Import `OnboardingChecklist` and render it below the Submission panel, passing `tenantId` from `useParams()`. Use a responsive two-column layout on wide screens (`lg:grid-cols-2 gap-6`) with Submission left, Checklist right; stacked on narrow.

- [ ] **Step 2: Verify (Playwright, real app)**

Open a client's `/admin/onboarding/:tenantId`. Confirm the checklist renders all 6 phases. Tick a task -> reload -> still ticked (persisted). Set the budget inline field -> reload -> value persists and task is ticked. Complete all required tasks in Phase 1 -> confirm the phase stamp appears. Screenshot the detail page with the checklist.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/admin/AdminOnboardingDetail.tsx
git commit -m "feat(onboarding): mount checklist on admin detail"
```

---

### Task 7: Stage 2 verification

**Files:** none

- [ ] **Step 1: Full check**

Run: `cd command-center/app && npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean.

- [ ] **Step 2: E2E (Playwright)**

End to end: create onboarding -> client submits (Plan 1) -> admin opens detail -> works the checklist (tick tasks, set inline fields, complete a phase) -> all state persists across reloads. Capture a screenshot of a partially-completed checklist.

- [ ] **Step 3: Remove the built plan docs (workspace hygiene)**

Per the delete-built-plans rule, once both plans are shipped and verified, `git rm` the two plan MD files in the shipping commit. Keep the design spec (`2026-06-22-in-app-onboarding-design.md`) as the durable reference, or move its key decisions to the architecture map per your convention.

```bash
git rm docs/build-plans/Onboarding/2026-06-22-onboarding-plan-1-intake-loop.md docs/build-plans/Onboarding/2026-06-22-onboarding-plan-2-ops-checklist.md
git commit -m "chore(onboarding): remove shipped build plans"
```

---

## Self-Review Notes (author)

- Spec coverage: progress table (T1), verbatim plan port with tests (T2), read/mutate endpoints incl. inline + phase (T3), client API (T4), checklist panel with toggles/optional-skip/inline/phase-stamp (T5), mounted on detail (T6). GHL sync dropped per spec. Inline values to Supabase, not vault, per spec.
- Task counts (27 total, Phase 2 = 14, 24 required) were counted from the source file. The port is authoritative: if a verbatim copy yields different counts, fix the test expectations, not the data. Flagged in T2.3/T2.4.
- `dangerouslySetInnerHTML` is used only for the trusted static `howto` markup ported from the old plan; no user input flows there.
