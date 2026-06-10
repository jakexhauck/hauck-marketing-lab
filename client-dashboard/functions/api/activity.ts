import type { Env, ApiData } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";

export interface ActivityRow {
  id: number;
  tenant_id: string;
  action: string;
  lead_id: string | null;
  payload: {
    summary?: string;
    contact_id?: string | null;
    opportunity_id?: string | null;
    raw?: unknown;
  } | null;
  created_at: string;
}

// Recent activity_log rows for the session's tenant, newest first. Degrades to
// an empty list when Supabase is not configured so the app still renders.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ activity: [] });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ activity: [] });

  const { data } = await client
    .from("activity_log")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  return Response.json({ activity: (data as ActivityRow[] | null) ?? [] });
};
