import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { isUuid } from "../../../../lib/agentItems";
import { deleteTask, patchTask, type TaskPatch } from "../../../../lib/clientTasks";

// PATCH  /api/admin/client-tasks/:tenantId/:taskId  body TaskPatch -> { task }
// DELETE /api/admin/client-tasks/:tenantId/:taskId                 -> { ok }
//
// Jake's edits on the Director: rename, re-own, move, tick and untick. Only
// Jake unticks; agents never can (lib/agentTasks.ts). Owner only.

type Ctx = Parameters<PagesFunction<Env, "tenantId" | "taskId", ApiData>>[0];

function ids(ctx: Ctx): { tenantId: string; taskId: string } | null {
  const tenantId = ctx.params.tenantId as string;
  const taskId = ctx.params.taskId as string;
  return isUuid(tenantId) && isUuid(taskId) ? { tenantId, taskId } : null;
}

export const onRequestPatch: PagesFunction<Env, "tenantId" | "taskId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const at = ids(ctx);
  if (!at) return Response.json({ error: "task not found" }, { status: 404 });
  let body: TaskPatch;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await patchTask(client, at.tenantId, at.taskId, body, "jake");
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  await logAdminAction(client, admin.id, "client_task.update", at.tenantId, { taskId: at.taskId, fields: Object.keys(body) });
  return Response.json({ task: res });
};

export const onRequestDelete: PagesFunction<Env, "tenantId" | "taskId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const at = ids(ctx);
  if (!at) return Response.json({ error: "task not found" }, { status: 404 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  if (!(await deleteTask(client, at.tenantId, at.taskId))) return Response.json({ error: "task not found" }, { status: 404 });
  await logAdminAction(client, admin.id, "client_task.delete", at.tenantId, { taskId: at.taskId });
  return Response.json({ ok: true });
};
