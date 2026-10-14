import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { normalizeInputs } from "../../../../src/lib/coldSmsBudget";

// Cold SMS > SMS Budget. One row per month of estimated cold SMS spend
// (0137). Agency-global, owner only (no role rule opens it). The cost lines
// are computed client-side in src/lib/coldSmsBudget.ts and never stored.

interface BudgetRow {
  id: string;
  month: string;
  inputs: unknown;
}

const SELECT = "id, month, inputs";

function toRow(row: BudgetRow) {
  return {
    id: row.id,
    month: row.month,
    inputs: normalizeInputs(row.inputs),
  };
}

function normalizeMonth(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw);
  if (!match) return null;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

// GET /api/admin/tracker/cold-sms-budget: every saved month, newest first.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("cold_sms_budget")
    .select(SELECT)
    .order("month", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ rows: ((data ?? []) as unknown as BudgetRow[]).map(toRow) });
};

// PUT /api/admin/tracker/cold-sms-budget: write one month whole
// ({ month, inputs }). The page always sends the full month, so
// a write never has to merge.
export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const month = normalizeMonth(body.month);
  if (!month) {
    return Response.json({ error: "month must be YYYY-MM or YYYY-MM-DD" }, { status: 400 });
  }

  const update = {
    month,
    inputs: normalizeInputs(body.inputs),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("cold_sms_budget")
    .upsert(update, { onConflict: "month" })
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save budget" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_budget.upsert", null, update);

  return Response.json({ row: toRow(data as unknown as BudgetRow) });
};
