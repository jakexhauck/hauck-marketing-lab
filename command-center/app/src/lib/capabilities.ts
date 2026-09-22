// Frontend mirror of functions/lib/permissions.ts CAPABILITIES. The two MUST
// stay in sync (same convention as the shared types). Drives the Team screen's
// permission toggles. The owner can only grant capabilities the tenant has
// enabled (GET /api/entitlements), so this list is the upper bound of labels,
// not what any one client sees.

// One per page in the client sidebar (see functions/lib/permissions.ts for why
// three keys kept older names). Retired keys stay valid so stored grants parse.
export type Capability =
  | "paid_ads"
  | "ads_dashboard"
  | "meta_data"
  | "creatives"
  | "organic"
  | "pipeline"
  | "calendar"
  | "inbox"
  | "contacts"
  | "overview"
  | "billing"
  | "activity";

export interface CapabilityDef {
  key: Capability;
  // The page's name, exactly as the sidebar prints it.
  label: string;
  // Whether an "edit" grant is meaningful. View-only surfaces hide the edit
  // toggle in the Team UI.
  hasEdit: boolean;
  // No page in the app any more: never offered on the Team screen.
  retired?: boolean;
}

// Sidebar order. nav.test.ts fails if a capability-gated page is missing here.
export const CAPABILITIES: CapabilityDef[] = [
  { key: "paid_ads", label: "Lead Tracker", hasEdit: true },
  { key: "ads_dashboard", label: "Ads Dashboard", hasEdit: false },
  { key: "meta_data", label: "Meta Data", hasEdit: false },
  { key: "creatives", label: "Creatives", hasEdit: false },
  { key: "organic", label: "Organic", hasEdit: false },
  { key: "pipeline", label: "Leads", hasEdit: true },
  { key: "calendar", label: "Schedule", hasEdit: true },
  { key: "inbox", label: "Inbox", hasEdit: true },
  { key: "contacts", label: "Contacts", hasEdit: true },
  { key: "overview", label: "Overview", hasEdit: false, retired: true },
  { key: "billing", label: "Billing", hasEdit: true, retired: true },
  { key: "activity", label: "Activity", hasEdit: true, retired: true },
];

// The pages an owner can hand out: every capability that still has a page.
export const GRANTABLE_CAPABILITIES: CapabilityDef[] = CAPABILITIES.filter((c) => !c.retired);

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
      // Every page, view and edit.
      return all(true, true);
    case "rep":
      // Day-to-day selling: the leads, the schedule, the conversations. The
      // ad performance pages stay with the owner unless they switch them on.
      return {
        ...all(false, false),
        paid_ads: { view: true, edit: true },
        pipeline: { view: true, edit: true },
        calendar: { view: true, edit: false },
        inbox: { view: true, edit: true },
        contacts: { view: true, edit: true },
      };
    case "owner":
    default:
      return all(true, true);
  }
}

export type StaffRole = "owner" | "manager" | "rep";
