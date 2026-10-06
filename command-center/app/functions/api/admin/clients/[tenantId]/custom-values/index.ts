import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { appMinter, resolveTenantGhl } from "../../../../../lib/ghlCreds";
import { ghlFetch } from "../../../../../lib/ghl";
import { fetchGhlNumber } from "../../../../../lib/ghlPhone";
import { buildSheet } from "../../../../../../src/lib/customValuesSheet";
import { ONBOARDING_FIELDS, type GhlCustomValue } from "../../../../../../src/lib/onboarding";

// GET   /api/admin/clients/:tenantId/custom-values   the Custom Values sheet
// PATCH /api/admin/clients/:tenantId/custom-values   body { key, value }: save one app value
//
// The sheet lays the app's values beside what GHL holds (src/lib/customValuesSheet.ts).
// GHL is read live on every GET; a client whose sub-account is not linked gets
// the app's values only. Push is ./push.ts.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  // Setters may read /api/admin/clients/* for their picker; this is not that.
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "Client not found" }, { status: 404 });

  const { data: ob, error } = await client
    .from("onboarding")
    .select("fields")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const fields = ((ob?.fields ?? {}) as Record<string, string>);

  const creds = await resolveTenantGhl(tenant, appMinter(client, ctx.env));
  let live: GhlCustomValue[] = [];
  let ghlNumber: string | null = null;
  let linked = false;
  if (creds) {
    const res = await ghlFetch(creds, `/locations/${encodeURIComponent(creds.locationId)}/customValues`);
    if (res.ok) {
      linked = true;
      live = ((await res.json()) as { customValues?: GhlCustomValue[] }).customValues ?? [];
      ghlNumber = await fetchGhlNumber(creds);
    }
  }

  return Response.json({ sheet: buildSheet({ fields, live, ghlNumber, linked }), linked });
};

const EDITABLE = new Set(ONBOARDING_FIELDS.filter((f) => f.customValue).map((f) => f.key));

export const onRequestPatch: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let body: { key?: unknown; value?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key : "";
  if (!EDITABLE.has(key)) return Response.json({ error: "Unknown field" }, { status: 400 });
  const value = typeof body.value === "string" ? body.value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 2000) : "";

  const { data: ob, error } = await client
    .from("onboarding")
    .select("fields")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const fields = { ...((ob?.fields ?? {}) as Record<string, string>), [key]: value };
  const { error: upErr } = await client
    .from("onboarding")
    .upsert({ tenant_id: tenantId, fields, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  return Response.json({ ok: true });
};
