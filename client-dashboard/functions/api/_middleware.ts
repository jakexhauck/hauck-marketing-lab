import type { Env, ApiData } from "../lib/env";
import { verifySession } from "../lib/session";

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:8788",
  "https://dash.hauckmarketing.com",
  "https://hauck-dashboard.pages.dev",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin && allowedOrigins.has(origin)
      ? origin
      : "https://hauck-dashboard.pages.dev";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/webhook",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
]);

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export const onRequest: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const origin = ctx.request.headers.get("origin");
  const url = new URL(ctx.request.url);

  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (!PUBLIC_PATHS.has(url.pathname)) {
    const ok = await verifySession(ctx.request, ctx.env);
    if (!ok) return json(401, { error: "unauthorized" }, origin);

    if (!ctx.env.GHL_LOCATION_ID || !ctx.env.GHL_TOKEN) {
      return json(500, { error: "GHL env vars not configured" }, origin);
    }
    ctx.data.tenant = {
      ghl_location_id: ctx.env.GHL_LOCATION_ID,
      ghl_token: ctx.env.GHL_TOKEN,
    };
  }

  try {
    const response = await ctx.next();
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      headers.set(key, value as string);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api]", url.pathname, message);
    return json(500, { error: message }, origin);
  }
};
