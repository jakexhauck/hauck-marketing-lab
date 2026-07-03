import type { Env, ApiData } from "../lib/env";
import { getServiceClient } from "../lib/supabase";

// Display config for the signed-in tenant: branding plus the real monthly
// spend. Replaces the mock client objects on authenticated screens. Returns
// { tenant: null } when Supabase is unconfigured so the frontend falls back
// to APP_BRAND constants. Never returns GHL credentials.
interface TenantRow {
  name: string;
  niche: string;
  brand_color: string;
  brand_initials: string;
  app_name: string;
  won_label: string;
  value_label: string;
  monthly_spend: number | string | null;
  website_url: string | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ tenant: null });

  const { data, error } = await client
    .from("tenants")
    .select(
      "name, niche, brand_color, brand_initials, app_name, won_label, value_label, monthly_spend, website_url",
    )
    .eq("slug", ctx.data.tenant.slug)
    .maybeSingle();

  if (error || !data) return Response.json({ tenant: null });

  const row = data as TenantRow;
  // Spend drives CPA/ROAS cards. Zero or unset means "no real number": the
  // UI hides those cards rather than fabricating stats.
  const spend = Number(row.monthly_spend);
  return Response.json({
    tenant: {
      name: row.name,
      niche: row.niche,
      brandColor: row.brand_color,
      brandInitials: row.brand_initials,
      appName: row.app_name,
      wonLabel: row.won_label,
      valueLabel: row.value_label,
      monthlySpend: Number.isFinite(spend) && spend > 0 ? spend : null,
      // The client's live site, shown as a preview + open button on the Website
      // page. Trimmed; empty string reads as "no site set" (not connected).
      websiteUrl: (row.website_url ?? "").trim() || null,
    },
  });
};
