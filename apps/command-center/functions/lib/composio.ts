import type { Env } from "./env";

// Thin transport over Composio's v3 REST API.
//
// Deliberately no SDK: @composio/core is untested on the Cloudflare Workers
// runtime, and everything we need is a handful of JSON endpoints. This file is
// transport only and knows nothing about calendars; the calendar semantics live
// in googleCalendar.ts, so swapping Composio for direct Google OAuth later
// touches one file.
const BASE = "https://backend.composio.dev/api/v3";

export interface ComposioAccount {
  id: string;
  status: string;
}

// Both values are agency-wide, not per-tenant: one Composio project key and one
// auth config that acts as the shared blueprint for the Google Calendar
// toolkit. Per-client isolation comes from passing the tenant id as user_id.
export function composioConfigured(env: Env): boolean {
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
    throw new Error(
      `composio ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// A tool call that fails still arrives as HTTP 200 with successful: false, so
// the envelope has to be inspected rather than the status code.
function unwrap<T>(body: { data: T; error: unknown; successful: boolean }, what: string): T {
  if (!body.successful) {
    throw new Error(`composio ${what} failed: ${JSON.stringify(body.error)}`);
  }
  return body.data;
}

// The proxy endpoint answers in a DIFFERENT shape and this is easy to get
// wrong, because getting it wrong is silent:
//   /tools/execute/<slug>  ->  { data, error, successful }
//   /tools/execute/proxy   ->  { data, status, headers }   no `successful`
// Demanding `successful` here therefore rejects every call that worked. The
// upstream HTTP status is the only signal the proxy gives us.
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
  // POST /connected_accounts (singular) returns 400 for Composio-managed OAuth2
  // for all orgs as of 2026-07-03. /link is the supported path.
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
  return {
    redirectUrl: body.redirect_url,
    connectedAccountId: body.connected_account_id,
  };
}

export async function listConnectedAccounts(
  env: Env,
  userId: string,
): Promise<ComposioAccount[]> {
  // Query params are plural arrays, not singular. Filtering by auth config as
  // well as user keeps a future second Google toolkit from matching here.
  const qs = new URLSearchParams({
    user_ids: userId,
    auth_config_ids: env.COMPOSIO_GCAL_AUTH_CONFIG_ID ?? "",
  });
  const body = await call<{ items?: ComposioAccount[] }>(env, `/connected_accounts?${qs}`);
  return body.items ?? [];
}

export async function deleteConnectedAccount(env: Env, accountId: string): Promise<void> {
  // revoke_on_delete also drops the upstream Google grant, which is what a
  // client pressing Unlink expects. Without it the app forgets the connection
  // but Google still lists us as authorized.
  await call(env, `/connected_accounts/${encodeURIComponent(accountId)}?revoke_on_delete=true`, {
    method: "DELETE",
  });
}

export async function executeTool<T>(
  env: Env,
  slug: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<T> {
  const body = await call<{ data: T; error: unknown; successful: boolean }>(
    env,
    `/tools/execute/${encodeURIComponent(slug)}`,
    { method: "POST", body: JSON.stringify({ user_id: userId, arguments: args }) },
  );
  return unwrap(body, `tool ${slug}`);
}

export async function proxyCall<T>(
  env: Env,
  opts: { connectedAccountId: string; endpoint: string; method: string; body?: unknown },
): Promise<T> {
  // Passes through to the provider API using Composio's managed token. Needed
  // for fields no Composio tool exposes, notably extendedProperties, which is
  // how a mirrored event is found again on reschedule.
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
