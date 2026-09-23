import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import { parseSelfDialBody, selfDialPatch } from "../../../../lib/selfDial";

// GET /api/admin/clients/:tenantId/self-dial  -> { on }
// PUT /api/admin/clients/:tenantId/self-dial  body { on }  -> { on }
//
// Does this client ring their own leads? See lib/selfDial.ts for the two
// columns it moves. Admin-only via the /api/admin/* gate in _middleware.ts.
//
// The tenant row is read fresh on every request, so the client's Leads page and
// Inbox follow the switch on their next load with no cache to bust.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("tenants")
    .select("manual_lead_status")
    .eq("id", ctx.params.tenantId as string)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "client not found" }, { status: 404 });

  return Response.json({ on: data.manual_lead_status === true });
};

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
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
  const parsed = parseSelfDialBody(raw);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const { error } = await client.from("tenants").update(selfDialPatch(parsed.on)).eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.self_dial", tenantId, { on: parsed.on });
  return Response.json({ on: parsed.on });
};
