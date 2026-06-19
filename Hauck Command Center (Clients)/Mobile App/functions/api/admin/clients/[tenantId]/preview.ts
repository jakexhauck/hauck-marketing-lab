import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import { mintPreviewSessionCookie } from "../../../../lib/session";

// POST /api/admin/clients/:tenantId/preview  (admin-only, gated in _middleware.ts)
// Start a read-only "preview as this client" session. Swaps the caller's admin
// cookie for a signed preview cookie that carries BOTH the previewing admin and
// the previewed tenant. The middleware then serves that token as a read-only
// owner of the client and refuses any write. Exit via POST /api/auth/exit-preview,
// which reads the embedded adminId and restores the admin session, no re-login.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const adminId = ctx.data.admin!.id;
  const cookie = await mintPreviewSessionCookie(ctx.env, adminId, tenantId);

  await logAdminAction(client, adminId, "client.preview", tenantId, {});

  return new Response(JSON.stringify({ ok: true, tenantId }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
};
