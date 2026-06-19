// Frontend mirror of functions/lib/permissions.ts CAPABILITIES. The two MUST
// stay in sync (same convention as the shared types). Drives the Team screen's
// permission toggles. The owner can only grant capabilities the tenant has
// enabled (GET /api/entitlements), so this list is the upper bound of labels,
// not what any one client sees.

export type Capability =
  | "overview"
  | "paid_ads"
  | "pipeline"
  | "inbox"
  | "contacts"
  | "calendar"
  | "billing"
  | "activity";

export interface CapabilityDef {
  key: Capability;
  label: string;
  // Whether an "edit" grant is meaningful. View-only surfaces hide the edit
  // toggle in the Team UI.
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

// A single staff member's grant for one capability, as the create/update
// endpoints expect in their `permissions` array.
export interface Grant {
  capability: Capability;
  view: boolean;
  edit: boolean;
}

// Sensible default grants per role, applied when the owner first picks a role
// in the add-employee form. The owner can then tweak individual toggles. Only
// capabilities the tenant has enabled are ever written (the backend re-checks).
export function defaultGrantsForRole(role: StaffRole): Record<Capability, { view: boolean; edit: boolean }> {
  const all = (view: boolean, edit: boolean) =>
    Object.fromEntries(
      CAPABILITIES.map((c) => [c.key, { view, edit: c.hasEdit ? edit : false }]),
    ) as Record<Capability, { view: boolean; edit: boolean }>;
  switch (role) {
    case "manager":
      // Full view + edit across surfaces, no billing edit by default.
      return { ...all(true, true), billing: { view: true, edit: false } };
    case "rep":
      // Day-to-day selling: see and work pipeline + inbox + contacts + calendar.
      return {
        ...all(false, false),
        overview: { view: true, edit: false },
        pipeline: { view: true, edit: true },
        inbox: { view: true, edit: true },
        contacts: { view: true, edit: true },
        calendar: { view: true, edit: false },
      };
    case "owner":
    default:
      return all(true, true);
  }
}

export type StaffRole = "owner" | "manager" | "rep";
