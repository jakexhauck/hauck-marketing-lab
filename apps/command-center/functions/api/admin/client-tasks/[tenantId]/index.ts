import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { isUuid } from "../../../../lib/agentItems";
import { createTask, ensureTasks } from "../../../../lib/clientTasks";

// GET  /api/admin/client-tasks/:tenantId  -> { tasks: ClientTask[] }
// POST /api/admin/client-tasks/:tenantId  body { phase, owner, name, steps? } -> { task }
//
// The per-client Director (lib/clientTasks.ts). The first read seeds the client
// from the Client Fulfillment map. Owner only, checked here.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = ctx.params.tenantId as string;
  if (!isUuid(tenantId)) return Response.json({ error: "client not found" }, { status: 404 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json({ tasks: await ensureTasks(client, tenantId) });
};

export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = ctx.params.tenantId as string;
  if (!isUuid(tenantId)) return Response.json({ error: "client not found" }, { status: 404 });
  let body: { phase?: unknown; owner?: unknown; name?: unknown; steps?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await createTask(client, tenantId, body, "jake");
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  await logAdminAction(client, admin.id, "client_task.create", tenantId, { taskId: res.id });
  return Response.json({ task: res });
};
