import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// Backs the Theory-of-Constraints admin command view (0022): one row per
// business pillar describing its current constraint, plus an ordered
// Identify/Exploit/Subordinate/Elevate/Repeat attack-plan per constraint.

export const PILLARS = ["acquisition", "sales", "delivery", "operations"] as const;
export type Pillar = (typeof PILLARS)[number];

export const SEVERITIES = ["high", "med", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STEP_NAMES = ["Identify", "Exploit", "Subordinate", "Elevate", "Repeat"] as const;
export type StepName = (typeof STEP_NAMES)[number];

export const STEP_STATUSES = ["todo", "doing", "done"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

// Severity rank for GET ordering: high first, then med, then low.
const SEVERITY_RANK: Record<Severity, number> = { high: 0, med: 1, low: 2 };

interface StepRow {
  step: string;
  action: string;
  owner: string | null;
  status: string;
  sort: number;
}

interface ConstraintRow {
  id: string;
  pillar: string;
  title: string;
  severity: string;
  metric: string | null;
  detail: string | null;
  impact: string | null;
  is_system: boolean;
  throughput_val: string | null;
  throughput_label: string | null;
  updated_at: string;
  pillar_constraint_steps: StepRow[];
}

const SELECT =
  "id, pillar, title, severity, metric, detail, impact, is_system, throughput_val, throughput_label, updated_at, pillar_constraint_steps(step, action, owner, status, sort)";

function toStep(row: StepRow) {
  return {
    step: row.step,
    action: row.action,
    owner: row.owner,
    status: row.status,
    sort: row.sort,
  };
}

function toConstraint(row: ConstraintRow) {
  return {
    pillar: row.pillar,
    title: row.title,
    severity: row.severity,
    metric: row.metric,
    detail: row.detail,
    impact: row.impact,
    isSystem: row.is_system,
    throughputVal: row.throughput_val,
    throughputLabel: row.throughput_label,
    updatedAt: row.updated_at,
    steps: [...row.pillar_constraint_steps]
      .sort((a, b) => a.sort - b.sort)
      .map(toStep),
  };
}

// GET /api/admin/constraints  (admin-only, gated in _middleware.ts)
// Every pillar's constraint with its steps, ordered by severity (high, med,
// low) then pillar name. There are only 4 rows total, so the severity sort
// (not alphabetical) is done in application code rather than a DB CASE
// expression the supabase-js query builder cannot express directly.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("pillar_constraints")
    .select(SELECT)
    .order("sort", { foreignTable: "pillar_constraint_steps", ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as ConstraintRow[];
  const constraints = rows
    .map(toConstraint)
    .sort((a, b) => {
      const rankDiff =
        SEVERITY_RANK[a.severity as Severity] - SEVERITY_RANK[b.severity as Severity];
      return rankDiff !== 0 ? rankDiff : a.pillar.localeCompare(b.pillar);
    });

  return Response.json({ constraints });
};

interface StepBody {
  step?: string;
  action?: string;
  owner?: string | null;
  status?: string;
  sort?: number;
}

interface PutBody {
  pillar?: string;
  title?: string;
  severity?: string;
  metric?: string | null;
  detail?: string | null;
  impact?: string | null;
  isSystem?: boolean;
  throughputVal?: string | null;
  throughputLabel?: string | null;
  steps?: StepBody[];
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

// Pure validation, split out so it is unit-testable without a DB. Checks the
// enum-shaped fields the DB also constrains (pillar, severity, step name,
// step status) plus the two NOT NULL text columns (title, and each step's
// action) so a bad request 400s instead of surfacing a DB error as a 500.
export function validatePutBody(body: PutBody): ValidationResult {
  if (!body.pillar || !PILLARS.includes(body.pillar as Pillar)) {
    return { ok: false, error: "pillar must be one of: " + PILLARS.join(", ") };
  }
  if (!body.title || !body.title.trim()) {
    return { ok: false, error: "title is required" };
  }
  if (!body.severity || !SEVERITIES.includes(body.severity as Severity)) {
    return { ok: false, error: "severity must be one of: " + SEVERITIES.join(", ") };
  }
  const steps = body.steps ?? [];
  for (const s of steps) {
    if (!s.step || !STEP_NAMES.includes(s.step as StepName)) {
      return { ok: false, error: "step must be one of: " + STEP_NAMES.join(", ") };
    }
    if (!s.action || !s.action.trim()) {
      return { ok: false, error: "each step requires an action" };
    }
    if (!s.status || !STEP_STATUSES.includes(s.status as StepStatus)) {
      return { ok: false, error: "step status must be one of: " + STEP_STATUSES.join(", ") };
    }
  }
  return { ok: true };
}

// PUT /api/admin/constraints  (admin-only): save one pillar's full record,
// the constraint row (upserted by the unique `pillar` key) plus a full
// replace of its steps. Enforces the single-system invariant server-side:
// setting isSystem=true on one pillar clears it on every other pillar, so
// exactly one row is ever the system constraint.
export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: PutBody = {};
  try {
    body = (await ctx.request.json()) as PutBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const validation = validatePutBody(body);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const pillar = body.pillar as Pillar;
  const isSystem = body.isSystem === true;
  const steps = (body.steps ?? []).map((s) => ({
    step: s.step as string,
    action: (s.action as string).trim(),
    owner: s.owner && s.owner.trim() ? s.owner.trim() : null,
    status: s.status as StepStatus,
    sort: typeof s.sort === "number" ? s.sort : 0,
  }));

  // Single-system invariant, applied before the upsert so the row being
  // saved (if it is the new system constraint) is never clobbered by its
  // own clearing pass.
  if (isSystem) {
    const { error: clearErr } = await client
      .from("pillar_constraints")
      .update({ is_system: false })
      .neq("pillar", pillar);
    if (clearErr) return Response.json({ error: clearErr.message }, { status: 500 });
  }

  const { data: saved, error: upsertErr } = await client
    .from("pillar_constraints")
    .upsert(
      {
        pillar,
        title: body.title!.trim(),
        severity: body.severity,
        metric: body.metric ?? null,
        detail: body.detail ?? null,
        impact: body.impact ?? null,
        is_system: isSystem,
        throughput_val: body.throughputVal ?? null,
        throughput_label: body.throughputLabel ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pillar" },
    )
    .select("id, updated_at")
    .single();
  if (upsertErr || !saved) {
    return Response.json({ error: upsertErr?.message ?? "could not save constraint" }, { status: 500 });
  }

  const constraintId = (saved as { id: string }).id;

  // Replace steps: delete then insert. Not atomic (the JS client has no
  // multi-statement transaction): if the insert below fails after this
  // delete succeeds, the constraint row is saved but its steps are empty
  // until the next successful PUT. Acceptable for v1; noted in the report.
  const { error: delErr } = await client
    .from("pillar_constraint_steps")
    .delete()
    .eq("constraint_id", constraintId);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (steps.length) {
    const { error: insErr } = await insertSteps(client, constraintId, steps);
    if (insErr) return Response.json({ error: insErr }, { status: 500 });
  }

  return Response.json({
    constraint: {
      pillar,
      title: body.title!.trim(),
      severity: body.severity,
      metric: body.metric ?? null,
      detail: body.detail ?? null,
      impact: body.impact ?? null,
      isSystem,
      throughputVal: body.throughputVal ?? null,
      throughputLabel: body.throughputLabel ?? null,
      updatedAt: (saved as { updated_at: string }).updated_at,
      steps,
    },
  });
};

async function insertSteps(
  client: SupabaseClient,
  constraintId: string,
  steps: { step: string; action: string; owner: string | null; status: string; sort: number }[],
): Promise<{ error: string | null }> {
  const { error } = await client.from("pillar_constraint_steps").insert(
    steps.map((s) => ({
      constraint_id: constraintId,
      step: s.step,
      action: s.action,
      owner: s.owner,
      status: s.status,
      sort: s.sort,
    })),
  );
  return { error: error?.message ?? null };
}
