import type { Env } from "../../lib/env";
import {
  verifySession,
  mintAdminSessionCookie,
  clearSessionCookie,
} from "../../lib/session";
import { getServiceClient } from "../../lib/supabase";
import { getActiveAdmin } from "../../lib/adminAuth";

// POST /api/auth/exit-preview  (public path: verifies its own session)
// Leave a preview-as-client session and restore the admin session. The preview
// token embeds the admin who started it, so we re-mint their admin cookie with
// no second login. Public so the middleware's read-only-preview gate does not
// block this POST; the handler does its own verification.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  // Only a live preview session can exit a preview. Anything else: clear the
  // cookie so the client falls back to the login screen rather than getting stuck.
  if (!session || !session.preview || !session.adminId) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json", "set-cookie": clearSessionCookie() },
    });
  }

  const client = getServiceClient(ctx.env);
  const admin = client ? await getActiveAdmin(client, session.adminId) : null;
  if (!admin) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json", "set-cookie": clearSessionCookie() },
    });
  }

  const cookie = await mintAdminSessionCookie(ctx.env, admin.id);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
};
