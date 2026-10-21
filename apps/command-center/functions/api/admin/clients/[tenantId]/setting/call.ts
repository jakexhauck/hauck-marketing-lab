import type { Env, ApiData } from "../../../../../lib/env";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { startAppCall } from "../../../../../lib/appCall";
import { settingTenant } from "../../../../../lib/settingTenant";

// POST /api/admin/clients/:tenantId/setting/call  body { contactId }
//   -> { ok: true } | { ok: false, error }
//
// Rings Jake, then bridges the lead from the client's number (lib/appCall.ts).

const ID = /^[A-Za-z0-9]{8,64}$/;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const tenantId = ctx.params.tenantId as string;
  const raw = (await ctx.request.json().catch(() => null)) as { contactId?: unknown } | null;
  const contactId = typeof raw?.contactId === "string" ? raw.contactId.trim() : "";
  if (!ID.test(contactId)) return Response.json({ ok: false, error: "No contact on this lead." }, { status: 400 });

  const t = await settingTenant(ctx.env, tenantId);
  if (t instanceof Response) return t;

  const res = await startAppCall(t.gctx, contactId);
  if (!res.ok) return Response.json({ ok: false, error: res.message }, { status: 502 });
  await logAdminAction(t.client, ctx.data.admin!.id, "client.setting_call", tenantId, { contactId });
  return Response.json({ ok: true });
};
