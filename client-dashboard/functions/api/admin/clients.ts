import type { Env, ApiData } from "../../lib/env";
import { admin } from "../../lib/supabase-admin";

export interface AdminClient {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brandColor: string;
  brandInitials: string;
  appName: string;
  ghlLocationId: string;
  monthlySpend: number;
  memberCount: number;
  createdAt: string;
}

interface TenantRowRaw {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brand_color: string;
  brand_initials: string;
  app_name: string;
  ghl_location_id: string;
  monthly_spend: number | string | null;
  created_at: string;
}

interface MembershipCountRow {
  tenant_id: string;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const db = admin(ctx.env);

  const { data: tenants, error: tErr } = await db
    .from("tenants")
    .select(
      "id, slug, name, niche, brand_color, brand_initials, app_name, ghl_location_id, monthly_spend, created_at",
    )
    .order("created_at", { ascending: true });

  if (tErr) {
    return Response.json({ error: tErr.message }, { status: 500 });
  }

  const { data: memberships, error: mErr } = await db
    .from("tenant_users")
    .select("tenant_id");

  if (mErr) {
    return Response.json({ error: mErr.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const m of (memberships ?? []) as MembershipCountRow[]) {
    counts.set(m.tenant_id, (counts.get(m.tenant_id) ?? 0) + 1);
  }

  const clients: AdminClient[] = ((tenants ?? []) as TenantRowRaw[]).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    niche: t.niche,
    brandColor: t.brand_color,
    brandInitials: t.brand_initials,
    appName: t.app_name,
    ghlLocationId: t.ghl_location_id,
    monthlySpend: Number(t.monthly_spend) || 0,
    memberCount: counts.get(t.id) ?? 0,
    createdAt: t.created_at,
  }));

  return Response.json({ clients, total: clients.length });
};
