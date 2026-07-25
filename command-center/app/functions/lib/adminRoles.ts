// Roles for agency logins (0047), and the single gate that enforces them.
//
// Before this, every admin_accounts row was a full super-admin: cross-tenant
// authority over every client, every setting and every password field. That was
// fine while Jake was the only account. It stops being fine the moment anyone
// else is hired, so a login now carries a role and non-owner roles reach only
// the /api/admin/* paths listed here.
//
// The gate is an ALLOWLIST, deliberately. A new admin route is invisible to a
// non-owner until someone adds it below, which is the safe direction to fail:
// a hire never silently inherits a surface that shipped after they were hired.

export type AdminRole = "owner" | "cold_caller" | "setter";

export const ADMIN_ROLES: AdminRole[] = ["owner", "cold_caller", "setter"];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as string[]).includes(value);
}

// What each role is called and what it can reach, in the words the roster uses.
// `sees` is the plain-English summary shown next to the role when picking one:
// the person creating the login should be able to read the leash without
// cross-referencing this file.
export interface AdminRoleSpec {
  role: AdminRole;
  label: string;
  blurb: string;
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

// Path prefixes each non-owner role may reach under /api/admin/. Owners are not
// listed: they bypass the check entirely.
//
// A rule matches when the request path equals the prefix or continues with "/",
// so "/api/admin/tracker/leads" never accidentally opens
// "/api/admin/tracker/leads-export" to someone.
interface AdminRule {
  prefix: string;
  methods: string[];
}

const READ_ONLY = ["GET", "HEAD"];
const READ_WRITE = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"];

const ROLE_RULES: Record<Exclude<AdminRole, "owner">, AdminRule[]> = {
  cold_caller: [
    // The agency prospect book: he works the list Jake gives him, so he reads
    // and updates rows (status, notes, follow-up) but the list itself is Jake's.
    { prefix: "/api/admin/tracker/leads", methods: ["GET", "HEAD", "PATCH"] },
    // His daily dialing numbers.
    { prefix: "/api/admin/tracker/cold-calls", methods: ["GET", "HEAD", "POST", "PATCH"] },
    // The dialing script, read only. Writing it is the owner's Settings page,
    // and the handler refuses a non-owner PATCH on its own account too.
    { prefix: "/api/admin/cold-call/script", methods: READ_ONLY },
  ],
  setter: [
    { prefix: "/api/admin/setter", methods: READ_WRITE },
    // Which clients exist, so the client picker can render. Read only.
    { prefix: "/api/admin/clients", methods: READ_ONLY },
  ],
};

function matches(pathname: string, rule: AdminRule, method: string): boolean {
  if (pathname !== rule.prefix && !pathname.startsWith(`${rule.prefix}/`)) {
    return false;
  }
  return rule.methods.includes(method.toUpperCase());
}

// Decide whether `role` may make this request. Owners pass everything; every
// other role passes only what ROLE_RULES names.
export function canAdminAccess(
  pathname: string,
  method: string,
  role: AdminRole,
): boolean {
  if (role === "owner") return true;
  const rules = ROLE_RULES[role] ?? [];
  return rules.some((rule) => matches(pathname, rule, method));
}
