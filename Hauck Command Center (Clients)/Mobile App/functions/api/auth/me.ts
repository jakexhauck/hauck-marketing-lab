import type { Env } from "../../lib/env";
import { liveTenantSlug, testTenantSlug } from "../../lib/env";
import { verifySession } from "../../lib/session";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveCaller } from "../../lib/identity";
import { getActiveAdmin } from "../../lib/adminAuth";

// GET /api/auth/me  (public path: does its own session verification)
// Returns the caller's session mode plus their identity and effective
// permissions, so the frontend can gate nav and edit controls. Owner sessions
// report isOwner=true with no permission map (full access). A staff session
// naming a deleted/disabled account reports ok=false so the client logs out.
// A super-admin session (0008) reports isAdmin=true with the admin identity.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session) return Response.json({ ok: false }, { status: 401 });

  const client = getServiceClient(ctx.env);

  // Super-admin session: identity is global, not tenant-scoped. If the account
  // was disabled/deleted, the still-valid token is rejected so the UI logs out.
  if (session.adminId) {
    const admin = client ? await getActiveAdmin(client, session.adminId) : null;
    if (!admin) return Response.json({ ok: false }, { status: 401 });
    return Response.json({
      ok: true,
      mode: session.mode,
      isOwner: false,
      isAdmin: true,
      admin: { id: admin.id, name: admin.name, email: admin.email },
      staff: null,
      permissions: {},
    });
  }

  const slug =
    session.mode === "test" ? testTenantSlug(ctx.env) : liveTenantSlug(ctx.env);
  const tenantId = client ? await resolveTenantId(client, slug) : null;
  const caller = await resolveCaller(client, tenantId, session);

  if (caller.revoked) return Response.json({ ok: false }, { status: 401 });

  return Response.json({
    ok: true,
    mode: session.mode,
    isOwner: caller.isOwner,
    isAdmin: false,
    admin: null,
    staff: caller.staff
      ? {
          id: caller.staff.id,
          name: caller.staff.name,
          email: caller.staff.email,
          role: caller.staff.role,
        }
      : null,
    permissions: caller.permissions,
  });
};
