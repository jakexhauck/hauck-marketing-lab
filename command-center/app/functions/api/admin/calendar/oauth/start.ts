import type { Env, ApiData } from "../../../../lib/env";
import { CALENDAR_SCOPE } from "../../../../lib/calendarGoogle";

// GET /api/admin/calendar/oauth/start — begin connecting the agency Google
// account for calendar sync. Admin-only (gated in _middleware.ts).
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Google OAuth is not configured (set GOOGLE_OAUTH_CLIENT_ID)." }, { status: 503 });
  }

  const url = new URL(ctx.request.url);
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT_CALENDAR || `${url.origin}/api/admin/calendar/oauth/callback`;
  const state = crypto.randomUUID();

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", CALENDAR_SCOPE);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent"); // force a fresh refresh_token
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: auth.toString(),
      "set-cookie": `cal_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/calendar/oauth; Max-Age=600`,
    },
  });
};
