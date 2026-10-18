import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isUuid } from "../../../lib/agentItems";
import { createTask } from "../../../lib/director";
import { isSopOwner } from "../../../../src/lib/director";

// POST /api/admin/director/tasks  body { stageId, name, owner, steps? }
//   -> 200 { task }
//
// A task Jake adds on the Director. With steps (the Tell bar wrote them) they
// are kept; without, Claude drafts some. Either way the task is a draft until
// Jake approves its steps on the SOPs page, so no agent runs on it before.
// Owner only.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { stageId?: unknown; name?: unknown; owner?: unknown; steps?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!isUuid(body.stageId) || !isSopOwner(body.owner)) {
    return Response.json({ error: "stageId and owner required" }, { status: 400 });
  }
  const steps = Array.isArray(body.steps) ? body.steps.filter((s): s is string => typeof s === "string").slice(0, 20) : undefined;

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await createTask(client, ctx.env, { stageId: body.stageId, name: body.name, owner: body.owner, steps });
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json({ task: res.ok });
};
