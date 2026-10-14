// A tenant renamed "RETIRED ..." is a shut-down account kept only so its old
// rows still resolve. It is not a client, so no admin list offers it as one:
// left in, it sits in every client picker waiting to be chosen by mistake.
// Renaming is how the retirement is recorded (there is no archived column), so
// the name is what this reads.
export function isRetiredTenant(t: { name?: string | null }): boolean {
  return /^retired\b/i.test((t.name ?? "").trim());
}

// Hauck Marketing's own sub-account (Jake, 2026-10-13: "that's the agency sub
// account"). It has a tenant row so its GHL webhooks and agency data resolve,
// but it is not a client, so no admin client list offers it either.
export const AGENCY_TENANT_SLUG = "hauck-marketing";

// Retired or the agency: anything an admin client list should leave out.
export function isNotAClient(t: { name?: string | null; slug?: string | null }): boolean {
  return isRetiredTenant(t) || (t.slug ?? "").trim() === AGENCY_TENANT_SLUG;
}
