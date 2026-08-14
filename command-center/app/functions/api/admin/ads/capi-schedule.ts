import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { resolveGhlCreds } from "../../../lib/tenantResolve";
import type { GhlContext } from "../../../lib/ghl";
import { funnelForTenantSlug, funnelKeyForTenantSlug } from "../../../lib/metaCapi";
import { resolveMetaToken } from "../../../lib/metaToken";
import { reportBookingsForTenant, SCHEDULE_LOOKBACK_DAYS } from "../../../lib/capiSchedule";

// Report booked appointments to Meta's Conversions API.
//
// POST /api/admin/ads/capi-schedule              -> every client with a funnel
// POST /api/admin/ads/capi-schedule?tenantId=X   -> just that one
// POST /api/admin/ads/capi-schedule?days=2       -> narrow the lookback
// POST /api/admin/ads/capi-schedule?test=TEST123 -> Meta's Test Events tab only
//
// Auth is enforced upstream in _middleware.ts: an admin session, or the shared
// scheduler secret (lib/adsCron.ts).
//
// WHY THIS POLLS rather than waiting to be told. GHL can push an
// AppointmentCreate webhook, and when it does the booking is reported instantly
// (see the webhook handler). Willis's workflows have never been wired: their
// activity log holds three test rows from June. Waiting for a webhook that does
// not fire would mean reporting no bookings at all, so this reads the calendars
// directly and needs no GHL-side configuration whatsoever. When those workflows
// do get built, both paths run, and the capi_sent ledger means the second one
// to arrive sends nothing.
//
// Safe to call as often as you like, for the same reason.
//
// `test` routes events to Events Manager's Test Events tab instead of the live
// stream, which is how the wiring gets proven without inventing conversions in
// a client's reporting. It is deliberately NOT written to the ledger as a real
// send... see the note in the handler.

const DEFAULT_DAYS = SCHEDULE_LOOKBACK_DAYS;

interface TenantRow {
  id: string;
  slug?: string | null;
  name?: string | null;
  ghl_token?: string | null;
  ghl_location_id?: string | null;
}

interface Result {
  tenantId: string;
  name: string;
  funnel?: string;
  found?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  // How many of the sent events carried real click signals (fbc/fbp). A booking
  // reported without them is recorded by Meta but far less likely to be
  // attributed to the ad, so this is the number worth watching.
  matched?: number;
  reason?: string;
  error?: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const token = await resolveMetaToken(ctx.env);
  if (!token) return Response.json({ error: "meta not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const onlyTenant = url.searchParams.get("tenantId");
  const days = Number(url.searchParams.get("days")) || DEFAULT_DAYS;
  const testEventCode = url.searchParams.get("test")?.trim() || undefined;

  // ghl_token / ghl_location_id are what resolveGhlCreds reads. Selected here
  // rather than re-fetched per tenant, and never read raw: a client not fully
  // wired carries a placeholder ('env'/'pending') that would 401 against GHL.
  let query = client
    .from("tenants")
    .select("id, slug, name, ghl_token, ghl_location_id");
  if (onlyTenant) query = query.eq("id", onlyTenant);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tenants = (data ?? []) as TenantRow[];
  if (tenants.length === 0) {
    return Response.json({ error: "no matching client" }, { status: 404 });
  }

  const results: Result[] = [];
  for (const tenant of tenants) {
    const name = tenant.name ?? tenant.id;

    // A client whose ads do not run through one of our funnels has no pixel to
    // report into. Skipped by name, never guessed at: writing a conversion into
    // the wrong client's pixel is not a recoverable mistake.
    const funnel = funnelForTenantSlug(tenant.slug);
    const funnelKey = funnelKeyForTenantSlug(tenant.slug);
    if (!funnel || !funnelKey) {
      results.push({ tenantId: tenant.id, name, reason: "no funnel" });
      continue;
    }

    const creds = resolveGhlCreds(tenant as never);
    if (!creds) {
      results.push({ tenantId: tenant.id, name, funnel: funnelKey, reason: "crm not connected" });
      continue;
    }
    const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };

    try {
      const r = await reportBookingsForTenant({
        client,
        token,
        funnelKey,
        funnel,
        gctx,
        tenantId: tenant.id,
        lookbackDays: days,
        testEventCode,
      });
      results.push({
        tenantId: tenant.id,
        name,
        funnel: funnelKey,
        found: r.found,
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
        matched: r.reports.filter((x) => x.ok && x.matched).length,
      });
    } catch (err) {
      // One client's broken calendar must not abort the others.
      results.push({ tenantId: tenant.id, name, funnel: funnelKey, error: String(err).slice(0, 200) });
    }
  }

  const sent = results.reduce((n, r) => n + (r.sent ?? 0), 0);
  const failed = results.reduce((n, r) => n + (r.failed ?? 0), 0);

  const admin = ctx.data.admin;
  if (admin) {
    await logAdminAction(client, admin.id, "ads.capi.schedule", onlyTenant, {
      days,
      sent,
      failed,
      test: Boolean(testEventCode),
    });
  } else {
    console.log(`[capi/schedule] scheduled run: ${sent} sent, ${failed} failed`);
  }

  return Response.json({ days, sent, failed, test: Boolean(testEventCode), results });
};
