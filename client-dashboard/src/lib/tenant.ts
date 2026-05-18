import type { Client, LeadStage, Role } from "../types";
import { supabase } from "./supabase";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brand_color: string;
  brand_initials: string;
  app_name: string;
  won_label: string;
  value_label: string;
  monthly_spend: number | string | null;
  role: Role;
}

const DEFAULT_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "estimate-sent",
  "consultation",
  "booked",
  "won",
  "lost",
  "no-show",
];

export interface TenantBundle {
  client: Client;
  role: Role;
  tenantId: string;
}

export async function loadMyTenant(): Promise<TenantBundle | null> {
  const { data, error } = await supabase.rpc("get_my_tenant");
  if (error) {
    console.error("[tenant] get_my_tenant failed:", error.message);
    return null;
  }
  const row = (data as TenantRow[] | null)?.[0];
  if (!row) return null;

  const client: Client = {
    id: row.slug,
    name: row.name,
    niche: row.niche,
    brand: {
      color: row.brand_color,
      logoUrl: null,
      initials: row.brand_initials,
      appName: row.app_name,
    },
    pipeline: {
      stages: [...DEFAULT_STAGES],
      wonLabel: row.won_label,
      valueLabel: row.value_label,
    },
    tier: "core",
    monthlySpend: Number(row.monthly_spend) || 0,
  };

  return { client, role: row.role, tenantId: row.id };
}
