// Thin transport over Composio's v3 REST API.
//
// Same shape as command-center/app/functions/lib/composio.ts and for the same
// reason: @composio/core is untested on the Workers runtime, and everything
// needed here is a handful of JSON endpoints. This file knows nothing about
// calendars. The calendar semantics live in calendar.ts, so replacing Composio
// with direct Google OAuth later touches one file.

const BASE = "https://backend.composio.dev/api/v3";

export interface Env {
  COMPOSIO_API_KEY: string;
  COMPOSIO_GCAL_AUTH_CONFIG_ID: string;
  // Guards the one-time connect link, so a stranger cannot re-point her
  // calendar at their own Google account.
  ADMIN_KEY: string;
}

export interface ComposioAccount {
  id: string;
  status: string;
}

export function configured(env: Env): boolean {
  return Boolean(env.COMPOSIO_API_KEY && env.COMPOSIO_GCAL_AUTH_CONFIG_ID);
}

async function call<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // Lowercase, per the OpenAPI securityScheme.
      "x-api-key": env.COMPOSIO_API_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`composio ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// Composio answers HTTP 200 even when the call underneath failed, so the
// envelope has to be inspected rather than the status code.
//
// The two endpoints do NOT answer in the same shape, which is easy to get
// wrong and silent when you do:
//   /tools/execute/<slug>  ->  { data, error, successful }
//   /tools/execute/proxy   ->  { data, status, headers }   no `successful`
// Requiring `successful` on a proxy response therefore rejects every
// successful call. The upstream HTTP status is what matters there.
function unwrapProxy<T>(body: Record<string, unknown>, what: string): T {
  if (typeof body?.successful === "boolean" && !body.successful) {
    throw new Error(`composio ${what} failed: ${JSON.stringify(body.error)}`);
  }
  const upstream = typeof body?.status === "number" ? body.status : 200;
  if (upstream < 200 || upstream >= 300) {
    throw new Error(`composio ${what} upstream ${upstream}: ${JSON.stringify(body?.data).slice(0, 300)}`);
  }
  return body.data as T;
}

export async function linkAccount(
  env: Env,
  opts: { userId: string; callbackUrl: string },
): Promise<{ redirectUrl: string; connectedAccountId: string }> {
  // POST /connected_accounts (singular) returns 400 for Composio-managed
  // OAuth2. /link is the supported path.
  const body = await call<{ redirect_url: string; connected_account_id: string }>(
    env,
    "/connected_accounts/link",
    {
      method: "POST",
      body: JSON.stringify({
        auth_config_id: env.COMPOSIO_GCAL_AUTH_CONFIG_ID,
        user_id: opts.userId,
        callback_url: opts.callbackUrl,
      }),
    },
  );
  return { redirectUrl: body.redirect_url, connectedAccountId: body.connected_account_id };
}

export async function listConnectedAccounts(env: Env, userId: string): Promise<ComposioAccount[]> {
  // Query params are plural arrays, not singular.
  const qs = new URLSearchParams({
    user_ids: userId,
    auth_config_ids: env.COMPOSIO_GCAL_AUTH_CONFIG_ID ?? "",
  });
  const body = await call<{ items?: ComposioAccount[] }>(env, `/connected_accounts?${qs}`);
  return body.items ?? [];
}

export async function proxyCall<T>(
  env: Env,
  opts: { connectedAccountId: string; endpoint: string; method: string; body?: unknown },
): Promise<T> {
  // Passes through to Google using Composio's managed token. Needed for
  // anything no Composio tool exposes, notably attendees with sendUpdates and
  // extendedProperties.
  const body = await call<Record<string, unknown>>(env, "/tools/execute/proxy", {
    method: "POST",
    body: JSON.stringify({
      connected_account_id: opts.connectedAccountId,
      endpoint: opts.endpoint,
      method: opts.method,
      ...(opts.body === undefined ? {} : { body: opts.body }),
    }),
  });
  return unwrapProxy<T>(body, `proxy ${opts.method} ${opts.endpoint}`);
}
