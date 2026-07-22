// Internal notification recipients.
//
// GHL workflows fire "internal notification" actions that text or email the
// business owner and Hauck staff. GHL logs those sends against a contact, so
// they surface in the client's Inbox looking like leads. A live audit of Willis
// on 2026-07-21 found 3 of 15 conversations were these sinks.
//
// Two signals identify them, and neither is sufficient alone:
//
//   1. contact.source === "NOTIFICATION". GHL stamps this on contacts it
//      auto-creates for notification actions. Catches owner sinks, no config.
//   2. The contact's phone or email is a configured internal recipient.
//      Catches staff, whose contacts are WEB_USER and invisible to signal 1.
//
// WARNING: do NOT filter on a message's `source: "workflow"` instead. Real
// nurture sends to real leads carry that exact value, so filtering on it would
// erase every follow-up sequence from the client's view. Verified against live
// data. See docs/build-plans/internal-notifications-hidden.md section 1.2.

export interface InternalRecipientList {
  phones: Set<string>;
  emails: Set<string>;
}

interface MaybeContact {
  source?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface ContactRecordLike extends MaybeContact {
  id?: string;
}

interface ConversationLike {
  contactId?: string;
  phone?: string | null;
  email?: string | null;
}

const NOTIFICATION_SOURCE = "NOTIFICATION";

// Compare on the last 10 digits so +1 country codes, dashes, parens, and dots
// all collapse to the same key. Fewer than 10 digits yields "" and never
// matches, so a malformed config entry cannot hide a real lead.
export function normalizePhone(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

// Accepts a comma or newline separated string, the shape stored in
// tenants.internal_recipients and the INTERNAL_RECIPIENTS env fallback.
export function parseInternalRecipients(raw: unknown): InternalRecipientList {
  const phones = new Set<string>();
  const emails = new Set<string>();
  if (typeof raw !== "string") return { phones, emails };

  for (const part of raw.split(/[,\n]/)) {
    const entry = part.trim();
    if (!entry) continue;
    if (entry.includes("@")) {
      const email = normalizeEmail(entry);
      if (email) emails.add(email);
    } else {
      const phone = normalizePhone(entry);
      if (phone) phones.add(phone);
    }
  }
  return { phones, emails };
}

// True when this contact is an internal notification recipient and must not
// appear in any inbox, thread, lead list, or count.
export function isInternalRecipient(
  contact: MaybeContact | null | undefined,
  list: InternalRecipientList,
): boolean {
  if (!contact) return false;

  // Signal 1. Exact match, not substring: a lead source of "notification-form"
  // is a real lead and must stay visible.
  if (
    typeof contact.source === "string" &&
    contact.source.trim().toUpperCase() === NOTIFICATION_SOURCE
  ) {
    return true;
  }

  // Signal 2. Blank normalizations are skipped so an empty contact field never
  // collides with an empty list entry.
  const phone = normalizePhone(contact.phone);
  if (phone && list.phones.has(phone)) return true;

  const email = normalizeEmail(contact.email);
  if (email && list.emails.has(email)) return true;

  return false;
}

// Builds a reusable "is this conversation internal" predicate from an already
// fetched contact roster. Every surface that lists GHL conversations routes
// through this, so the rule cannot drift between the inbox, the unread badge,
// reactivation, and the setter tools.
//
// The roster supplies `source` (signal 1). Phone and email fall back to the
// conversation row itself, because fetchAllContacts is page-capped and a sink
// missing from the roster would otherwise leak straight back into the inbox.
export function makeInternalConversationFilter(
  contacts: ContactRecordLike[],
  rawList: unknown,
): (conversation: ConversationLike) => boolean {
  const list = parseInternalRecipients(rawList);
  const byId = new Map<string, ContactRecordLike>();
  for (const c of contacts) {
    if (c.id) byId.set(c.id, c);
  }

  return (conversation) => {
    if (!conversation?.contactId) return false;
    const contact = byId.get(conversation.contactId);
    return isInternalRecipient(
      {
        source: contact?.source,
        phone: contact?.phone ?? conversation.phone,
        email: contact?.email ?? conversation.email,
      },
      list,
    );
  };
}
