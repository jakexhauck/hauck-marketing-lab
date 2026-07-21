import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { DEFAULT_HUB, normalizeHub, validateHubBody, type HubBody } from "../../../lib/dialHub";

// GET/PATCH /api/admin/setter/dial-hub (admin-only, gated in _middleware.ts).
// One editable dialing reference per client, backing the Setter Suite's
// Dialing Hub tab. See migration 0042 and functions/lib/dialHub.ts.
//
// PATCH is a whole-document write, not a field patch: the client edits the
// structure (adds rows, deletes sections), so there is no stable field set to
// diff against. It is still PATCH rather than PUT because it upserts one
// column of an existing tenant's row.

const SELECT = "hub, updated_at";

// GET never 404s on a tenant with no saved hub: it returns the seed template
// so a client that has never been edited opens on the right rows. That means
// the client only ever has to render a valid document, and "no hub yet" is not
// a state the UI has to know about.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("setter_dial_hub")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json({ hub: DEFAULT_HUB, updatedAt: null });
  return Response.json({
    hub: normalizeHub((data as { hub: unknown }).hub),
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<HubBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateHubBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = (body.tenantId as string).trim();
  const adminId = ctx.data.admin!.id;
  // Normalize BEFORE the write, so the column can only ever hold a document
  // that already satisfies every cap and coercion. The read path normalizes
  // too, for rows written before a rule existed.
  const hub = normalizeHub(body.hub);

  const { data, error } = await client
    .from("setter_dial_hub")
    .upsert(
      { tenant_id: tenantId, hub, updated_at: new Date().toISOString(), updated_by: adminId },
      { onConflict: "tenant_id" },
    )
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save dial hub" }, { status: 500 });
  }

  await logAdminAction(client, adminId, "setter.dial_hub.update", tenantId, {
    sections: hub.sections.length,
    rows: hub.sections.reduce((n, s) => n + s.rows.length, 0),
  });

  // Read back, so the client reconciles against what actually landed (trimmed
  // strings, dropped overflow rows) rather than what it optimistically sent.
  return Response.json({
    hub: normalizeHub((data as { hub: unknown }).hub),
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};
