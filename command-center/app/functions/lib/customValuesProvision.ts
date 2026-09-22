import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlFetch, type GhlContext } from "./ghl";
import { buildProvisionPlan, type GhlCustomValue } from "../../src/lib/onboarding";

// Writing a client's mapped answers into their GoHighLevel sub-account as
// custom values.
//
// Lifted out of the Provision endpoint so linking a sub-account can do it too:
// the two must not drift, or a client linked on Client setup would end up with
// different values from one provisioned by hand afterwards.

export interface CustomValuesResult {
  ok: boolean;
  written: string[];
  failed: { name: string; status: number }[];
  notFound: string[];
  // Set when the token could not even list the location's custom values, which
  // means nothing was attempted rather than something half-written.
  preflight?: { error: string; status: number };
}

export async function writeCustomValues(
  client: SupabaseClient,
  tenantId: string,
  gctx: GhlContext,
  adminId: string | null,
): Promise<CustomValuesResult> {
  const { data: ob } = await client
    .from("onboarding")
    .select("fields")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Preflight: cheap authed call. Stop and write nothing on failure.
  const probe = await ghlFetch(
    gctx,
    `/locations/${encodeURIComponent(gctx.locationId)}/customValues`,
  );
  if (!probe.ok) {
    return {
      ok: false,
      written: [],
      failed: [],
      notFound: [],
      preflight: { error: "Token invalid or missing scope.", status: probe.status },
    };
  }
  const cvData = (await probe.json()) as { customValues?: GhlCustomValue[] };
  const customValues = cvData.customValues ?? [];

  const fields = (ob?.fields ?? {}) as Record<string, string>;
  const plan = buildProvisionPlan(fields, customValues, gctx.token);

  const written: string[] = [];
  const failed: { name: string; status: number }[] = [];
  for (const w of plan.writes) {
    const res = await ghlFetch(
      gctx,
      `/locations/${encodeURIComponent(gctx.locationId)}/customValues/${encodeURIComponent(w.id)}`,
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
      {
        tenant_id: tenantId,
        task_key: "provision-values",
        done: true,
        done_at: at,
        done_by: adminId,
      },
      { onConflict: "tenant_id,task_key" },
    );
  }

  return { ok: failed.length === 0, written, failed, notFound: plan.notFound };
}
