// Agency login roles (0047), for the UI.
//
// Mirrors functions/lib/adminRoles.ts. The server owns enforcement: it decides
// what a role may fetch, and hiding a nav item here changes nothing about that.
// What lives here is the vocabulary the Team page speaks, so a role reads as a
// job rather than a permission matrix.

export type AdminRole = "owner" | "cold_caller" | "setter";

export interface AdminRoleSpec {
  role: AdminRole;
  label: string;
  blurb: string;
  // What the role opens, and what it deliberately does not. Both are shown when
  // picking a role: the point of the picker is that the leash is legible before
  // the login exists, not after.
  sees: string[];
  denied: string[];
}

export const ADMIN_ROLE_SPECS: Record<AdminRole, AdminRoleSpec> = {
  owner: {
    role: "owner",
    label: "Owner",
    blurb: "Full control of the console, including who else has a login.",
    sees: ["Every client", "Every pillar", "Billing and settings", "This page"],
    denied: [],
  },
  cold_caller: {
    role: "cold_caller",
    label: "Cold caller",
    blurb: "Calls the agency's own prospect list and books meetings. Nothing else.",
    sees: ["Their call list", "Their own numbers"],
    denied: ["Client accounts", "Ad spend and billing", "Console settings", "Team"],
  },
  setter: {
    role: "setter",
    label: "Setter",
    blurb: "Works a client's leads in the Setter Suite.",
    sees: ["Setter Suite", "Assigned client leads"],
    denied: ["Ad spend and billing", "Console settings", "Team"],
  },
};

// Order the picker offers. Cold caller first: it is the role being hired for,
// and Owner sits last so it is never the accidental default.
export const ADMIN_ROLE_ORDER: AdminRole[] = ["cold_caller", "setter", "owner"];

export function adminRoleLabel(role: AdminRole | undefined): string {
  return role ? ADMIN_ROLE_SPECS[role]?.label ?? "Owner" : "Owner";
}

// A session with no role predates 0047 and belongs to Jake, so it reads as an
// owner. Matches the column default and the backend's own fallback.
export function effectiveAdminRole(role: AdminRole | undefined | null): AdminRole {
  return role ?? "owner";
}

// A sensible username from a person's name: the first word, letters and digits
// only. "Marcus Bell" -> "marcus". Mirrors suggestUsername in
// functions/lib/adminRoles.ts; the server validates whatever is sent.
export function suggestUsername(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z0-9]/g, "");
}
