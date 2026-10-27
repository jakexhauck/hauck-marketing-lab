import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { ghlJson, customFieldDefs } from "../../../../../lib/ghl";
import { boardGhl } from "../../../../../lib/boardGhl";
import { fetchContactThread } from "../../../../../lib/messaging";
import { loadVerdicts } from "../../../../../lib/coldSmsAgency";
import { prospectZone, variationOf } from "../../../../../lib/coldSmsBoard";
import { fetchContactAppointments } from "../../../../../lib/estimateOutcomeGhl";
import { pickSalesAppointment } from "../../../../../lib/salesAppointment";

// GET /api/admin/cold-sms/prospect/:contactId  (owner only)
// GET /api/admin/cold-sms/prospect/:contactId?only=thread&conversationId=...
//
// Everything the card's side panel shows: who they are, the variation they were
// sent, the whole text thread, Claude's verdict, and which timezone they are in
// (for the booking wizard's "their time").
//
// Speed matters here (Jake, 2026-10-13: as little chat delay as possible). The
// GHL reads run side by side, and the panel's refresh after a send and its poll
// ask for the thread alone, keyed by the conversation it already has, which is
// one GHL call instead of four.
//
// ?appointment=1 (the Sales board) also reads their appointment, one more GHL
// call side by side; a failed read just leaves it off.

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
  const board = await boardGhl(ctx.env, ctx.request);
  if (board instanceof Response) return board;
  if (!board) return Response.json({ error: "not_configured" }, { status: 503 });
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });
  const ghl = board.ghl;
  const params = new URL(ctx.request.url).searchParams;

  if (params.get("only") === "thread") {
    const known = (params.get("conversationId") ?? "").trim() || null;
    try {
      const thread = await fetchContactThread(ghl, contactId, known);
      return Response.json({ conversationId: thread.conversationId, messages: thread.messages, threadFailed: false });
    } catch {
      return Response.json({ conversationId: known, messages: [], threadFailed: true });
    }
  }

  const contactRead = ghlJson<{ contact?: RawContact }>(ghl, `/contacts/${encodeURIComponent(contactId)}`).then(
    (r) => ({ contact: r.contact }),
    (err: unknown) => ({ error: err instanceof Error ? err.message : "" }),
  );
  // A failed definitions read just leaves the Service line out.
  const defsRead = customFieldDefs(ghl).catch(() => []);
  const threadRead = fetchContactThread(ghl, contactId).catch(() => null);
  const apptRead =
    params.get("appointment") === "1"
      ? fetchContactAppointments(ghl, contactId)
          .then((a) => pickSalesAppointment(a, Date.now()))
          .catch(() => null)
      : Promise.resolve(null);
  const storedRead = (async () => {
    const db = getServiceClient(ctx.env);
    return db ? loadVerdicts(db, [contactId]).catch(() => new Map()) : new Map();
  })();

  const [read, defs, thread, stored, appointmentAt] = await Promise.all([
    contactRead,
    defsRead,
    threadRead,
    storedRead,
    apptRead,
  ]);
  if ("error" in read) {
    if (/ 404|400/.test(read.error)) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
  const contact = read.contact;
  if (!contact) return Response.json({ error: "not_found" }, { status: 404 });

  // The "Service" custom field (what the cold text pitched), by name, since the
  // field id is the account's own.
  let service = "";
  const serviceId = defs.find((d) => (d.name ?? "").trim().toLowerCase() === "service")?.id;
  const v = serviceId ? contact.customFields?.find((f) => f.id === serviceId)?.value : undefined;
  if (typeof v === "string") service = v.trim();

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
    appointmentAt,
    conversationId: thread?.conversationId ?? null,
    messages: thread?.messages ?? [],
    threadFailed: thread === null,
  });
};
