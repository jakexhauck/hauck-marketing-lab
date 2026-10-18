import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { isUuid } from "../../../../lib/agentItems";
import { deleteStage, patchStage } from "../../../../lib/director";

// PATCH  /api/admin/director/stages/:id  body { name?, index? }
// DELETE /api/admin/director/stages/:id  (only an empty stage; 409 otherwise)
//
// Owner only.

export const onRequestPatch: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = ctx.params.id;
  if (!isUuid(id)) return Response.json({ error: "id required" }, { status: 400 });
  let body: { name?: unknown; index?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (body.index !== undefined && (typeof body.index !== "number" || !Number.isInteger(body.index) || body.index < 0)) {
    return Response.json({ error: "bad index" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await patchStage(client, id, { name: body.name, index: body.index as number | undefined });
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ stage: res.ok });
};

export const onRequestDelete: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = ctx.params.id;
  if (!isUuid(id)) return Response.json({ error: "id required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await deleteStage(client, id);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ ok: true });
};
