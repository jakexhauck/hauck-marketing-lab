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
  // When true the path must equal the prefix exactly, so sub-routes are NOT
  // inherited. Used where a base path is safe for a role but the routes beneath
  // it are not: /leads is a caller's queue, /leads/assign and /leads/import are
  // the owner handing work out.
  exact?: boolean;
}

const READ_ONLY = ["GET", "HEAD"];
const READ_WRITE = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"];

const ROLE_RULES: Record<Exclude<AdminRole, "owner">, AdminRule[]> = {
  cold_caller: [
    // His own queue: he reads it and writes the outcome of a call (status,
    // notes, follow-up). EXACT, so /leads/assign and /leads/import stay shut.
    // The handler scopes both the read and the write to rows assigned to him.
    { prefix: "/api/admin/tracker/leads", methods: ["GET", "HEAD", "PATCH"], exact: true },
    // His daily dialing numbers.
    { prefix: "/api/admin/tracker/cold-calls", methods: ["GET", "HEAD", "POST", "PATCH"] },
    // The shelf he reads from mid-call (0058): the dialing script variations and
    // the objection handling beside them. Read only. Writing them is the owner's
    // Settings page, and the handler refuses a non-owner write on its own
    // account too. (This replaced /cold-call/script, the single document.)
    { prefix: "/api/admin/cold-call/assets", methods: READ_ONLY, exact: true },
    // Booking a meeting on the agency's calendar: the whole point of the job.
    // Reading calendars and free slots, and creating the appointment. Each is
    // EXACT so nothing else that lands under /cold-call/ is inherited.
    { prefix: "/api/admin/cold-call/calendars", methods: READ_ONLY, exact: true },
    { prefix: "/api/admin/cold-call/slots", methods: READ_ONLY, exact: true },
    { prefix: "/api/admin/cold-call/book", methods: ["POST"], exact: true },
    // Logging the attempt he just made (0052). Append only: there is no route
    // here that edits or removes a dial, so his own recorded numbers are as
    // unarguable as anyone else's.
    { prefix: "/api/admin/cold-call/dials", methods: ["POST"], exact: true },
    // Marking when he is on the phones (0057). Read and write, because the
    // whole point is that he fills his own week in. The handler pins every
    // request to the signed-in session, so this opens his own availability and
    // nobody else's, whatever ?callerId= says.
    {
      prefix: "/api/admin/cold-call/availability",
      methods: ["GET", "HEAD", "PUT"],
      exact: true,
    },
    // The GHL boards, read only. He can see where his own prospects stand; he
    // cannot move them, because nothing in this app moves them.
    { prefix: "/api/admin/cold-call/pipelines", methods: READ_ONLY, exact: true },
  ],
  setter: [
    { prefix: "/api/admin/setter", methods: READ_WRITE },
    // Which clients exist, so the client picker can render. Read only.
    { prefix: "/api/admin/clients", methods: READ_ONLY },
  ],
};

function matches(pathname: string, rule: AdminRule, method: string): boolean {
  const pathOk = rule.exact
    ? pathname === rule.prefix
    : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
  if (!pathOk) return false;
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

// ---------------------------------------------------------------------------
// Usernames (0051). The login handle for an agency account: what someone types
// into the sign-in box. Stored lowercase so "Marcus" and "marcus" are one
// account, and matched exactly rather than with a LIKE, so no input can be read
// as a wildcard.
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

// Returns a human-readable problem, or null when the username is usable.
export function usernameProblem(value: string): string | null {
  const name = normalizeUsername(value);
  if (!name) return "Enter a username.";
  if (name.length < 3) return "A username needs at least 3 characters.";
  if (name.length > 32) return "A username can be at most 32 characters.";
  if (!USERNAME_RE.test(name)) {
    return "Usernames can use letters, numbers, dots, dashes and underscores.";
  }
  return null;
}

// A sensible username from a person's name: the first word, letters and digits
// only. "Marcus Bell" -> "marcus". Empty when there is nothing usable, so the
// caller can decide what to do rather than being handed a junk default.
export function suggestUsername(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z0-9]/g, "");
}
