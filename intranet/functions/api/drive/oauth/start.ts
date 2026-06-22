import type { Env } from "../../../lib/env";
import { verifySession } from "../../../lib/session";
import { DRIVE_SCOPE } from "../../../lib/drive";

// GET /api/drive/oauth/start
// Begin connecting the ONE agency Google account. Admin-only (the _middleware
// already requires a session). Redirects to Google's consent screen requesting
// offline access so we get a long-lived refresh token. A random `state` is
// stashed in a short-lived cookie and checked on the callback (CSRF guard).
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.adminId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Google OAuth is not configured (set GOOGLE_OAUTH_CLIENT_ID)." }, { status: 503 });
  }

  const url = new URL(ctx.request.url);
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT || `${url.origin}/api/drive/oauth/callback`;
  const state = crypto.randomUUID();

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", DRIVE_SCOPE);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent"); // force a fresh refresh_token
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: auth.toString(),
      "set-cookie": `drive_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/drive/oauth; Max-Age=600`,
    },
  });
};
