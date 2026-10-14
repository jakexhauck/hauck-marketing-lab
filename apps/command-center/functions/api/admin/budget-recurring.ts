import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { logAdminAction } from "../../lib/adminAuth";
import { normalizeRecurring } from "../../../src/lib/agencyBudget";

// Operations > Budget > Recurring (0146). One row holding the whole list of
// recurring expenses. Owner only (no role rule opens it).

// GET /api/admin/budget-recurring: the list ([] before anything is saved).
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client.from("agency_budget_recurring").select("items").eq("id", 1).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ items: normalizeRecurring(data?.items) });
};

// PUT /api/admin/budget-recurring: write the list whole ({ items }).
export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update = { id: 1, items: normalizeRecurring(body.items), updated_at: new Date().toISOString() };
  const { data, error } = await client
    .from("agency_budget_recurring")
    .upsert(update, { onConflict: "id" })
    .select("items")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save recurring" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "agency_budget_recurring.upsert", null, update);

  return Response.json({ items: normalizeRecurring(data.items) });
};
