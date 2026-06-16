// Capability registry (frontend mirror). MUST stay in sync with the backend
// copy at client-dashboard/functions/lib/permissions.ts (same convention as
// types.ts mirroring the backend contract). The frontend uses this to render
// the Team grant grid and to gate nav/edit controls; the backend list is the
// authoritative enforcement.

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
  // Whether an "edit" grant is meaningful today (view-only surfaces hide the
  // edit toggle in the owner UI).
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

// A staff member's effective grants, keyed by capability. Returned by the
// backend (already intersected with tenant entitlements). Absent capability
// means no access.
export type EffectivePermissions = Partial<
  Record<Capability, { view: boolean; edit: boolean }>
>;

export interface StaffPermission {
  capability: Capability;
  view: boolean;
  edit: boolean;
}
