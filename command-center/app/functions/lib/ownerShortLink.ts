import { CALL_NOW_PURPOSE, PHONE_APPT_CALL_PURPOSE } from "./callNow";
import { LEAD_KEY_PURPOSE } from "./leadOutcome";

// Short owner links (Jake, 2026-10-12): the custom value holds
// /api/n?o=<code> instead of the long /api/call-now?l=<location>&k=<key>, so
// the texted link is about half the length. The text itself is unchanged:
// {{custom_values.call_now_link}}&c={{contact.id}}.
//
// The code is signed, not stored: HMAC(SESSION_SECRET, "short:<purpose>:<location>")
// cut to 10 base36 characters. No table, nothing to provision, and a code is as
// hard to guess as it needs to be (about 52 bits, and it still needs a real
// contact id). /api/n finds the client by computing the codes of every linked
// sub-account, then sends the tap on to the long link, whose key check and
// pages are untouched. Long links already texted keep working.

export interface OwnerLinkTarget {
  purpose: string;
  path: string;
}

// Order is the order Outcome Wiring and the custom values list them.
export const OWNER_LINK_TARGETS: OwnerLinkTarget[] = [
  { purpose: CALL_NOW_PURPOSE, path: "/api/call-now" },
  { purpose: LEAD_KEY_PURPOSE, path: "/api/lead-outcome" },
  { purpose: PHONE_APPT_CALL_PURPOSE, path: "/api/phone-appt-call" },
];

const CODE_LENGTH = 10;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export async function shortCode(secret: string, purpose: string, locationId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`short:${purpose}:${locationId}`)),
  );
  return [...sig.slice(0, CODE_LENGTH)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isShortCode(code: string): boolean {
  return new RegExp(`^[0-9a-z]{${CODE_LENGTH}}$`).test(code);
}

// Which client and link a code belongs to, or null.
export async function resolveShortCode(
  secret: string,
  code: string,
  locationIds: string[],
): Promise<{ locationId: string; target: OwnerLinkTarget } | null> {
  if (!secret || !isShortCode(code)) return null;
  for (const locationId of locationIds) {
    for (const target of OWNER_LINK_TARGETS) {
      if ((await shortCode(secret, target.purpose, locationId)) === code) return { locationId, target };
    }
  }
  return null;
}
