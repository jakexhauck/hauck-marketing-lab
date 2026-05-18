import type { Env } from "./env";
import { admin } from "./supabase-admin";

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  niche: string;
  ghl_location_id: string;
  ghl_token: string;
  brand_color: string;
  brand_initials: string;
  app_name: string;
  won_label: string;
  value_label: string;
  monthly_spend: number;
  role: "owner" | "manager" | "rep";
}

interface CacheEntry {
  data: TenantRow;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function getTenantForUser(
  userId: string,
  env: Env,
): Promise<TenantRow | null> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const { data, error } = await admin(env)
    .from("tenant_users")
    .select(
      `role,
       tenants:tenant_id (
         id, slug, name, niche, ghl_location_id, ghl_token,
         brand_color, brand_initials, app_name, won_label, value_label,
         monthly_spend
       )`,
    )
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.tenants) return null;
  const tRaw = data.tenants as unknown;
  const t = (Array.isArray(tRaw) ? tRaw[0] : tRaw) as Record<string, unknown>;
  if (!t) return null;
  const row: TenantRow = {
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    niche: t.niche as string,
    ghl_location_id: t.ghl_location_id as string,
    ghl_token: t.ghl_token as string,
    brand_color: t.brand_color as string,
    brand_initials: t.brand_initials as string,
    app_name: t.app_name as string,
    won_label: t.won_label as string,
    value_label: t.value_label as string,
    monthly_spend: Number(t.monthly_spend) || 0,
    role: data.role as TenantRow["role"],
  };
  cache.set(userId, { data: row, expiresAt: Date.now() + TTL_MS });
  return row;
}
