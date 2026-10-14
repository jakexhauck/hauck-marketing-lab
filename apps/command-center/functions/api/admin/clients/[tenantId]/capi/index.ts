import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { appMinter, resolveTenantGhl } from "../../../../../lib/ghlCreds";
import { ghlFetch, type GhlContext } from "../../../../../lib/ghl";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { CAPI_CUSTOM_VALUES, cleanDatasetId, cleanToken, maskToken } from "../../../../../lib/capiValues";
import type { GhlCustomValue } from "../../../../../../src/lib/onboarding";

// GET /api/admin/clients/:tenantId/capi            dataset id + masked token
// GET /api/admin/clients/:tenantId/capi?reveal=1   the full token (audit-logged)
// PUT /api/admin/clients/:tenantId/capi            body { datasetId?, accessToken? }
//
// Owner only, checked here on purpose: setters may read /api/admin/clients/*
// for their client picker, and this holds a live Meta token.
//
// A save also writes both values into the client's GHL custom values (Facebook
// Dataset ID / Facebook Access Token) when the sub-account is linked, so the
// CAPI workflows read them from there instead of from pasted text.

export interface CapiView {
  datasetId: string;
  token: string;
  hasToken: boolean;
  updatedAt: string | null;
}

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (!admin || admin.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const reveal = new URL(ctx.request.url).searchParams.get("reveal") === "1";

  const { data, error } = await client
    .from("client_capi")
    .select("dataset_id, access_token, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const row = data as { dataset_id?: string; access_token?: string; updated_at?: string } | null;

  const token = row?.access_token ?? "";
  if (reveal && token) await logAdminAction(client, admin.id, "capi.reveal", tenantId);

  const view: CapiView = {
    datasetId: row?.dataset_id ?? "",
    token: reveal ? token : maskToken(token),
    hasToken: !!token,
    updatedAt: row?.updated_at ?? null,
  };
  return Response.json(view);
};

async function pushToGhl(gctx: GhlContext, values: { datasetId: string; accessToken: string }) {
  const list = await ghlFetch(gctx, `/locations/${encodeURIComponent(gctx.locationId)}/customValues`);
  if (!list.ok) return { pushed: false, missing: [] as string[] };
  const existing = ((await list.json()) as { customValues?: GhlCustomValue[] }).customValues ?? [];
  const byName = new Map(existing.map((cv) => [cv.name.trim().toLowerCase(), cv]));
  const missing: string[] = [];
  let ok = true;
  const pairs = [
    [values.datasetId, CAPI_CUSTOM_VALUES.datasetId],
    [values.accessToken, CAPI_CUSTOM_VALUES.accessToken],
  ] as const;
  for (const [value, name] of pairs) {
    if (!value) continue; // never blank out GHL
    const cv = byName.get(name.toLowerCase());
    if (!cv) {
      missing.push(name);
      continue;
    }
    const res = await ghlFetch(
      gctx,
      `/locations/${encodeURIComponent(gctx.locationId)}/customValues/${encodeURIComponent(cv.id)}`,
      { method: "PUT", body: JSON.stringify({ name: cv.name, value }) },
    );
    if (!res.ok) ok = false;
  }
  return { pushed: ok, missing };
}

export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (!admin || admin.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let body: { datasetId?: unknown; accessToken?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const { data: current, error: readErr } = await client
    .from("client_capi")
    .select("dataset_id, access_token")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
  const cur = current as { dataset_id?: string; access_token?: string } | null;
  const next = { datasetId: cur?.dataset_id ?? "", accessToken: cur?.access_token ?? "" };

  if (body.datasetId !== undefined) {
    const v = cleanDatasetId(body.datasetId);
    if (v === null) return Response.json({ error: "Dataset ID is digits only" }, { status: 400 });
    next.datasetId = v;
  }
  if (body.accessToken !== undefined) {
    const v = cleanToken(body.accessToken);
    if (v === null) return Response.json({ error: "That does not look like an access token" }, { status: 400 });
    next.accessToken = v;
  }

  const { error } = await client.from("client_capi").upsert(
    {
      tenant_id: tenantId,
      dataset_id: next.datasetId,
      access_token: next.accessToken,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    },
    { onConflict: "tenant_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logAdminAction(client, admin.id, "capi.save", tenantId, {
    datasetId: next.datasetId,
    tokenChanged: body.accessToken !== undefined,
  });

  let ghl: { pushed: boolean; missing: string[] } | null = null;
  const tenant = await loadTenantById(client, tenantId);
  const creds = tenant ? await resolveTenantGhl(tenant, appMinter(client, ctx.env)) : null;
  if (creds) ghl = await pushToGhl(creds, next);

  return Response.json({ ok: true, ghl });
};
