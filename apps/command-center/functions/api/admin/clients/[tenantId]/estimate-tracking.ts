import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import { parseSelfDialBody } from "../../../../lib/selfDial";

// GET /api/admin/clients/:tenantId/estimate-tracking  -> { on }
// PUT /api/admin/clients/:tenantId/estimate-tracking  body { on }  -> { on }
//
// The new Ads Dashboard (tenants.estimate_tracking, 0153): leads, pickups,
// Home Estimate bookings and jobs. Off keeps the older dashboard. Read fresh on
// every tracker load, so the client sees the change on their next refresh.
// Owner only: setters can reach /api/admin/clients/*.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { data, error } = await client
    .from("tenants")
    .select("estimate_tracking")
    .eq("id", ctx.params.tenantId as string)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "client not found" }, { status: 404 });
  return Response.json({ on: data.estimate_tracking === true });
};

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "owner only" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  // Same strict boolean rule as the self-dial switch.
  const parsed = parseSelfDialBody(raw);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const { error } = await client.from("tenants").update({ estimate_tracking: parsed.on }).eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.estimate_tracking", tenantId, { on: parsed.on });
  return Response.json({ on: parsed.on });
};
