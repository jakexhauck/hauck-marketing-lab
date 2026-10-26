import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPassword } from "./password";
import { loadEnabledCapabilities, sanitizeGrants, type GrantInput } from "./permissions";
import type { StaffRole } from "./staff";

// Creating a login for a client's team member, cross-tenant and without GHL
// user provisioning. Lived in api/admin/clients/[tenantId]/staff/index.ts until
// the Grok Software connector needed the same insert; one copy.
//
// The caller validates name, email and password; this owns what must hold
// against the database: one email per client, grants bounded by what the
// client has turned on, and no half-made login when the grants fail.

export interface StaffLoginInput {
  name: string;
  /** Normalized by the caller. */
  email: string;
  role: StaffRole;
  /** Plaintext, at least 8 characters; hashed here and never stored as given. */
  password: string;
  permissions?: GrantInput[];
}

export type StaffLoginResult = { ok: true; id: string } | { ok: false; error: string; status: number };

export async function createStaffLogin(
  client: SupabaseClient,
  tenantId: string,
  input: StaffLoginInput,
): Promise<StaffLoginResult> {
  const { data: existing } = await client
    .from("staff_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", input.email)
    .maybeSingle();
  if (existing) return { ok: false, error: "a staff member with that email already exists", status: 409 };

  const enabled = await loadEnabledCapabilities(client, tenantId);
  const permRows = sanitizeGrants(input.permissions, enabled);
  const password_hash = await hashPassword(input.password);

  const { data: inserted, error } = await client
    .from("staff_accounts")
    .insert({
      tenant_id: tenantId,
      ghl_user_id: null,
      email: input.email,
      name: input.name,
      role: input.role,
      password_hash,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? "could not create staff", status: 500 };

  const id = (inserted as { id: string }).id;
  if (permRows.length) {
    const { error: permErr } = await client
      .from("staff_permissions")
      .insert(permRows.map((r) => ({ staff_account_id: id, ...r })));
    if (permErr) {
      await client.from("staff_accounts").delete().eq("id", id);
      return { ok: false, error: permErr.message, status: 500 };
    }
  }
  return { ok: true, id };
}
