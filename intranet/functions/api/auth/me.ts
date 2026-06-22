import type { Env } from "../../lib/env";
import { verifySession } from "../../lib/session";
import { getServiceClient } from "../../lib/supabase";

// GET /api/auth/me  (public route, self-checks the session)
// Returns the signed-in admin, or 401. Used by the client to confirm a session.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.adminId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ ok: true, admin: { id: session.adminId } });

  const { data } = await client
    .from("admin_accounts")
    .select("id, email, name, status")
    .eq("id", session.adminId)
    .maybeSingle();
  const admin = data as { id: string; email: string; name: string; status: string } | null;
  if (!admin || admin.status !== "active") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true, admin: { id: admin.id, name: admin.name, email: admin.email } });
};
