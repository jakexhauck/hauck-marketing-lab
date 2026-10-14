import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionData } from "./session";
import { getStaffById, type StaffRecord } from "./staff";
import { loadEffectivePermissions, type EffectivePermissions } from "./permissions";

export interface ResolvedCaller {
  // True for the shared-password owner session (no staffId) OR a staff account
  // whose role is 'owner'. Owners bypass per-surface permission checks.
  isOwner: boolean;
  staff: StaffRecord | null;
  permissions: EffectivePermissions;
  // The signed session named a staff account that no longer exists or is
  // disabled: the session must be rejected (treat as logged out).
  revoked: boolean;
}

const OWNER: ResolvedCaller = {
  isOwner: true,
  staff: null,
  permissions: {},
  revoked: false,
};

// Turn a verified session into a caller: owner (full access) or a staff member
// with a concrete effective-permission set. Owner sessions resolve without any
// Supabase round-trip, so the app keeps working when Supabase is unconfigured.
export async function resolveCaller(
  client: SupabaseClient | null,
  tenantId: string | null,
  session: SessionData,
): Promise<ResolvedCaller> {
  if (!session.staffId) return OWNER;
  if (!client || !tenantId) {
    // A staff token was presented but we cannot validate it: fail closed.
    return { isOwner: false, staff: null, permissions: {}, revoked: true };
  }
  const staff = await getStaffById(client, tenantId, session.staffId);
  if (!staff || staff.status !== "active") {
    return { isOwner: false, staff: null, permissions: {}, revoked: true };
  }
  const permissions = await loadEffectivePermissions(client, tenantId, staff.id);
  return {
    isOwner: staff.role === "owner",
    staff,
    permissions,
    revoked: false,
  };
}
