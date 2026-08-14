import type { SupabaseClient } from "@supabase/supabase-js";
import { normEmail, normPhone, sha256Hex } from "./metaCapi";

// Keeping the ad click attached to the person, so a booking days later can
// still be credited to the ad that produced it.
//
// The funnel knows `fbc` (built from the ad click) and `fbp` (the browser) at
// the moment the homeowner submits, and /api/capi/lead used to discard both the
// instant it had reported the Lead. A Schedule event fired three days later
// then had nothing but a hashed email to match on, and Meta weighs fbc far
// above hashed contact details: the difference is whether the booking is
// attributed to the ad at all.
//
// Only hashes are stored. The lookup is by hashed email or hashed phone, using
// the SAME normalisation Meta requires, so a row written here matches a contact
// read back out of GHL without either side knowing the raw value.

export interface CapiSignals {
  fbc?: string;
  fbp?: string;
}

// Hash an email and a phone the way Meta does, or null when absent. Exported
// for the test, which is the only place both halves are visible at once.
export async function identityHashes(
  email: string | undefined,
  phone: string | undefined,
): Promise<{ emailHash: string | null; phoneHash: string | null }> {
  const e = normEmail(email ?? "");
  const p = normPhone(phone ?? "");
  return {
    emailHash: e ? await sha256Hex(e) : null,
    phoneHash: p ? await sha256Hex(p) : null,
  };
}

// Remember one funnel submission's click signals.
//
// Best effort by design: this runs after the Lead event has already been
// reported, and losing the row costs future match quality, never the
// conversion itself. A submission with neither fbc nor fbp is not stored at
// all, since a row with nothing to remember only makes the lookup slower.
export async function rememberIdentity(
  client: SupabaseClient,
  funnel: string,
  who: { email?: string; phone?: string },
  signals: CapiSignals,
  sourceUrl?: string,
): Promise<void> {
  if (!signals.fbc && !signals.fbp) return;

  const { emailHash, phoneHash } = await identityHashes(who.email, who.phone);
  if (!emailHash && !phoneHash) return;

  const { error } = await client.from("capi_identity").insert({
    funnel,
    email_hash: emailHash,
    phone_hash: phoneHash,
    fbc: signals.fbc ?? null,
    fbp: signals.fbp ?? null,
    source_url: sourceUrl ?? null,
  });
  if (error) console.warn("[capi] identity write failed", error.message);
}

// The newest click signals for a person, matched on either hash.
//
// Email first, then phone. One query each rather than an `or`, because the two
// partial indexes are what make this cheap and a combined predicate would use
// neither. Returns empty signals rather than null when nothing matches: the
// caller still sends the event, just with a weaker match.
export async function lookupIdentity(
  client: SupabaseClient,
  funnel: string,
  who: { email?: string; phone?: string },
): Promise<CapiSignals> {
  const { emailHash, phoneHash } = await identityHashes(who.email, who.phone);

  for (const [column, value] of [
    ["email_hash", emailHash],
    ["phone_hash", phoneHash],
  ] as const) {
    if (!value) continue;
    const { data, error } = await client
      .from("capi_identity")
      .select("fbc, fbp")
      .eq("funnel", funnel)
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.warn("[capi] identity lookup failed", error.message);
      return {};
    }
    const row = (data ?? [])[0] as { fbc?: string | null; fbp?: string | null } | undefined;
    if (row && (row.fbc || row.fbp)) {
      return { fbc: row.fbc ?? undefined, fbp: row.fbp ?? undefined };
    }
  }

  return {};
}
