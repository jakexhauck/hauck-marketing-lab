import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch } from "../../../../lib/ghl";
import { buildProvisionPlan, type GhlCustomValue } from "../../../../../src/lib/onboarding";

// POST /api/admin/onboarding/:tenantId/provision
// Writes the client's mapped custom values into their GHL subaccount.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("id", tenantId)
    .maybeSingle();
  const { data: ob } = await client
    .from("onboarding")
    .select("fields")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const locationId = (tenant?.ghl_location_id as string) ?? "";
  const token = (tenant?.ghl_token as string) ?? "";
  if (!locationId || !token || locationId === "pending" || token === "pending") {
    return Response.json({ error: "Set the GHL location id and token first." }, { status: 400 });
  }
  const gctx = { token, locationId };

  // Token preflight: cheap authed call. Stop and write nothing on failure.
  const probe = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}/customValues`);
  if (!probe.ok) {
    return Response.json(
      { error: "Token invalid or missing scope.", status: probe.status },
      { status: 400 },
    );
  }
  const cvData = (await probe.json()) as { customValues?: GhlCustomValue[] };
  const customValues = cvData.customValues ?? [];

  const fields = (ob?.fields ?? {}) as Record<string, string>;
  const plan = buildProvisionPlan(fields, customValues, token);

  const written: string[] = [];
  const failed: { name: string; status: number }[] = [];
  for (const w of plan.writes) {
    const res = await ghlFetch(
      gctx,
      `/locations/${encodeURIComponent(locationId)}/customValues/${encodeURIComponent(w.id)}`,
      { method: "PUT", body: JSON.stringify({ name: w.name, value: w.value }) },
    );
    if (res.ok) written.push(w.name);
    else failed.push({ name: w.name, status: res.status });
  }

  const at = new Date().toISOString();
  const result = { written, failed, notFound: plan.notFound, at };
  await client.from("onboarding").upsert(
    {
      tenant_id: tenantId,
      status: failed.length === 0 ? "provisioned" : "draft",
      provision_result: result,
      provisioned_at: failed.length === 0 ? at : null,
      updated_at: at,
    },
    { onConflict: "tenant_id" },
  );

  // Auto-tick the provision checklist item when everything wrote.
  if (failed.length === 0 && plan.notFound.length === 0) {
    await client.from("onboarding_checklist").upsert(
      { tenant_id: tenantId, task_key: "provision-values", done: true, done_at: at, done_by: ctx.data.admin?.id ?? null },
      { onConflict: "tenant_id,task_key" },
    );
  }

  return Response.json({ ok: failed.length === 0, written, failed, notFound: plan.notFound });
};
