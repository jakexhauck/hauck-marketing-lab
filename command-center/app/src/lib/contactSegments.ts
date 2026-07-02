// Client-side "Smart Lists": derive a contact's lifecycle from the pipeline
// opportunities it belongs to. ApiContact carries no stage, so membership comes
// from ApiLead (contactId + status). Pure + clock-injected so it is unit-testable.
//
// Deliberately no "Leads" label: that word belongs to the Leads section. Contacts
// is the address book, grouped by lifecycle.
export type ContactSegment = "all" | "new" | "customers" | "past";

export const SEGMENT_LABELS: Record<ContactSegment, string> = {
  all: "All",
  new: "New",
  customers: "Customers",
  past: "Past customers",
};

// The order the segment bar renders them in.
export const SEGMENT_ORDER: ContactSegment[] = ["all", "new", "customers", "past"];

// A won customer whose last activity is older than this reads as "past".
const PAST_CUSTOMER_DAYS = 90;

export function contactSegment(
  contact: { id: string; lastActivityAt: string },
  membership: { wonIds: Set<string>; openIds: Set<string> },
  now: number,
): Exclude<ContactSegment, "all"> | null {
  if (membership.wonIds.has(contact.id)) {
    const last = Date.parse(contact.lastActivityAt);
    const stale =
      Number.isFinite(last) && now - last > PAST_CUSTOMER_DAYS * 86_400_000;
    return stale ? "past" : "customers";
  }
  // An open opportunity means an active/new lead in lifecycle terms.
  if (membership.openIds.has(contact.id)) return "new";
  return null;
}
