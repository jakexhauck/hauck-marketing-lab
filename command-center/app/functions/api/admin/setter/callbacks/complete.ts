import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { ghlJson } from "../../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// POST /api/admin/setter/callbacks/complete (admin-only, gated in
// _middleware.ts). Marks one scheduled callback done: the mirror row flips to
// 'done' and the CRM task it points at is completed too, so the client's own
// team sees it cleared.
//
// The row flips FIRST. If the CRM write then fails, the callback still
// leaves the rail (the setter did the work; keeping it red would nag them
// into a duplicate dial) and the response says the CRM side needs a manual
// tick. The reverse order would be worse: a completed CRM task with a rail
// row that never clears.

export interface CompleteCallbackBody {
  tenantId?: string;
  id?: string;
}

interface GhlTask {
  id: string;
  title: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
  assignedTo?: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<CompleteCallbackBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const tenantId = body.tenantId?.trim();
  const id = body.id?.trim();
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // tenant_id is part of the match on purpose: a callback id from one client
  // must not be completable while another client is selected.
  const { data, error } = await client
    .from("setter_callbacks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .select("contact_id, ghl_task_id")
    .maybeSingle();
  if (error) return Response.json({ error: "callback_update_failed" }, { status: 500 });
  if (!data) return Response.json({ error: "callback_not_found" }, { status: 404 });

  await logAdminAction(client, ctx.data.admin!.id, "setter.callback_done", tenantId, {
    callbackId: id,
  });

  const contactId = (data.contact_id as string) ?? "";
  const taskId = (data.ghl_task_id as string | null) ?? "";
  if (!contactId || !taskId) return Response.json({ ok: true, crmUpdated: false });

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const taskPath = `/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}`;
    // Fetch-merge: the CRM's task PUT is a full replace (see the client-app
    // task route), so completing must not drop title/dueDate/assignedTo.
    const existing = await ghlJson<{ task?: GhlTask }>(gctx, taskPath);
    const current = existing.task;
    if (!current) return Response.json({ ok: true, crmUpdated: false });
    const payload: Record<string, unknown> = {
      title: current.title,
      dueDate: current.dueDate,
      completed: true,
    };
    if (current.body !== undefined) payload.body = current.body;
    if (current.assignedTo) payload.assignedTo = current.assignedTo;
    await ghlJson(gctx, taskPath, { method: "PUT", body: JSON.stringify(payload) });
    return Response.json({ ok: true, crmUpdated: true });
  } catch (e) {
    if (e instanceof TenantGhlError) {
      return Response.json({ ok: true, crmUpdated: false });
    }
    // The row is already done; a CRM hiccup must not read as "not completed".
    return Response.json({ ok: true, crmUpdated: false });
  }
};
