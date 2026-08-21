import type { Env, ApiData } from "../lib/env";
import { liveTenantSlug, testTenantSlug } from "../lib/env";
import { verifySession } from "../lib/session";
import { getServiceClient, resolveTenantId } from "../lib/supabase";
import {
  clientLabelFromHost,
  loadLiveTenantForHost,
  loadTenantById,
  resolveGhlCreds,
} from "../lib/tenantResolve";
import { resolveCaller } from "../lib/identity";
import { checkStaffAccess } from "../lib/permissions";
import { AdminLookupError, getActiveAdmin } from "../lib/adminAuth";
import { canAdminAccess } from "../lib/adminRoles";
import { HEALTH_CRON_HEADER, isHealthCronRequest } from "../lib/healthCron";
import { ADS_CRON_HEADER, isAdsCronRequest } from "../lib/adsCron";
import { CALENDAR_CRON_HEADER, isCalendarCronRequest } from "../lib/calendarCron";
import { COLD_CALL_CRON_HEADER, isColdCallCronRequest } from "../lib/coldCallCron";
import { funnelOrigin } from "../lib/funnelUrl";

const allowedOrigins = new Set([
  "http://localhost:5173", // vite dev server
  "http://localhost:8788", // wrangler pages dev
  "https://app.hauckmarketing.com", // Command Center (clients + admin), one URL
  "https://hauck-command-center.pages.dev", // Pages default domain after rename
]);

// The published intake form's origin, derived from the one link that is
// configured (lib/funnelUrl.ts). Only the public /api/intake endpoints are
// reachable cross-origin in practice; every other path demands a session cookie
// the form does not have.
function originAllowed(origin: string, env: Env): boolean {
  return allowedOrigins.has(origin) || origin === funnelOrigin(env);
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  // Same-origin requests send no Origin header and need no CORS headers.
  // Unrecognized origins get none either, so credentialed responses are never
  // shared with arbitrary sites.
  if (!origin || !originAllowed(origin, env)) return { vary: "origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    // x-preview-token: the admin Software tab's frame authenticates with a
    // short-lived preview token in this header rather than the shared cookie,
    // so framing the client app never disturbs the admin's own session.
    "access-control-allow-headers": "content-type,x-identity,x-preview-token",
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
  // The client intake funnel. Filled in before the client has any account at
  // all, so it cannot carry a session. Its own guards are in lib/intake.ts:
  // unknown keys dropped, answers size-capped, creates rate limited, and
  // nothing it writes becomes a tenant until an admin approves it.
  "/api/intake",
  // A funnel reporting its own conversion to Meta. Called by sendBeacon from a
  // landing page on the CLIENT's domain, so it can carry no session of ours.
  // Guarded by a funnel allowlist and a per-funnel Origin check instead, and it
  // can only ever write a Lead. See lib/metaCapi.ts.
  "/api/capi/lead",
  // The GoHighLevel Marketplace app's two inbound endpoints. Neither can carry
  // a session of ours: the first is a redirect target GHL sends the installing
  // admin's browser to, the second is called by GHL's servers.
  //
  // Named /api/crm/* rather than /api/ghl/*: a white-label marketplace listing
  // rejects any URL containing a HighLevel reference, and "ghl" in the path is
  // one. Each has its own guard, see the files themselves.
  "/api/crm/oauth/callback",
  "/api/crm/app-webhook",
  // The feed behind a client's Google Sheet lead tracker, read by the Apps
  // Script bound to that sheet. Google's servers make the call, so it can carry
  // no session of ours. Guarded by its own shared secret (SHEETS_SYNC_TOKEN),
  // read-only, and it names its tenant explicitly. See api/sheets/leads.ts.
  "/api/sheets/leads",
  // The sales coach's two doors (0110), neither of which can carry a session.
  //
  // /api/coach/ingest receives Google Meet's live captions, read off the page
  // by the Chrome extension and posted as plain text. Guarded by a shared token
  // in the URL. Fails closed: no token configured, no requests accepted.
  //
  // /api/coach/live is read by the Chrome overlay INSIDE the Google Meet
  // window, which runs on meet.google.com. Its own shared secret
  // (COACH_OVERLAY_TOKEN), read-only, and it can reach exactly one thing: the
  // cards for whichever call is live right now.
  "/api/coach/ingest",
  "/api/coach/live",
]);

// The overlay's origin. Deliberately NOT in allowedOrigins above, because that
// set is credentialed: adding meet.google.com there would let anything running
// on a Google Meet page make cookie-bearing calls to every admin route in this
// app. It gets its own headers instead, on its own path, with no credentials,
// so the only thing it can ever read is what its token buys.
const OVERLAY_ORIGIN = "https://meet.google.com";

const OVERLAY_PATHS = new Set(["/api/coach/live", "/api/coach/ingest"]);

function overlayCors(origin: string | null, pathname: string): HeadersInit | null {
  if (origin !== OVERLAY_ORIGIN) return null;
  if (!OVERLAY_PATHS.has(pathname)) return null;
  return {
    "access-control-allow-origin": OVERLAY_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

// Public paths with a dynamic segment, matched by prefix. Kept separate from the
// exact-match set so no path can be made public by accident.
const PUBLIC_PREFIXES = ["/api/intake/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function json(status: number, body: unknown, origin: string | null, env: Env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin, env),
    },
  });
}

export const onRequest: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const origin = ctx.request.headers.get("origin");
  const url = new URL(ctx.request.url);

  if (ctx.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: overlayCors(origin, url.pathname) ?? corsHeaders(origin, ctx.env),
    });
  }

  // The scheduled health probe, and only that. See lib/healthCron.ts for why
  // this gate is written as one exact-match pure function. It runs before the
  // session gate but grants strictly less: no ctx.data.admin is set, so the
  // caller is not an admin and no other route becomes reachable. A wrong or
  // absent secret simply falls through and gets the usual 401.
  if (
    isHealthCronRequest(
      ctx.request.method,
      url.pathname,
      ctx.request.headers.get(HEALTH_CRON_HEADER),
      ctx.env.HEALTH_CRON_SECRET,
    )
  ) {
    return await runNext(ctx, origin, url);
  }

  // The scheduled Meta spend sync, and only that. Sibling of the gate above and
  // written to be read beside it; see lib/adsCron.ts for the two deliberate
  // differences (POST, and the handler writes). Same rules otherwise: one exact
  // path, its own secret, no ctx.data.admin, and a miss falls through to 401.
  if (
    isAdsCronRequest(
      ctx.request.method,
      url.pathname,
      ctx.request.headers.get(ADS_CRON_HEADER),
      ctx.env.ADS_CRON_SECRET,
    )
  ) {
    return await runNext(ctx, origin, url);
  }

  // The scheduled Google Calendar sync, and only that. Third sibling of the two
  // gates above, same rules: one exact path, its own secret, no ctx.data.admin,
  // and a miss falls through to 401. See lib/calendarCron.ts for what the
  // handler behind it is allowed to write.
  if (
    isCalendarCronRequest(
      ctx.request.method,
      url.pathname,
      ctx.request.headers.get(CALENDAR_CRON_HEADER),
      ctx.env.CALENDAR_CRON_SECRET,
    )
  ) {
    return await runNext(ctx, origin, url);
  }

  // The scheduled power dialer sync, and only that. Fourth sibling of the three
  // gates above, same rules: one exact path, its own secret, no ctx.data.admin,
  // and a miss falls through to 401.
  //
  // It exists because recording a call used to be a side effect of somebody
  // having a page open, which stopped being true the moment a tab went to the
  // background. See lib/coldCallCron.ts for what the handler behind it writes.
  if (
    isColdCallCronRequest(
      ctx.request.method,
      url.pathname,
      ctx.request.headers.get(COLD_CALL_CRON_HEADER),
      ctx.env.COLD_CALL_CRON_SECRET,
    )
  ) {
    return await runNext(ctx, origin, url);
  }

  if (!isPublicPath(url.pathname)) {
    const session = await verifySession(ctx.request, ctx.env);
    if (!session) return json(401, { error: "unauthorized" }, origin, ctx.env);

    // Preview-as-client (Plan 05): an admin impersonating a client's view,
    // read-only. Any state-changing method is refused here, before a handler can
    // run, so a preview can never write. The session then flows through the live
    // tenant path below (its tenantId is set) and lands as a read-only owner of
    // that client. Admin routes are off-limits while previewing.
    if (session.preview && ctx.request.method !== "GET") {
      return json(403, { error: "preview is read-only" }, origin, ctx.env);
    }

    // Cross-tenant admin routes (0008). These operate ABOVE the per-tenant pin:
    // no GHL/tenant context is set up, and only a signed admin session reaches
    // them. A non-admin session (owner or staff) is forbidden outright; this is
    // the single gate for every /api/admin/* handler.
    if (url.pathname.startsWith("/api/admin/")) {
      // A preview session carries an adminId too, but it is a read-only client
      // impersonation, not admin authority: keep it out of the admin surface.
      if (!session.adminId || session.preview) {
        return json(403, { error: "forbidden" }, origin, ctx.env);
      }
      const client = getServiceClient(ctx.env);
      // 401 here means "your session is dead": the browser tears the session
      // down, wipes its caches and returns to /login. So it is reserved for the
      // one thing that actually is a dead session, an admin row that says
      // disabled or is not there. A lookup that COULD NOT RUN answers 503,
      // which the client retries and which leaves the session standing.
      //
      // This used to be one 401 for both, and the power dialer is where that
      // showed: it polls this gate every eight seconds all day, so it met every
      // database hiccup the app ever had and turned each one into a sign-out.
      let admin: Awaited<ReturnType<typeof getActiveAdmin>> = null;
      try {
        if (!client) throw new AdminLookupError("supabase not configured");
        admin = await getActiveAdmin(client, session.adminId);
      } catch (err) {
        if (!(err instanceof AdminLookupError)) throw err;
        console.error("[api] admin lookup failed", url.pathname, err.message);
        return json(503, { error: "auth_unavailable" }, origin, ctx.env);
      }
      if (!admin) return json(401, { error: "unauthorized" }, origin, ctx.env);
      // Role gate (0047). Owners pass everything. A hired role reaches only the
      // paths its role names, so a new admin route is invisible to them until
      // it is added to the allowlist in lib/adminRoles.
      if (!canAdminAccess(url.pathname, ctx.request.method, admin.role)) {
        return json(403, { error: "forbidden" }, origin, ctx.env);
      }
      ctx.data.session = session;
      ctx.data.admin = admin;
      // Fall through to ctx.next(): no tenant resolution, no surface checks.
      return await runNext(ctx, origin, url);
    }

    if (session.mode === "test") {
      if (!ctx.env.TEST_GHL_LOCATION_ID || !ctx.env.TEST_GHL_TOKEN) {
        return json(500, { error: "test GHL env vars not configured" }, origin, ctx.env);
      }
      ctx.data.tenant = {
        ghl_location_id: ctx.env.TEST_GHL_LOCATION_ID,
        ghl_token: ctx.env.TEST_GHL_TOKEN,
        meta_ad_account_id: ctx.env.META_AD_ACCOUNT_ID,
        google_place_id: ctx.env.GOOGLE_PLACE_ID,
        ga4_property_id: ctx.env.GA4_PROPERTY_ID,
        website_pages: [],
        // No tenant row in test mode, so only the env fallback applies. The
        // source='NOTIFICATION' signal still protects the test account.
        internal_recipients: ctx.env.INTERNAL_RECIPIENTS,
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
        if (!tenant) return json(401, { error: "unauthorized" }, origin, ctx.env);
      } else {
        tenant = svc ? await loadLiveTenantForHost(svc, ctx.env, host) : null;
        // A subdomain that matches no client is a real misconfiguration: refuse
        // rather than silently serving the fallback client's data on it.
        if (!tenant && clientLabelFromHost(host)) {
          return json(404, { error: "client not configured" }, origin, ctx.env);
        }
      }

      // There used to be an onboarding gate here: a client whose tenant row
      // said onboarding_status='setup' got a 423 on every tenant surface until
      // an admin pressed Go Live. It is gone (Jake, 2026-08-15). Nothing about
      // a client's readiness is a flag somebody has to remember to flip: the
      // only thing that actually decides whether their app works is whether
      // their GoHighLevel sub-account is wired, which the next check reads
      // straight off the tenant row. onboarding_status survives as an
      // admin-side marker of what Jake still has to do, and blocks nobody.

      // The client's own sub-account, or none. This had its own copy of the
      // tenant-vs-env ladder; it now asks the one helper, so the client path
      // and the admin path cannot answer this differently.
      //
      // No env fallback any more, here or there. The GHL_* env vars hold a real
      // client's credentials, so falling back to them served one client another
      // client's leads, conversations and revenue under their own name. A
      // client that is not wired up yet gets a 503 its pages read as "not
      // connected", which is the truth and is recoverable; the alternative was
      // plausible, wrong, and silent.
      const creds = tenant ? resolveGhlCreds(tenant) : null;
      if (!creds) {
        return json(503, { error: "crm not connected" }, origin, ctx.env);
      }
      ctx.data.tenant = {
        ghl_location_id: creds.locationId,
        ghl_token: creds.token,
        // The same rule for every other per-client integration: this client's
        // own, or nothing. Each of these fell back to an env var too, which is
        // how a half-wired client came to show another client's ad spend,
        // another client's reviews and another client's analytics.
        meta_ad_account_id: tenant?.meta_ad_account_id ?? undefined,
        google_place_id: tenant?.google_place_id ?? undefined,
        ga4_property_id: tenant?.ga4_property_id ?? undefined,
        // Per-client Website > Pages list (0028). No env fallback: an unwired
        // client simply has an empty list until the admin enters its pages.
        website_pages: tenant?.website_pages ?? [],
        // Per-client internal notification recipients (0043). No env fallback
        // either: one client's staff numbers are not another's, and inheriting
        // them hides the wrong messages from the wrong inbox. Undefined leaves
        // the source='NOTIFICATION' signal as the only guard, which still hides
        // GHL's auto-created sinks.
        internal_recipients: tenant?.internal_recipients ?? undefined,
        // Per-client hand-off pipeline override (0097). Undefined is the norm:
        // the pipeline resolves by name for a client who calls theirs "Sales".
        client_inbox_pipeline_id: tenant?.client_inbox_pipeline_id ?? undefined,
        // Does this client type their own lead status (0102)? Defaults to false,
        // which is the derived behaviour every client had before this existed.
        manual_lead_status: tenant?.manual_lead_status === true,
        // Per-client Inbox widening (0103). Undefined for every client who has
        // not asked for one, which is the pre-existing behaviour.
        inbox_visible_tag: tenant?.inbox_visible_tag ?? undefined,
        // Per-client Inbox widening by ad attribution (0104).
        inbox_show_ad_leads: tenant?.inbox_show_ad_leads === true,
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
      if (caller.revoked) return json(401, { error: "unauthorized" }, origin, ctx.env);

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
          return json(403, { error: "forbidden", capability: decision.missing }, origin, ctx.env);
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
    // The Meet overlay's own uncredentialed headers take the place of the
    // normal ones on its one path; everything else gets the usual set.
    const cors = overlayCors(origin, url.pathname) ?? corsHeaders(origin, ctx.env);
    for (const [key, value] of Object.entries(cors)) {
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
    return json(500, { error: "internal_error" }, origin, ctx.env);
  }
}
