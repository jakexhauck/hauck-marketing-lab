import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// GET /api/admin/onboarding/:tenantId/checklist -> saved task states
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

// PUT /api/admin/onboarding/:tenantId/checklist  body { taskKey, done?, value? }
//
// Only the keys present are written: typing a Fathom link must not untick the
// step it sits on, and ticking must not wipe the link.
export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  let body: { taskKey?: string; done?: boolean; value?: string | null };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.taskKey) return Response.json({ error: "taskKey required" }, { status: 400 });
  if (!("done" in body) && !("value" in body)) {
    return Response.json({ error: "nothing to change" }, { status: 400 });
  }

  const row: Record<string, unknown> = { tenant_id: tenantId, task_key: body.taskKey };
  if ("done" in body) {
    row.done = Boolean(body.done);
    row.done_at = body.done ? new Date().toISOString() : null;
    row.done_by = ctx.data.admin?.id ?? null;
  }
  if ("value" in body) {
    const v = typeof body.value === "string" ? body.value.trim().slice(0, 2000) : "";
    row.value = v || null;
  }

  const { error } = await client
    .from("onboarding_checklist")
    .upsert(row, { onConflict: "tenant_id,task_key" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
