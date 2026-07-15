import type { Env, ApiData } from "../lib/env";
import { liveTenantSlug, testTenantSlug } from "../lib/env";
import { verifySession } from "../lib/session";
import { getServiceClient, resolveTenantId } from "../lib/supabase";
import {
  clientLabelFromHost,
  loadLiveTenantForHost,
  loadTenantById,
  tenantHasGhlCreds,
} from "../lib/tenantResolve";
import { resolveCaller } from "../lib/identity";
import { checkStaffAccess } from "../lib/permissions";
import { getActiveAdmin } from "../lib/adminAuth";

const allowedOrigins = new Set([
  "http://localhost:5173", // vite dev server
  "http://localhost:8788", // wrangler pages dev
  "https://app.hauckmarketing.com", // Command Center (clients + admin), one URL
  "https://hauck-command-center.pages.dev", // Pages default domain after rename
]);

function corsHeaders(origin: string | null): HeadersInit {
  // Same-origin requests send no Origin header and need no CORS headers.
  // Unrecognized origins get none either, so credentialed responses are never
  // shared with arbitrary sites.
  if (!origin || !allowedOrigins.has(origin)) return { vary: "origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-identity",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/health/supabase",
  "/api/webhook",
  "/api/internal-notify",
  "/api/auth/login",
  "/api/auth/staff-login",
  "/api/auth/admin-login",
  "/api/auth/logout",
  "/api/auth/me",
  // Verifies its own (preview) session; public so the read-only-preview gate
  // does not block this POST and an admin can always exit a preview.
  "/api/auth/exit-preview",
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
    const session = await verifySession(ctx.request, ctx.env);
    if (!session) return json(401, { error: "unauthorized" }, origin);

    // Preview-as-client (Plan 05): an admin impersonating a client's view,
    // read-only. Any state-changing method is refused here, before a handler can
    // run, so a preview can never write. The session then flows through the live
    // tenant path below (its tenantId is set) and lands as a read-only owner of
    // that client. Admin routes are off-limits while previewing.
    if (session.preview && ctx.request.method !== "GET") {
      return json(403, { error: "preview is read-only" }, origin);
    }

    // Cross-tenant admin routes (0008). These operate ABOVE the per-tenant pin:
    // no GHL/tenant context is set up, and only a signed admin session reaches
    // them. A non-admin session (owner or staff) is forbidden outright; this is
    // the single gate for every /api/admin/* handler.
    if (url.pathname.startsWith("/api/admin/")) {
      // A preview session carries an adminId too, but it is a read-only client
      // impersonation, not admin authority: keep it out of the admin surface.
      if (!session.adminId || session.preview) {
        return json(403, { error: "forbidden" }, origin);
      }
      const client = getServiceClient(ctx.env);
      const admin = client ? await getActiveAdmin(client, session.adminId) : null;
      if (!admin) return json(401, { error: "unauthorized" }, origin);
      ctx.data.session = session;
      ctx.data.admin = admin;
      // Fall through to ctx.next(): no tenant resolution, no surface checks.
      return await runNext(ctx, origin, url);
    }

    if (session.mode === "test") {
      if (!ctx.env.TEST_GHL_LOCATION_ID || !ctx.env.TEST_GHL_TOKEN) {
        return json(500, { error: "test GHL env vars not configured" }, origin);
      }
      ctx.data.tenant = {
        ghl_location_id: ctx.env.TEST_GHL_LOCATION_ID,
        ghl_token: ctx.env.TEST_GHL_TOKEN,
        meta_ad_account_id: ctx.env.META_AD_ACCOUNT_ID,
        google_place_id: ctx.env.GOOGLE_PLACE_ID,
        ga4_property_id: ctx.env.GA4_PROPERTY_ID,
        website_pages: [],
        slug: testTenantSlug(ctx.env),
        mode: "test",
      };
    } else {
      // Resolve the live client from the SESSION (account-based): the logged-in
      // account decides which client they see, so one URL serves everyone. Legacy
      // sessions that predate account scoping carry no tenantId and fall back to
      // the request host / TENANT_SLUG env tenant. Per-client GHL creds come from
      // the tenant row (set in the admin view); the GHL_* env vars stay the
      // fallback until a client is fully wired, so single-tenant deploys work.
      const host = ctx.request.headers.get("host");
      const svc = getServiceClient(ctx.env);
      let tenant = null;
      if (session.tenantId && svc) {
        tenant = await loadTenantById(svc, session.tenantId);
        // The session names a client that no longer exists: reject (log out).
        if (!tenant) return json(401, { error: "unauthorized" }, origin);
      } else {
        tenant = svc ? await loadLiveTenantForHost(svc, ctx.env, host) : null;
        // A subdomain that matches no client is a real misconfiguration: refuse
        // rather than silently serving the fallback client's data on it.
        if (!tenant && clientLabelFromHost(host)) {
          return json(404, { error: "client not configured" }, origin);
        }
      }

      const useTenantCreds = tenant ? tenantHasGhlCreds(tenant) : false;
      const ghlLocationId = useTenantCreds
        ? tenant!.ghl_location_id
        : ctx.env.GHL_LOCATION_ID;
      const ghlToken = useTenantCreds ? tenant!.ghl_token : ctx.env.GHL_TOKEN;
      if (!ghlLocationId || !ghlToken) {
        return json(500, { error: "GHL credentials not configured" }, origin);
      }
      ctx.data.tenant = {
        ghl_location_id: ghlLocationId,
        ghl_token: ghlToken,
        // Per-client ad account, env var as the single-tenant fallback. Unlike
        // GHL creds there is no placeholder scheme: a real act_ id or nothing.
        meta_ad_account_id: tenant?.meta_ad_account_id || ctx.env.META_AD_ACCOUNT_ID,
        // Per-client Google place, env var as the single-tenant fallback.
        google_place_id: tenant?.google_place_id || ctx.env.GOOGLE_PLACE_ID,
        // Per-client GA4 property, env var as the single-tenant fallback.
        ga4_property_id: tenant?.ga4_property_id || ctx.env.GA4_PROPERTY_ID,
        // Per-client Website > Pages list (0028). No env fallback: an unwired
        // client simply has an empty list until the admin enters its pages.
        website_pages: tenant?.website_pages ?? [],
        slug: tenant?.slug ?? liveTenantSlug(ctx.env),
        mode: "live",
      };
    }

    // Resolve the caller (owner vs staff) and enforce per-surface permissions.
    // Owner (shared-password) sessions carry no staffId and skip Supabase
    // entirely: full access, no extra round-trip. Staff sessions are resolved
    // to their effective grants and gated centrally here, so every existing
    // route is covered without per-route edits.
    if (session.staffId) {
      const client = getServiceClient(ctx.env);
      // The session's tenantId is authoritative (account-based). Fall back to a
      // slug lookup only for legacy sessions that carry no tenantId.
      const tenantId =
        session.tenantId ??
        (client ? await resolveTenantId(client, ctx.data.tenant.slug) : null);
      const caller = await resolveCaller(client, tenantId, session);
      if (caller.revoked) return json(401, { error: "unauthorized" }, origin);

      ctx.data.session = session;
      ctx.data.isOwner = caller.isOwner;
      ctx.data.staff = caller.staff;
      ctx.data.permissions = caller.permissions;

      if (!caller.isOwner) {
        const decision = checkStaffAccess(
          url.pathname,
          ctx.request.method,
          caller.permissions,
        );
        if (!decision.allowed) {
          return json(403, { error: "forbidden", capability: decision.missing }, origin);
        }
      }
    } else {
      ctx.data.session = session;
      ctx.data.isOwner = true;
      ctx.data.staff = null;
      ctx.data.permissions = {};
    }
  }

  return await runNext(ctx, origin, url);
};

// Run the matched route handler and re-apply CORS headers to its response,
// converting an uncaught error into a generic 500. Shared by the admin and the
// tenant paths so both wrap responses identically.
async function runNext(
  ctx: Parameters<PagesFunction<Env, string, ApiData>>[0],
  origin: string | null,
  url: URL,
): Promise<Response> {
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
    // Log the full upstream detail server-side, but never reflect it to the
    // client: GHL error bodies can contain internal URLs and request detail.
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api]", url.pathname, message);
    return json(500, { error: "internal_error" }, origin);
  }
}
