import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// GET /api/admin/onboarding  (admin-only, gated in _middleware.ts)
// Every client with its onboarding status, for the Onboarding tab list.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, name, slug")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: ob } = await client
    .from("onboarding")
    .select("tenant_id, status, provisioned_at");
  const byId = new Map(
    ((ob ?? []) as { tenant_id: string; status: string; provisioned_at: string | null }[]).map(
      (r) => [r.tenant_id, r],
    ),
  );

  const clients = ((tenants ?? []) as { id: string; name: string; slug: string }[]).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: byId.get(t.id)?.status ?? "draft",
    provisionedAt: byId.get(t.id)?.provisioned_at ?? null,
  }));

  return Response.json({ clients });
};
