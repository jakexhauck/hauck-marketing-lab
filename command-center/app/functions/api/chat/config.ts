import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = ctx.env.SUPABASE_URL ?? "";
  const anonKey = ctx.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    return Response.json({ error: "realtime_not_configured" }, { status: 503 });
  }
  // Staff carry tenant_id directly; otherwise resolve from the request slug.
  let tenantId: string | null = ctx.data.staff?.tenant_id ?? null;
  if (!tenantId && !ctx.data.admin) {
    const client = getServiceClient(ctx.env);
    if (client) tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  }
  return Response.json({ url, anonKey, tenantId });
};
