import type { Env } from "../../../lib/env";
import { verifySession } from "../../../lib/session";
import { getServiceClient } from "../../../lib/supabase";

// GET /api/drive/oauth/callback?code=...&state=...
// Google redirects here after the agency account consents. We verify the CSRF
// state cookie, exchange the code for tokens (incl. the long-lived refresh
// token), look up which account connected, and persist it in drive_connection.
// On success we bounce back to /assets so the hub is immediately live.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const session = await verifySession(ctx.request, ctx.env);
  if (!session?.adminId) return Response.redirect(`${new URL(ctx.request.url).origin}/login`, 302);

  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return assetsRedirect(url.origin, `google_${error}`);
  if (!code) return assetsRedirect(url.origin, "missing_code");

  const cookieState = readCookie(ctx.request, "drive_oauth_state");
  if (!state || !cookieState || state !== cookieState) {
    return assetsRedirect(url.origin, "bad_state");
  }

  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = ctx.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return assetsRedirect(url.origin, "not_configured");

  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT || `${url.origin}/api/drive/oauth/callback`;

  // Exchange the authorization code for tokens.
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
  const tokens = JSON.parse(tokenText) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tokens.refresh_token) {
    // No refresh token means Google reused a prior grant. Revoke + retry would
    // be needed; surface it so the operator re-consents from a clean state.
    return assetsRedirect(url.origin, "no_refresh_token");
  }

  // Identify which Google account this is (works with the drive scope alone).
  let connectedEmail: string | null = null;
  if (tokens.access_token) {
    try {
      const aboutResp = await fetch(
        "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
      );
      if (aboutResp.ok) {
        const about = (await aboutResp.json()) as { user?: { emailAddress?: string } };
        connectedEmail = about.user?.emailAddress ?? null;
      }
    } catch {
      /* email is cosmetic; ignore failures */
    }
  }

  const supabase = getServiceClient(ctx.env);
  if (!supabase) return assetsRedirect(url.origin, "no_db");

  const expiresAt = tokens.access_token
    ? new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
    : null;

  const { error: upsertErr } = await supabase.from("drive_connection").upsert(
    {
      id: true,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      access_token_expires_at: expiresAt,
      connected_email: connectedEmail,
      scope: tokens.scope ?? null,
      connected_by: session.adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upsertErr) return assetsRedirect(url.origin, "save_failed");

  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.origin}/assets?connected=1`,
      // expire the state cookie
      "set-cookie": "drive_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/drive/oauth; Max-Age=0",
    },
  });
};

function assetsRedirect(origin: string, reason: string): Response {
  return Response.redirect(`${origin}/assets?connect_error=${encodeURIComponent(reason)}`, 302);
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
