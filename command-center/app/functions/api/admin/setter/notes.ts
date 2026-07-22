import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// GET/POST /api/admin/setter/notes (admin-only, gated in _middleware.ts).
// Contact notes on the live CRM record, readable and writable from every
// cockpit stage. Like setter/task.ts this MUST resolve the tenant's
// credentials through getGhlContextForTenant (never the session's own GHL
// creds) so the note lands on the right contact in the right CRM.
//
// The client app has functions/api/contacts/[contactId]/notes.ts, but it
// reads ctx.data.tenant, which admin requests never have.

export interface GhlNote {
  id: string;
  body: string;
  dateAdded?: string;
}

export interface SetterNoteBody {
  tenantId?: string;
  contactId?: string;
  body?: string;
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

// Pure, split out so it is unit-testable without a request.
export function validateNoteBody(body: SetterNoteBody): ValidationResult {
  if (!body.tenantId || !body.tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
  }
  if (!body.contactId || !body.contactId.trim()) {
    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
  }
  if (!body.body || !body.body.trim()) {
    return { ok: false, code: "empty_note", error: "note body is required" };
  }
  return { ok: true };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenantId");
  const contactId = url.searchParams.get("contactId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const data = await ghlJson<{ notes?: GhlNote[] }>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}/notes`,
    );
    // Newest first, same ordering rule as the client-app notes route.
    const notes = (data.notes ?? []).sort(
      (a, b) => +new Date(b.dateAdded ?? 0) - +new Date(a.dateAdded ?? 0),
    );
    return Response.json({ notes });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const input = await readJsonBody<SetterNoteBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateNoteBody(input);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const tenantId = input.tenantId!.trim();
  const contactId = input.contactId!.trim();
  const body = input.body!.trim();

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const created = await ghlJson<{ note?: GhlNote }>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}/notes`,
      { method: "POST", body: JSON.stringify({ body }) },
    );

    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "setter.note", tenantId, { contactId });
    }

    return Response.json({ note: created.note ?? null });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
