import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { GRAPH } from "../../../../../lib/metaGraph";

// POST /api/admin/clients/:tenantId/capi/test
// Reads the dataset's name with the stored token. Read only: no event is sent,
// so a test never shows up as a conversion in the client's Events Manager.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("client_capi")
    .select("dataset_id, access_token")
    .eq("tenant_id", ctx.params.tenantId as string)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const row = data as { dataset_id?: string; access_token?: string } | null;
  if (!row?.dataset_id || !row.access_token) {
    return Response.json({ ok: false, error: "Save both values first" });
  }

  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(row.dataset_id)}?fields=name&access_token=${encodeURIComponent(row.access_token)}`,
  );
  const body = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
  if (!res.ok || body.error) {
    return Response.json({ ok: false, error: body.error?.message ?? `Meta answered ${res.status}` });
  }
  return Response.json({ ok: true, name: body.name ?? "" });
};
