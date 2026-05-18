import type { Env, ApiData } from "../lib/env";
import { verifyBearer } from "../lib/jwt";
import { getTenantForUser } from "../lib/tenant";

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
    "access-control-allow-headers": "authorization,content-type,x-tenant-slug",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const PUBLIC_PATHS = new Set(["/api/health", "/api/webhook"]);

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
    const auth = await verifyBearer(ctx.request, ctx.env);
    if (!auth) return json(401, { error: "unauthorized" }, origin);

    const tenant = await getTenantForUser(auth.userId, ctx.env);
    if (!tenant) return json(403, { error: "no tenant" }, origin);

    ctx.data.userId = auth.userId;
    ctx.data.email = auth.email;
    ctx.data.tenant = tenant;
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
