// Who the meeting is actually with.
//
// A cold-call prospect arrives from the scraper as a BUSINESS: a company name
// and a switchboard number, no person and usually no email. The name is learned
// on the call, which is the one moment somebody is there to type it, so the
// booking panel collects it and this module decides what is usable.
//
// Pure: no fetch, no Supabase, no GoHighLevel. The rules a booking is accepted
// on are unit tested here rather than inferred from a 502 in production.

export interface ContactEdits {
  firstName?: unknown;
  lastName?: unknown;
  businessName?: unknown;
  phone?: unknown;
  email?: unknown;
}

export interface CleanContact {
  firstName: string;
  lastName: string;
  businessName: string;
  phone: string;
  email: string;
}

// Long enough for a real name, short enough that the field cannot be used to
// smuggle a paragraph onto a calendar invite.
export const MAX_NAME = 80;
export const MAX_EMAIL = 254;

/** Trim, collapse internal whitespace, cap. "" for anything unusable. */
export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
}

/**
 * A phone number GoHighLevel will accept.
 *
 * Digits are kept and everything a human types around them is dropped, so
 * "(248) 555-0171", "248.555.0171" and "+1 248 555 0171" are one number. A bare
 * 10-digit US number gains +1, because that is what every number in this book
 * already is and forcing a caller to type the country code mid-call is a way to
 * lose the booking.
 *
 * Returns "" when it is not a number worth sending. Refusing here is the point:
 * GHL answers a malformed phone with a 4xx that reaches the caller as "could not
 * book that time", which blames the calendar for a typo.
 */
export function cleanPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";

  // Already international, and not a US number: keep it as given.
  if (raw.startsWith("+") && !digits.startsWith("1")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Anything else is either too short to dial or long enough to be a mistake.
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
}

/**
 * An email address worth sending, or "".
 *
 * Deliberately a shape check and not RFC 5322: the only question here is whether
 * GoHighLevel will store it and a reminder has somewhere to go. Anything with
 * one @, something either side and a dot in the domain passes.
 */
export function cleanEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_EMAIL) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
}

export interface ResolvedContact {
  contact: CleanContact;
  // Which fields the caller actually changed, so the booking writes back only
  // what it was told rather than stamping the stored record with itself.
  changed: Partial<CleanContact>;
  // Why the booking cannot go ahead, or null.
  error: string | null;
}

/**
 * Merge what the caller typed over what the book already holds.
 *
 * A field the caller left alone keeps the stored value; a field they typed wins.
 *
 * NAMES CAN BE CLEARED. Everything else cannot. The asymmetry is the point:
 *
 *   - A scraped prospect's first and last name hold a COMPANY, so "this person
 *     has no surname I know" has to be sayable, and the only way to say it is an
 *     empty box. The panel always sends both name fields and always prefills
 *     them, so a blank one arriving here is somebody deleting it on purpose.
 *   - A blank phone, email or business name still means "leave it alone". A
 *     reminder needs somewhere to go, and a company name corrected by hand in
 *     GoHighLevel must not be wiped by a booking that simply did not mention it.
 *
 * A field OMITTED entirely (undefined) always means "leave it alone", whatever
 * it is. The distinction is `undefined` versus `""`, never truthiness.
 *
 * An input that is present but unusable (a half-typed email, four digits of a
 * phone number) is an ERROR rather than a silent fallback to the stored value.
 * Silently booking against the old number would look identical to success.
 */
export function resolveBookingContact(
  stored: {
    first_name?: string | null;
    last_name?: string | null;
    business_name?: string | null;
    phone?: string | null;
    email?: string | null;
  },
  edits: ContactEdits,
): ResolvedContact {
  const changed: Partial<CleanContact> = {};

  const fail = (error: string): ResolvedContact => ({
    contact: {
      firstName: (stored.first_name ?? "").trim(),
      lastName: (stored.last_name ?? "").trim(),
      businessName: (stored.business_name ?? "").trim(),
      phone: (stored.phone ?? "").trim(),
      email: (stored.email ?? "").trim(),
    },
    changed: {},
    error,
  });

  // Names: any string is a name, including an empty one. Nobody's name needs
  // validating, and rejecting one is how an app tells somebody they are spelled
  // wrong.
  let firstName = (stored.first_name ?? "").trim();
  if (typeof edits.firstName === "string") {
    const next = cleanName(edits.firstName);
    if (next !== firstName) changed.firstName = next;
    firstName = next;
  }

  let lastName = (stored.last_name ?? "").trim();
  if (typeof edits.lastName === "string") {
    const next = cleanName(edits.lastName);
    if (next !== lastName) changed.lastName = next;
    lastName = next;
  }

  // Who the business is. Where the company goes once the name columns hold the
  // person instead, so the thing the scraper found is not lost by correcting it.
  let businessName = (stored.business_name ?? "").trim();
  if (typeof edits.businessName === "string" && edits.businessName.trim()) {
    const next = cleanName(edits.businessName);
    if (next !== businessName) changed.businessName = next;
    businessName = next;
  }

  let phone = (stored.phone ?? "").trim();
  if (typeof edits.phone === "string" && edits.phone.trim()) {
    const cleaned = cleanPhone(edits.phone);
    if (!cleaned) return fail("That phone number does not look right. Check the digits.");
    phone = cleaned;
    if (phone !== (stored.phone ?? "").trim()) changed.phone = phone;
  }

  let email = (stored.email ?? "").trim();
  if (typeof edits.email === "string" && edits.email.trim()) {
    const cleaned = cleanEmail(edits.email);
    if (!cleaned) return fail("That email address does not look right.");
    email = cleaned;
    if (email !== (stored.email ?? "").trim()) changed.email = email;
  }

  // The existing rule, unchanged: GoHighLevel needs somewhere to send a
  // reminder. It is checked AFTER the merge so typing a phone number in the
  // panel is a valid way to satisfy it for a prospect that had none.
  if (!phone && !email) {
    return fail("Add a phone number or an email so GoHighLevel can hold the booking.");
  }

  return { contact: { firstName, lastName, businessName, phone, email }, changed, error: null };
}
