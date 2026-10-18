import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { isUuid } from "../../../../lib/agentItems";
import { patchTask, removeTask, restoreTask, type TaskPatch } from "../../../../lib/director";
import { isSopOwner } from "../../../../../src/lib/director";

// PATCH  /api/admin/director/tasks/:id  body { name?, owner?, stageId?, index?, how?, approve?, restore? }
// DELETE /api/admin/director/tasks/:id
//
// Rename, reassign, move, write or approve an added task's steps, or bring an
// Off graph box back (restore). DELETE switches a graph box's task off and
// deletes an added one (lib/director.ts). Owner only.

export const onRequestPatch: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = ctx.params.id;
  if (!isUuid(id)) return Response.json({ error: "id required" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  if (body.restore === true) {
    const res = await restoreTask(client, id);
    if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
    return Response.json({ task: res.ok });
  }

  const patch: TaskPatch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.owner !== undefined) {
    if (!isSopOwner(body.owner)) return Response.json({ error: "bad owner" }, { status: 400 });
    patch.owner = body.owner;
  }
  if (body.stageId !== undefined) {
    if (!isUuid(body.stageId)) return Response.json({ error: "bad stageId" }, { status: 400 });
    patch.stageId = body.stageId;
  }
  if (body.index !== undefined) {
    if (typeof body.index !== "number" || !Number.isInteger(body.index) || body.index < 0) {
      return Response.json({ error: "bad index" }, { status: 400 });
    }
    patch.index = body.index;
  }
  if (body.how !== undefined) patch.how = body.how;
  if (body.approve === true) patch.approve = true;

  const res = await patchTask(client, id, patch);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ task: res.ok });
};

export const onRequestDelete: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = ctx.params.id;
  if (!isUuid(id)) return Response.json({ error: "id required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await removeTask(client, id);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ ok: true });
};
