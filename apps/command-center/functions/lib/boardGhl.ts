import { tenantTimezone, type Env } from "./env";
import type { GhlContext } from "./ghl";
import { agencyTimezone, getAgencyGhlContext, isAgencyGhlConfigured } from "./agencyGhl";
import { settingTenant } from "./settingTenant";
import { clockZone } from "./tz";

// Which GoHighLevel the pipeline board's endpoints (api/admin/cold-sms/*) work
// on. The agency's, as Cold SMS, Sales and Onboarding always have; or, with
// ?tenant=<id>, one client's own sub-account (Client > Setting, Jake
// 2026-10-27: "make it look like the cold sms pipeline ... it'll just be for
// clients"). Same board, panel, menu and follow-ups; the client's leads, texted
// from the client's number.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BoardGhl {
  ghl: GhlContext;
  /** The client, or null for the agency's own boards. */
  tenantId: string | null;
  zone: string;
}

/**
 * The board's GHL for this request. Null when that GHL is not connected (the
 * agency's env, or a client not linked yet), so each endpoint keeps its own
 * not-connected answer; a Response for a bad or unknown client.
 */
export async function boardGhl(env: Env, request: Request): Promise<BoardGhl | Response | null> {
  const tenant = new URL(request.url).searchParams.get("tenant");
  if (tenant === null) {
    if (!isAgencyGhlConfigured(env)) return null;
    return { ghl: getAgencyGhlContext(env), tenantId: null, zone: agencyTimezone(env) };
  }
  if (!UUID.test(tenant)) return Response.json({ error: "bad_tenant" }, { status: 400 });
  const t = await settingTenant(env, tenant);
  if (t instanceof Response) return t.status === 503 ? null : t;
  const { data } = await t.client.from("tenants").select("meta_timezone").eq("id", tenant).maybeSingle();
  const zone = clockZone((data as { meta_timezone?: string | null } | null)?.meta_timezone ?? null, tenantTimezone(env));
  return { ghl: t.gctx, tenantId: tenant, zone };
}
