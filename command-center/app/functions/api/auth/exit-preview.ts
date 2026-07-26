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
  //
  // A header-borne preview token is refused first, and separately, because it
  // must NOT clear anybody's cookie. This route trades a preview session for a
  // fresh 30-day ADMIN cookie, so it may only ever answer the HttpOnly preview
  // COOKIE, which JavaScript cannot read. The admin Software tab's frame holds
  // its token in JS, so honouring it here would let a leaked 15-minute
  // read-only token be exchanged for full cross-tenant admin authority. There
  // is nothing for that frame to exit anyway: it owns no cookie, and closing it
  // ends the preview.
  if (session?.viaPreviewHeader) {
    return new Response(JSON.stringify({ ok: false, error: "not a cookie session" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (!session || !session.preview || !session.adminId) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json", "set-cookie": clearSessionCookie(ctx.request) },
    });
  }

  const client = getServiceClient(ctx.env);
  const admin = client ? await getActiveAdmin(client, session.adminId) : null;
  if (!admin) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json", "set-cookie": clearSessionCookie(ctx.request) },
    });
  }

  const cookie = await mintAdminSessionCookie(ctx.env, admin.id, ctx.request);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
};
