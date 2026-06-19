import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { ghlFetch, type GhlContext } from "./ghl";

export type StaffRole = "owner" | "manager" | "rep";
export type StaffStatus = "active" | "disabled";

export interface StaffRecord {
  id: string;
  tenant_id: string;
  ghl_user_id: string | null;
  email: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  created_at: string;
  updated_at: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Fetch a staff account by id, scoped to the tenant. Used by the middleware to
// resolve the signed session's staffId into a live, active account.
export async function getStaffById(
  client: SupabaseClient,
  tenantId: string,
  staffId: string,
): Promise<StaffRecord | null> {
  const { data } = await client
    .from("staff_accounts")
    .select("id, tenant_id, ghl_user_id, email, name, role, status, created_at, updated_at")
    .eq("id", staffId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as StaffRecord | null) ?? null;
}

export interface GhlLocationUser {
  id: string;
  name: string;
  email: string;
}

// List the GHL users already on a sub-account, so the admin can pre-populate a
// new client's team from the people GoHighLevel already knows. Best-effort:
// needs a token with the users.readonly scope; returns [] on any failure (a
// plain location token may not carry it) so onboarding never blocks on it.
export async function listGhlLocationUsers(
  ghl: GhlContext,
): Promise<GhlLocationUser[]> {
  try {
    const res = await ghlFetch(ghl, `/users/?locationId=${encodeURIComponent(ghl.locationId)}`, {
      method: "GET",
    });
    if (!res.ok) {
      console.warn("[staff] GHL users list failed", res.status, (await res.text()).slice(0, 300));
      return [];
    }
    const data = (await res.json()) as { users?: unknown };
    const rows = Array.isArray(data.users) ? data.users : [];
    const out: GhlLocationUser[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const id = typeof r.id === "string" ? r.id : "";
      const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
      if (!id || !email) continue;
      const first = typeof r.firstName === "string" ? r.firstName : "";
      const last = typeof r.lastName === "string" ? r.lastName : "";
      const name = `${first} ${last}`.trim() || (typeof r.name === "string" ? r.name : email);
      out.push({ id, name, email });
    }
    return out;
  } catch (err) {
    console.warn("[staff] GHL users list threw", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface GhlUserCreateInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

// Best-effort GHL user provisioning. Creating a GHL user needs a token with the
// users.write scope and the agency companyId, which a plain location token does
// not carry. So this only attempts when GHL_COMPANY_ID is configured, gives the
// new user a non-admin "user" role scoped to this one location, and returns null
// (rather than throwing) on any failure so staff creation still succeeds. When
// it returns null the staff account is created without a ghl_user_id; the owner
// can link one later once provisioning is enabled.
export async function tryCreateGhlUser(
  ghl: GhlContext,
  env: Env,
  input: GhlUserCreateInput,
): Promise<{ id: string } | null> {
  const companyId = env.GHL_COMPANY_ID;
  if (!companyId) return null;

  const [firstName, ...rest] = input.name.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName || "Staff";

  const body = {
    companyId,
    firstName: firstName || "Staff",
    lastName,
    email: input.email,
    password: input.password,
    phone: input.phone ?? "",
    type: "account",
    role: "user",
    locationIds: [ghl.locationId],
    // Minimal GHL-side permissions. Our app layer is the real gate; this only
    // governs what they'd see if they logged into GHL directly, so keep it tight.
    permissions: {
      contactsEnabled: true,
      conversationsEnabled: true,
      opportunitiesEnabled: true,
      appointmentsEnabled: true,
    },
  };

  try {
    const res = await ghlFetch(ghl, "/users/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("[staff] GHL user create failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { id?: string; user?: { id?: string } };
    const id = data.id ?? data.user?.id;
    return id ? { id } : null;
  } catch (err) {
    console.warn("[staff] GHL user create threw", err instanceof Error ? err.message : err);
    return null;
  }
}
