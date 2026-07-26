import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import { mintPreviewSessionCookie } from "../../../../lib/session";
import { getStaffById } from "../../../../lib/staff";

// POST /api/admin/clients/:tenantId/preview  (admin-only, gated in _middleware.ts)
// Start a read-only "preview as this client" session. Swaps the caller's admin
// cookie for a signed preview cookie that carries the previewing admin and the
// previewed tenant, plus an OPTIONAL staffId to view as that specific person.
// With a staffId, the middleware resolves their role + per-surface permissions
// so the preview shows exactly what that staff member sees; without it, the
// owner's-eye view. The middleware refuses any write either way. Exit via POST
// /api/auth/exit-preview, which reads the embedded adminId and restores the
// admin session, no re-login.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  // Optional staffId: preview AS this person. Validate it belongs to the tenant
  // and is active, so a preview never lands on a revoked account (which the
  // middleware would reject mid-session and bounce the admin to login).
  const body = (await ctx.request.json().catch(() => null)) as { staffId?: unknown } | null;
  const staffId = typeof body?.staffId === "string" && body.staffId.trim() ? body.staffId.trim() : undefined;
  if (staffId) {
    const staff = await getStaffById(client, tenantId, staffId);
    if (!staff) return Response.json({ error: "staff not found" }, { status: 404 });
    if (staff.status !== "active") return Response.json({ error: "staff is disabled" }, { status: 409 });
  }

  const adminId = ctx.data.admin!.id;
  const cookie = await mintPreviewSessionCookie(ctx.env, adminId, tenantId, staffId, ctx.request);

  await logAdminAction(client, adminId, "client.preview", tenantId, staffId ? { staffId } : {});

  return new Response(JSON.stringify({ ok: true, tenantId, staffId: staffId ?? null }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
};
