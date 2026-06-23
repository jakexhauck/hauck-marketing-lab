import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// GET /api/admin/calendar/oauth/callback?code=...&state=...
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return calRedirect(url.origin, `google_${error}`);
  if (!code) return calRedirect(url.origin, "missing_code");

  const cookieState = readCookie(ctx.request, "cal_oauth_state");
  if (!state || !cookieState || state !== cookieState) return calRedirect(url.origin, "bad_state");

  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = ctx.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return calRedirect(url.origin, "not_configured");
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT_CALENDAR || `${url.origin}/api/admin/calendar/oauth/callback`;

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
  if (!tokenResp.ok) return calRedirect(url.origin, "token_exchange_failed");
  const tokens = JSON.parse(tokenText) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokens.refresh_token) return calRedirect(url.origin, "no_refresh_token");

  // Identify the connected account (cosmetic). The calendarList primary entry
  // carries the account's own calendar id/email.
  let connectedEmail: string | null = null;
  if (tokens.access_token) {
    try {
      const meResp = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary?fields=id",
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
      );
      if (meResp.ok) connectedEmail = ((await meResp.json()) as { id?: string }).id ?? null;
    } catch {
      /* email is cosmetic */
    }
  }

  const supabase = getServiceClient(ctx.env);
  if (!supabase) return calRedirect(url.origin, "no_db");

  const expiresAt = tokens.access_token ? new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString() : null;
  const { error: upsertErr } = await supabase.from("calendar_connection").upsert(
    {
      id: true,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      access_token_expires_at: expiresAt,
      connected_email: connectedEmail,
      scope: tokens.scope ?? null,
      google_calendar_id: "primary",
      connected_by: ctx.data.admin?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upsertErr) return calRedirect(url.origin, "save_failed");

  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.origin}/admin/calendar?connected=1`,
      "set-cookie": "cal_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/calendar/oauth; Max-Age=0",
    },
  });
};

function calRedirect(origin: string, reason: string): Response {
  return Response.redirect(`${origin}/admin/calendar?connect_error=${encodeURIComponent(reason)}`, 302);
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
