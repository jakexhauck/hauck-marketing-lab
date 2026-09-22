import { isPlaceholder } from "./tenantGhl";

// The pure rules behind Client setup's Sub-account card.
//
// No I/O here on purpose: the rule that actually matters (a sub-account belongs
// to exactly one client) is the kind of thing that must be tested without a
// database in the way.

export interface LocationOption {
  id: string;
  name: string;
  linkedTenantId: string | null;
  linkedTenantName: string | null;
}

export interface TenantLite {
  id: string;
  name: string;
  ghl_location_id: string | null;
}

// Which client, if any, holds each sub-account. A tenant carrying a placeholder
// ('', 'pending', 'env') holds nothing, so it must not claim a location that
// happens to be spelled the same.
export function annotateLocations(
  locations: { id: string; name: string }[],
  tenants: TenantLite[],
): LocationOption[] {
  const holder = new Map<string, TenantLite>();
  for (const t of tenants) {
    const loc = (t.ghl_location_id ?? "").trim();
    if (!isPlaceholder(loc)) holder.set(loc, t);
  }
  return locations
    .map((l) => {
      const t = holder.get(l.id);
      return {
        id: l.id,
        name: l.name,
        linkedTenantId: t?.id ?? null,
        linkedTenantName: t?.name ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Company suffixes are noise when matching "Acme Roofing" against the
// sub-account somebody named "Acme Roofing LLC".
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(llc|inc|co|company|ltd|corp)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

// The sub-account Jake most likely just made for this client: unlinked, and its
// name contains the business name or the other way round.
//
// Only ever a suggestion. The dropdown still lists everything and the link does
// not happen until Link is pressed, because a wrong guess accepted silently is
// how one client ends up reading another client's leads.
export function suggestLocationId(options: LocationOption[], businessName: string): string | null {
  const want = norm(businessName);
  if (!want) return null;
  const hit = options.find((o) => {
    if (o.linkedTenantId) return false;
    const have = norm(o.name);
    return Boolean(have) && (have.includes(want) || want.includes(have));
  });
  return hit?.id ?? null;
}

// Why this client may not take this sub-account, or null when it may.
//
// tenantIdForLocation (functions/api/crm/app-webhook.ts) uses .maybeSingle():
// two tenants holding one location makes every inbound event for it resolve to
// null and vanish. So this is refused rather than warned about.
export function linkBlocker(
  tenantId: string,
  locationId: string,
  tenants: TenantLite[],
): string | null {
  const loc = locationId.trim();
  if (!loc) return "Pick a sub-account.";
  const other = tenants.find(
    (t) => t.id !== tenantId && (t.ghl_location_id ?? "").trim() === loc,
  );
  return other ? `${other.name} is already linked to that sub-account.` : null;
}
