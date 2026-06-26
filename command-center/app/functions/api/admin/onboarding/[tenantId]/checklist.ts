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

// PUT /api/admin/onboarding/:tenantId/checklist  body { taskKey, done, value? }
export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  let body: { taskKey?: string; done?: boolean; value?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.taskKey) return Response.json({ error: "taskKey required" }, { status: 400 });

  const { error } = await client.from("onboarding_checklist").upsert(
    {
      tenant_id: tenantId,
      task_key: body.taskKey,
      done: Boolean(body.done),
      value: body.value ?? null,
      done_at: body.done ? new Date().toISOString() : null,
      done_by: ctx.data.admin?.id ?? null,
    },
    { onConflict: "tenant_id,task_key" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
