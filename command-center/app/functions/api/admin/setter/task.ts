import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// POST /api/admin/setter/task (admin-only, gated in _middleware.ts). Creates a
// follow-up task on a live CRM contact in the client's own sub-account. Like
// setter/tags.ts this MUST resolve the tenant's credentials through
// getGhlContextForTenant (never the session's own GHL creds, which belong to a
// different location) so the task lands on the right contact in the right CRM.

export interface SetterTaskBody {
  tenantId?: string;
  contactId?: string;
  title?: string;
  dueDate?: string;
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

// Pure, split out so it is unit-testable without a request.
export function validateTaskBody(body: SetterTaskBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
  }
  if (!body.contactId || !body.contactId.trim()) {
    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
  }
  if (!body.title || !body.title.trim()) {
    return { ok: false, code: "empty_title", error: "title is required" };
  }
  return { ok: true };
}

interface GhlTask {
  id: string;
  title: string;
  dueDate?: string;
  completed?: boolean;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<SetterTaskBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateTaskBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const tenantId = body.tenantId!.trim();
  const contactId = body.contactId!.trim();
  const title = body.title!.trim();

  // GHL requires a dueDate on task creation. The client sends one (end of the
  // chosen day, local to the setter); default to 24h out as a safety net so a
  // task never fails to save on a missing field.
  const dueDate =
    typeof body.dueDate === "string" && body.dueDate.trim()
      ? body.dueDate.trim()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);

    // GHL 422s without `completed` on create.
    const created = await ghlJson<{ task?: GhlTask }>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}/tasks`,
      {
        method: "POST",
        body: JSON.stringify({ title, dueDate, completed: false }),
      },
    );

    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "setter.task", tenantId, {
        contactId,
        title,
      });
    }

    return Response.json({ task: created.task ?? null });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
