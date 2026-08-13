import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminRole, type AdminRole } from "./adminRoles";

// Super-admin ("control tower") identity helpers. An admin session carries a
// signed adminId (see session.ts); these resolve it to a live account and record
// what the admin does. All cross-tenant admin routes go through getActiveAdmin
// in the middleware before any handler runs.

export interface AdminRecord {
  id: string;
  email: string;
  name: string;
  status: "active" | "disabled";
  // 0047. Rows written before roles existed read as owners (the column default),
  // so an older account never loses access to its own console.
  role: AdminRole;
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
    .select("id, email, name, status, role")
    .eq("id", adminId)
    .maybeSingle();
  const row = data as (Omit<AdminRecord, "role"> & { role?: unknown }) | null;
  if (!row || row.status !== "active") return null;
  // An unrecognized role in the database is treated as the most restricted one,
  // never as an owner: a bad value must not hand out cross-tenant authority.
  return { ...row, role: isAdminRole(row.role) ? row.role : "cold_caller" };
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
  // Lets this client past the blocking social-connect gate (0094).
  social_gate_waived: boolean;
  // Drops the calendar step from that same gate (0101). True for every client
  // that predates the step, so requiring one is always a deliberate act.
  calendar_gate_waived: boolean;
}

const TENANT_COLUMNS =
  "id, slug, name, niche, brand_color, brand_initials, app_name, won_label, value_label, ghl_location_id, subdomain, meta_ad_account_id, google_place_id, ga4_property_id, website_url, owner_password_hash, monthly_spend, created_at, health_status, health_note, social_gate_waived, calendar_gate_waived";

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

// Append a row to admin_audit_log. Still best-effort in the sense that it never
// throws and never breaks the action it records, but it no longer fails SILENTLY:
// it returns whether the row landed, and reports why when it did not.
//
// Two ways this used to disappear, both real:
//
//  1. supabase-js `.insert()` does NOT throw on a database error. It RESOLVES
//     with `{ error }`. The old `try/catch` therefore caught almost nothing, and
//     every rejected insert was swallowed with no trace at all.
//  2. Nothing was logged and nothing was returned, so a caller could report a
//     successful, irreversible action that has no audit row.
//
// That matters most for `setter.send`, where this log is the ONLY record that a
// message went out to a client's customer under that client's name. A concrete
// exploit of the old behaviour: Postgres jsonb rejects a NUL byte inside a
// string, so a setter wanting an untracked message needed only to include one.
// The message went out, the insert failed, the failure vanished, and the
// operator was shown a success.
//
// Callers performing an irreversible action SHOULD surface a false return rather
// than discard it, so the operator learns the action was not recorded.
export async function logAdminAction(
  client: SupabaseClient,
  adminId: string,
  action: string,
  targetTenantId: string | null,
  payload?: unknown,
): Promise<boolean> {
  try {
    const { error } = await client.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_tenant_id: targetTenantId,
      payload: payload ?? null,
    });
    if (error) {
      console.error(
        `[audit] FAILED to record "${action}" for tenant ${targetTenantId ?? "none"}: ${error.message}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    // A transport-level throw (network, aborted worker). Same contract: report
    // it, never rethrow into the caller's success path.
    console.error(
      `[audit] FAILED to record "${action}" for tenant ${targetTenantId ?? "none"}: ${String(e)}`,
    );
    return false;
  }
}
