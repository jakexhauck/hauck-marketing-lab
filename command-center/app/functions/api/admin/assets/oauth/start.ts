import type { Env, ApiData } from "../../../../lib/env";
import { DRIVE_SCOPE } from "../../../../lib/driveDirect";

// GET /api/admin/assets/oauth/start
// Begin connecting the ONE agency Google account. Admin-only (gated in
// _middleware.ts). Redirects to Google's consent screen requesting offline
// access so we get a long-lived refresh token. A random `state` is stashed in a
// short-lived cookie and checked on the callback (CSRF guard).
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Google OAuth is not configured (set GOOGLE_OAUTH_CLIENT_ID)." }, { status: 503 });
  }

  const url = new URL(ctx.request.url);
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT || `${url.origin}/api/admin/assets/oauth/callback`;
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
      "set-cookie": `assets_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/assets/oauth; Max-Age=600`,
    },
  });
};
