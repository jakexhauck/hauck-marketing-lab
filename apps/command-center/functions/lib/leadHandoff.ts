import type { Env } from "./env";
import { ghlJson } from "./ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "./agencyGhl";
import { upsertAgencyContact, type LeadForPush } from "./agencyCrm";
import { tagsForLead, type Channel, type RunForTags, type ScrapedLead } from "./leadScraper";

// Handing a scraped lead to a channel.
//
// Two steps and no more: make sure the business exists as a GoHighLevel contact,
// and put the run's tags on it. It does not create opportunities or move stages.
// Jake runs every pipeline move from tags inside GHL, and two systems moving the
// same card is how a pipeline starts lying about itself. That rule is inherited
// from agencyCrm.ts deliberately, not re-decided here.
//
// Nothing throws at the caller. A lead that fails to push is reported per-lead so
// the rest of a batch still goes out; a batch that dies on its third row would
// leave Jake guessing which ones landed.

export interface HandoffResult {
  ok: boolean;
  contactId: string | null;
  error: string | null;
  notConfigured?: boolean;
}

// What a scraped business looks like to the GoHighLevel push. Google Maps gives a
// company, never a person, so the name fields stay empty and businessName carries
// the identity: agencyCrm's displayName already falls back to it.
export function toLeadForPush(lead: ScrapedLead): LeadForPush {
  return {
    id: lead.id,
    firstName: "",
    lastName: "",
    phone: lead.phoneE164,
    email: "",
    source: "Lead scraper",
    businessName: (lead.businessName ?? "").trim(),
    website: (lead.website ?? "").trim(),
    ghlContactId: null,
  };
}

/**
 * Upsert the contact, then apply the run's tags.
 *
 * Tags are applied after the upsert and their failure is reported separately from
 * the contact's: a contact that exists without its tags is recoverable (re-send
 * it), whereas reporting the whole push as failed would tempt a second send and
 * duplicate the work.
 *
 * TWO outbound calls per lead, and that ceiling is deliberate. Pages Functions on
 * the free plan allow fifty per request; the Leads page used to spend six a lead,
 * so a batch of ten asked for sixty-five and died past the eighth. `extraTags` is
 * what keeps it at two: the power dialer's tag used to be a third call of its own,
 * and a tag is a tag, so it rides along with the run's.
 */
export async function pushScrapedLead(
  env: Env,
  lead: ScrapedLead,
  run: RunForTags,
  channel: Channel,
  // Applied in the SAME call as the run's tags, never a second one.
  extraTags: string[] = [],
): Promise<HandoffResult> {
  if (!isAgencyGhlConfigured(env)) {
    return { ok: false, contactId: null, error: null, notConfigured: true };
  }

  const upserted = await upsertAgencyContact(env, toLeadForPush(lead));
  if (!upserted.ok || !upserted.contactId) {
    return {
      ok: false,
      contactId: upserted.contactId,
      error: upserted.error ?? "GoHighLevel would not accept the contact.",
    };
  }

  const tags = [...new Set([...tagsForLead(lead, run, channel), ...extraTags])];
  try {
    await ghlJson(
      getAgencyGhlContext(env),
      `/contacts/${upserted.contactId}/tags`,
      { method: "POST", body: JSON.stringify({ tags }) },
      // Applying a tag a contact already carries changes nothing, so a 429 here
      // is worth one more try rather than failing a lead that is already made.
      { idempotentPost: true },
    );
  } catch (err) {
    return {
      ok: false,
      contactId: upserted.contactId,
      error: `Contact created, but the tags did not stick: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return { ok: true, contactId: upserted.contactId, error: null };
}
