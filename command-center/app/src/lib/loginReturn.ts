// Where the admin login sends you once you are in. AdminRoute passes the page
// it bounced you from as router state; without it, login always went to
// Clients, so the Quick Book home screen icon (whose login is separate from
// Safari's on iPhone) opened, asked for a login, then landed on the admin view.
//
// Only a same-site /admin path is honoured, never a full URL or "//host".
export function adminReturnPath(state: unknown): string | null {
  const from = (state as { from?: unknown } | null | undefined)?.from;
  if (typeof from !== "string") return null;
  if (from !== "/admin" && !from.startsWith("/admin/") && !from.startsWith("/admin?")) return null;
  return from;
}
