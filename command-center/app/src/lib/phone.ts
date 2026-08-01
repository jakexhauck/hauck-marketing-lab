// Phone numbers: stored one way, read another.
//
// STORAGE is E.164 ("+12485550171"), because that is what GoHighLevel, Twilio
// and every other thing that dials accepts. DISPLAY is for a person reading a
// number off a screen while holding a handset, which is a different job.
//
// Nothing here mutates what is stored. A formatter that quietly rewrote the
// column would break the dialling.

export function e164(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "");
  if (phone.trim().startsWith("+")) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return phone;
}

export function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "").slice(-10);
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * The ten digits, grouped 3-3-4 with dashes: "248-555-0171".
 *
 * What the cold calling suite shows. A caller is reading a number off the screen
 * and pressing it, and "+12485550171" is one run of twelve characters with a
 * country code on the front that is the same for every prospect in the book.
 *
 * NANP only. A number that is not ten digits (or eleven starting with 1) is
 * returned UNCHANGED rather than being forced into the shape: taking the last
 * ten digits of +44 20 7946 0958 would render a London number as "207-946-0958",
 * which is not a phone number anywhere. formatPhone has that flaw; this does not
 * inherit it.
 */
export function formatPhoneDashed(phone: string | null | undefined): string {
  if (!phone) return "";
  const raw = phone.trim();
  const digits = raw.replace(/[^0-9]/g, "");

  // Strip a leading US country code, and only a US one.
  const ten =
    digits.length === 10
      ? digits
      : digits.length === 11 && digits.startsWith("1")
        ? digits.slice(1)
        : "";

  // Not a number this shape fits. Hand it back as it came rather than inventing
  // a grouping for it.
  if (!ten) return raw;
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}
