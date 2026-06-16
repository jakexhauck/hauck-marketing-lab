import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Capability registry (Layer 1). The single backend list of every CRM surface
// and which actions it supports. Mirrored in packages/core/src/permissions.ts
// for the frontend; the two MUST stay in sync (same convention as types.ts).
//
// As roadmap features ship (booking, reviews, automations, ...), add a row here
// and a matching tenant_entitlements seed, and the whole permission model picks
// it up automatically.
// ---------------------------------------------------------------------------

export type Capability =
  | "overview"
  | "paid_ads"
  | "pipeline"
  | "inbox"
  | "contacts"
  | "calendar"
  | "billing"
  | "activity";

export type Action = "view" | "edit";

export interface CapabilityDef {
  key: Capability;
  label: string;
  // Whether an "edit" grant is meaningful today. View-only surfaces hide the
  // edit toggle in the owner UI.
  hasEdit: boolean;
}

export const CAPABILITIES: CapabilityDef[] = [
  { key: "overview", label: "Overview", hasEdit: false },
  { key: "paid_ads", label: "Paid Ads", hasEdit: false },
  { key: "pipeline", label: "Pipeline", hasEdit: true },
  { key: "inbox", label: "Inbox", hasEdit: true },
  { key: "contacts", label: "Contacts", hasEdit: true },
  { key: "calendar", label: "Calendar", hasEdit: true },
  { key: "billing", label: "Billing", hasEdit: true },
  { key: "activity", label: "Activity", hasEdit: true },
];

const CAPABILITY_KEYS = new Set<string>(CAPABILITIES.map((c) => c.key));

export function isCapability(value: string): value is Capability {
  return CAPABILITY_KEYS.has(value);
}

// Effective permissions for a staff member: staff_permissions intersected with
// the tenant's enabled entitlements. Absent capability => no access.
export type EffectivePermissions = Record<string, { view: boolean; edit: boolean }>;

// A required-permission rule. `any` is OR semantics: holding any one of the
// listed (capability, action) pairs grants access. Shared data endpoints (e.g.
// /api/pipelines feeds both Overview and Pipeline) list several.
interface PermRule {
  pattern: RegExp;
  methods?: string[]; // when omitted, applies to every method
  any: Array<{ capability: Capability; action: Action }>;
}

function need(capability: Capability, action: Action) {
  return { capability, action };
}

// Ordered: first matching rule wins, so more specific paths come first. Any
// path that matches no rule is ungated here (auth/me, tenant, me/*, team,
// push/*, entitlements, staff/* — the staff routes enforce owner-only inside
// the handler, not via surface permissions).
const RULES: PermRule[] = [
  // Pipeline / leads
  { pattern: /^\/api\/leads\/[^/]+\/(send|sms)\/?$/, methods: ["POST"], any: [need("pipeline", "edit"), need("inbox", "edit")] },
  { pattern: /^\/api\/leads\/[^/]+\/messages\/?$/, methods: ["GET"], any: [need("pipeline", "view"), need("inbox", "view")] },
  { pattern: /^\/api\/leads\/[^/]+\/?$/, methods: ["PATCH", "PUT", "POST", "DELETE"], any: [need("pipeline", "edit")] },
  { pattern: /^\/api\/leads\/[^/]+\/?$/, methods: ["GET"], any: [need("pipeline", "view")] },
  { pattern: /^\/api\/leads\/?$/, methods: ["GET"], any: [need("pipeline", "view")] },

  // Shared lookups used by multiple surfaces
  { pattern: /^\/api\/pipelines\/?$/, any: [need("overview", "view"), need("pipeline", "view")] },
  { pattern: /^\/api\/summary\/?$/, any: [need("overview", "view"), need("pipeline", "view")] },

  // Inbox / conversations
  { pattern: /^\/api\/conversations\/[^/]+\/(send|sms)\/?$/, methods: ["POST"], any: [need("inbox", "edit")] },
  { pattern: /^\/api\/conversations\/[^/]+\/messages\/?$/, methods: ["GET"], any: [need("inbox", "view")] },
  { pattern: /^\/api\/conversations\/?$/, methods: ["GET"], any: [need("inbox", "view"), need("overview", "view")] },

  // Contacts. Notes/tasks live under /api/contacts/<id>/... and double as the
  // lead drawer's notes/tasks, so pipeline rights also grant them.
  { pattern: /^\/api\/contacts\/[^/]+\/.+/, methods: ["POST", "PUT", "PATCH", "DELETE"], any: [need("contacts", "edit"), need("pipeline", "edit")] },
  { pattern: /^\/api\/contacts\/[^/]+\/.+/, methods: ["GET"], any: [need("contacts", "view"), need("pipeline", "view")] },
  { pattern: /^\/api\/contacts\/?$/, methods: ["GET"], any: [need("contacts", "view")] },

  // Calendar (also feeds Overview's upcoming-appointments card)
  { pattern: /^\/api\/calendar\//, methods: ["GET"], any: [need("calendar", "view"), need("overview", "view")] },

  // Billing
  { pattern: /^\/api\/invoices(\/|$)/, methods: ["GET"], any: [need("billing", "view")] },
  { pattern: /^\/api\/payments(\/|$)/, methods: ["GET"], any: [need("billing", "view")] },

  // Activity / notifications
  { pattern: /^\/api\/notifications\/read\/?$/, methods: ["POST"], any: [need("activity", "edit")] },
  { pattern: /^\/api\/notifications\/?$/, methods: ["GET"], any: [need("activity", "view"), need("overview", "view")] },
  { pattern: /^\/api\/activity\/?$/, methods: ["GET"], any: [need("activity", "view"), need("overview", "view")] },
];

export interface AccessDecision {
  allowed: boolean;
  // The capability the caller lacked, for a clearer 403 (best-effort).
  missing?: Capability;
}

// Decide whether a staff member's effective permissions satisfy the rule for
// this request. Ungated paths (no matching rule) are allowed for any signed-in
// staff member. Owners never reach here (they bypass in the middleware).
export function checkStaffAccess(
  pathname: string,
  method: string,
  perms: EffectivePermissions,
): AccessDecision {
  const rule = RULES.find(
    (r) => r.pattern.test(pathname) && (!r.methods || r.methods.includes(method)),
  );
  if (!rule) return { allowed: true };

  for (const req of rule.any) {
    const p = perms[req.capability];
    if (p && (req.action === "view" ? p.view : p.edit)) {
      return { allowed: true };
    }
  }
  return { allowed: false, missing: rule.any[0]?.capability };
}

export interface GrantInput {
  capability: string;
  view?: boolean;
  edit?: boolean;
}

export interface GrantRow {
  capability: Capability;
  can_view: boolean;
  can_edit: boolean;
}

// Normalize requested grants: keep only capabilities the tenant has enabled,
// drop unknown keys, and make edit imply view. The server-side backstop for the
// hard rule "a staff member can only get what the business has". Shared by the
// create and update endpoints.
export function sanitizeGrants(
  requested: GrantInput[] | undefined,
  enabled: Capability[],
): GrantRow[] {
  const enabledSet = new Set<string>(enabled);
  const rows: GrantRow[] = [];
  for (const p of requested ?? []) {
    if (!p || !isCapability(p.capability)) continue;
    if (!enabledSet.has(p.capability)) continue;
    const edit = Boolean(p.edit);
    const view = Boolean(p.view) || edit;
    if (!view && !edit) continue; // no grant => no row
    rows.push({ capability: p.capability, can_view: view, can_edit: edit });
  }
  return rows;
}

// The capabilities a tenant has turned on (Layer 2). Bounds what the owner can
// grant staff. Used by the entitlements endpoint and grant validation.
export async function loadEnabledCapabilities(
  client: SupabaseClient,
  tenantId: string,
): Promise<Capability[]> {
  const { data } = await client
    .from("tenant_entitlements")
    .select("capability, enabled")
    .eq("tenant_id", tenantId);
  const out: Capability[] = [];
  for (const row of data ?? []) {
    const r = row as { capability: string; enabled: boolean };
    if (r.enabled && isCapability(r.capability)) out.push(r.capability);
  }
  return out;
}

// Load a staff member's effective permissions: their staff_permissions rows,
// kept only where the tenant still has that capability enabled. Re-checking
// entitlements here means disabling a tenant capability instantly revokes it
// for every staff member, even if stale grant rows remain.
export async function loadEffectivePermissions(
  client: SupabaseClient,
  tenantId: string,
  staffAccountId: string,
): Promise<EffectivePermissions> {
  const [grants, entitlements] = await Promise.all([
    client
      .from("staff_permissions")
      .select("capability, can_view, can_edit")
      .eq("staff_account_id", staffAccountId),
    client
      .from("tenant_entitlements")
      .select("capability, enabled")
      .eq("tenant_id", tenantId),
  ]);

  const enabled = new Set<string>(
    (entitlements.data ?? [])
      .filter((r) => (r as { enabled: boolean }).enabled)
      .map((r) => (r as { capability: string }).capability),
  );

  const out: EffectivePermissions = {};
  for (const row of grants.data ?? []) {
    const r = row as { capability: string; can_view: boolean; can_edit: boolean };
    if (!enabled.has(r.capability)) continue;
    out[r.capability] = {
      view: Boolean(r.can_view) || Boolean(r.can_edit),
      edit: Boolean(r.can_edit),
    };
  }
  return out;
}
