import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { loadTenantById, tenantHasGhlCreds } from "../../../../lib/tenantResolve";
import { credsShapeError, verifyGhlCreds } from "../../../../lib/ghlVerify";

// GET  /api/admin/clients/:tenantId/ghl
// POST /api/admin/clients/:tenantId/ghl   { token?, locationId }
//
// Fulfillment > GHL > Connect. The two values that wire one client to their
// GoHighLevel sub-account: a Private Integration token and the location id it
// belongs to. Admin only, enforced upstream in _middleware.ts.
//
// The token never comes back out. GET answers whether one is stored, and what
// GoHighLevel says when it is used, which is a different question: a stored
// token that GHL has stopped accepting is exactly the state that reads as
// connected everywhere and works nowhere. POST proves the pair before storing
// it, so a rejected pair changes nothing.

interface GhlConnectionState {
  /** The id on the client row, or "" while it is still a placeholder. */
  locationId: string;
  /** A real token is stored. Says nothing about whether it still works. */
  tokenSet: boolean;
  /** Both values are real AND GoHighLevel answered with them just now. */
  connected: boolean;
  /** The sub-account's own name, when the token was allowed to read it. */
  locationName: string | null;
  /** Why GoHighLevel refused, when it did. */
  error: string | null;
}

const placeholder = (v: string | null | undefined) => {
  const s = (v ?? "").trim().toLowerCase();
  return s === "" || s === "pending" || s === "env";
};

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const locationId = placeholder(tenant.ghl_location_id) ? "" : tenant.ghl_location_id.trim();
  const tokenSet = !placeholder(tenant.ghl_token);

  if (!tenantHasGhlCreds(tenant)) {
    return Response.json({
      locationId,
      tokenSet,
      connected: false,
      locationName: null,
      error: null,
    } satisfies GhlConnectionState);
  }

  const check = await verifyGhlCreds(tenant.ghl_token, tenant.ghl_location_id);
  return Response.json({
    locationId,
    tokenSet,
    connected: check.ok,
    locationName: check.ok ? check.locationName : null,
    error: check.ok ? null : check.error,
  } satisfies GhlConnectionState);
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: { token?: unknown; locationId?: unknown } = {};
  try {
    body = (await ctx.request.json()) as { token?: unknown; locationId?: unknown };
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const pastedToken = typeof body.token === "string" ? body.token.trim() : "";
  const locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";

  // An empty token box on a client that already has one means "keep the token,
  // fix the location id". Anything else needs both, since a location id proven
  // with nothing is not proven.
  const token = pastedToken || (placeholder(tenant.ghl_token) ? "" : tenant.ghl_token.trim());
  if (!token) return Response.json({ error: "Paste the token first." }, { status: 400 });
  if (!locationId) return Response.json({ error: "Paste the location id first." }, { status: 400 });

  const shape = credsShapeError(token, locationId);
  if (shape) return Response.json({ error: shape }, { status: 400 });

  const check = await verifyGhlCreds(token, locationId);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const { error } = await client
    .from("tenants")
    .update({ ghl_location_id: locationId, ghl_token: token })
    .eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The value is never logged. That it changed, and who changed it, is.
  if (ctx.data.admin) {
    await logAdminAction(client, ctx.data.admin.id, "client.ghl.connect", tenantId, {
      location_id: locationId,
      token: pastedToken ? "(updated)" : "(unchanged)",
      location_name: check.locationName,
    });
  }

  return Response.json({ ok: true, locationName: check.locationName });
};
