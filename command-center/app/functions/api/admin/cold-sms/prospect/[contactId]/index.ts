import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { ghlJson, customFieldDefs } from "../../../../../lib/ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../../../lib/agencyGhl";
import { fetchContactThread } from "../../../../../lib/messaging";
import { loadVerdicts } from "../../../../../lib/coldSmsAgency";
import { prospectZone, variationOf } from "../../../../../lib/coldSmsBoard";

// GET /api/admin/cold-sms/prospect/:contactId  (owner only)
//
// Everything the card's side panel shows: who they are, the variation they were
// sent, the whole text thread, Claude's verdict, and which timezone they are in
// (for the booking wizard's "their time").

interface RawContact {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  timezone?: string;
  website?: string;
  tags?: string[];
  customFields?: { id: string; value?: unknown }[];
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });
  const agency = getAgencyGhlContext(ctx.env);

  let contact: RawContact | undefined;
  try {
    contact = (await ghlJson<{ contact?: RawContact }>(agency, `/contacts/${encodeURIComponent(contactId)}`)).contact;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/ 404|400/.test(msg)) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
  if (!contact) return Response.json({ error: "not_found" }, { status: 404 });

  // The "Service" custom field (what the cold text pitched), by name, since the
  // field id is the account's own. A failed definitions read just leaves it out.
  let service = "";
  try {
    const defs = await customFieldDefs(agency);
    const id = defs.find((d) => (d.name ?? "").trim().toLowerCase() === "service")?.id;
    const v = id ? contact.customFields?.find((f) => f.id === id)?.value : undefined;
    if (typeof v === "string") service = v.trim();
  } catch {
    /* cosmetic */
  }

  const [thread, stored] = await Promise.all([
    fetchContactThread(agency, contactId).catch(() => null),
    (async () => {
      const db = getServiceClient(ctx.env);
      return db ? loadVerdicts(db, [contactId]).catch(() => new Map()) : new Map();
    })(),
  ]);

  const zone = prospectZone({ timezone: contact.timezone, state: contact.state, phone: contact.phone });
  const row = stored.get(contactId);

  return Response.json({
    contact: {
      id: contact.id,
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      business: (contact.companyName ?? "").trim(),
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      city: contact.city ?? "",
      state: contact.state ?? "",
      website: contact.website ?? "",
      service,
      tags: contact.tags ?? [],
      variation: variationOf(contact.tags),
    },
    zone,
    verdict: row?.verdict ?? null,
    messages: thread?.messages ?? [],
    threadFailed: thread === null,
  });
};
