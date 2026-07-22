import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// GET /api/admin/assets/oauth/callback?code=...&state=...
// Google redirects here after the agency account consents. Verify the CSRF
// state cookie, exchange the code for tokens (incl. the long-lived refresh
// token), look up which account connected, and persist it in drive_connection.
// On success bounce back to the SOPs tab.
//
// This used to land on /admin/assets, which no longer exists as a route: the
// admin was restructured into pillar tabs and the Assets page went with it. So
// a successful consent dropped the admin on a dead URL and looked like a
// failure. The SOP Hub is the surface that needs this connection, and it shows
// the result immediately, so it is the honest place to return to.
const LANDING = "/admin/pillar/operations?tab=sops";
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return assetsRedirect(url.origin, `google_${error}`);
  if (!code) return assetsRedirect(url.origin, "missing_code");

  const cookieState = readCookie(ctx.request, "assets_oauth_state");
  if (!state || !cookieState || state !== cookieState) return assetsRedirect(url.origin, "bad_state");

  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = ctx.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return assetsRedirect(url.origin, "not_configured");
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT || `${url.origin}/api/admin/assets/oauth/callback`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const tokenText = await tokenResp.text();
  if (!tokenResp.ok) return assetsRedirect(url.origin, "token_exchange_failed");
  const tokens = JSON.parse(tokenText) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokens.refresh_token) return assetsRedirect(url.origin, "no_refresh_token");

  // Identify which Google account this is (works with the drive scope alone).
  let connectedEmail: string | null = null;
  if (tokens.access_token) {
    try {
      const aboutResp = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (aboutResp.ok) connectedEmail = ((await aboutResp.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
    } catch {
      /* email is cosmetic */
    }
  }

  const supabase = getServiceClient(ctx.env);
  if (!supabase) return assetsRedirect(url.origin, "no_db");

  const expiresAt = tokens.access_token ? new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString() : null;
  const { error: upsertErr } = await supabase.from("drive_connection").upsert(
    {
      id: true,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      access_token_expires_at: expiresAt,
      connected_email: connectedEmail,
      scope: tokens.scope ?? null,
      connected_by: ctx.data.admin?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upsertErr) return assetsRedirect(url.origin, "save_failed");

  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.origin}${LANDING}&connected=1`,
      "set-cookie": "assets_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/assets/oauth; Max-Age=0",
    },
  });
};

function assetsRedirect(origin: string, reason: string): Response {
  return Response.redirect(`${origin}${LANDING}&connect_error=${encodeURIComponent(reason)}`, 302);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
