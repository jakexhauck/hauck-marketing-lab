import type { SupabaseClient } from "@supabase/supabase-js";

// Super-admin ("control tower") identity helpers. An admin session carries a
// signed adminId (see session.ts); these resolve it to a live account and record
// what the admin does. All cross-tenant admin routes go through getActiveAdmin
// in the middleware before any handler runs.

export interface AdminRecord {
  id: string;
  email: string;
  name: string;
  status: "active" | "disabled";
}

// Resolve a signed adminId to an ACTIVE admin account, or null. A disabled or
// deleted admin returns null so the middleware rejects the session: revoking an
// admin is immediate, even with a still-valid signed token.
export async function getActiveAdmin(
  client: SupabaseClient,
  adminId: string,
): Promise<AdminRecord | null> {
  if (!adminId) return null;
  const { data } = await client
    .from("admin_accounts")
    .select("id, email, name, status")
    .eq("id", adminId)
    .maybeSingle();
  const admin = data as AdminRecord | null;
  return admin && admin.status === "active" ? admin : null;
}

// A tenant row as the admin tower needs it. Never selects ghl_token: the admin
// UI never needs the secret, so it never leaves the database.
export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brand_color: string;
  brand_initials: string;
  app_name: string;
  won_label: string;
  value_label: string;
  ghl_location_id: string;
  subdomain: string | null;
  meta_ad_account_id: string | null;
  google_place_id: string | null;
  ga4_property_id: string | null;
  website_url: string | null;
  owner_password_hash: string | null;
  monthly_spend: number | null;
  created_at: string;
  health_status: "healthy" | "warn" | "paused" | null;
  health_note: string | null;
}

const TENANT_COLUMNS =
  "id, slug, name, niche, brand_color, brand_initials, app_name, won_label, value_label, ghl_location_id, subdomain, meta_ad_account_id, google_place_id, ga4_property_id, website_url, owner_password_hash, monthly_spend, created_at, health_status, health_note";

export async function getTenantById(
  client: SupabaseClient,
  tenantId: string,
): Promise<TenantRow | null> {
  const { data } = await client
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("id", tenantId)
    .maybeSingle();
  return (data as TenantRow | null) ?? null;
}

// Append a row to admin_audit_log. Best-effort: an audit write must never break
// the action it records, but it should be present for every state change.
export async function logAdminAction(
  client: SupabaseClient,
  adminId: string,
  action: string,
  targetTenantId: string | null,
  payload?: unknown,
): Promise<void> {
  try {
    await client.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_tenant_id: targetTenantId,
      payload: payload ?? null,
    });
  } catch {
    // best effort
  }
}
