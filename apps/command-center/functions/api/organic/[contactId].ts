import type { Env, ApiData } from "../../lib/env";
import { customFieldDefs, fetchContact, type GhlContext } from "../../lib/ghl";
import { fetchContactThread } from "../../lib/messaging";
import { readableAnswers, type OrganicAnswer } from "../../lib/organic";

// GET /api/organic/:contactId -> what this website lead actually said and typed.
//
// Two sources, because GHL keeps them apart:
//
//   The message. A chat-widget submission lands in the contact's conversation as
//   a TYPE_WEBCHAT message, which lib/messaging normalises to "Live_Chat".
//   TRAP: the conversation itself is usually TYPE_PHONE, because the SMS
//   follow-up takes the thread over. Searching conversations by type=Live_Chat
//   returns nothing on live Willis even though the webchat message is right
//   there. Always fetch the contact's thread and filter the MESSAGES.
//
//   The answers. Form fields arrive as contact custom fields, whatever the
//   automation chose to map. They are read generically and labelled from the
//   location's own field definitions, so mapping a new field in GHL surfaces it
//   here with no code change. lib/organic owns the denylist that keeps agency
//   credentials off a client-facing page.

interface AttributionSource {
  url?: string;
  sessionSource?: string;
  referrer?: string;
}

export interface ApiOrganicDetail {
  contactId: string;
  name: string;
  phone: string;
  email: string;
  // GHL's own "where did this contact come from" string, e.g. "chat widget".
  source: string;
  // The page of the client's site the lead was on when they converted, and how
  // they got there. Both absent on a lead GHL could not attribute.
  landingUrl: string;
  sessionSource: string;
  createdAt: string;
  messages: { id: string; body: string; direction: string; at: string }[];
  answers: OrganicAnswer[];
  // True when GHL refused the custom-field definitions, so `answers` is empty
  // because we could not read it rather than because the lead typed nothing.
  // The UI must say which; a silent empty panel reads as "they filled nothing in".
  answersUnavailable: boolean;
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  // The field definitions are the ONLY thing that makes a custom field readable
  // AND the only thing that makes the denylist work: without them we cannot tell
  // an answer from a stored credential. So a failure here suppresses answers
  // entirely rather than falling back to rendering raw values.
  //
  // It fails in practice: Willis's Private Integration Token has no
  // `locations/customFields.readonly` scope, so this 401s (confirmed live
  // 2026-08-02). Same guard the lead detail route already uses.
  const [contact, defs, thread] = await Promise.all([
    fetchContact(gctx, contactId),
    customFieldDefs(gctx).catch(() => null),
    fetchContactThread(gctx, contactId),
  ]);

  if (!contact) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // The single-contact endpoint returns `attributionSource` (with `url`); the
  // bulk list returns `attributions[]` (with `pageUrl`). Read whichever arrived.
  const raw = contact as typeof contact & {
    attributionSource?: AttributionSource;
    customFields?: { id?: string; value?: unknown }[];
  };
  const attribution =
    raw.attributionSource ??
    (Array.isArray(contact.attributions) && contact.attributions.length > 0
      ? {
          url: contact.attributions[0].pageUrl,
          sessionSource: contact.attributions[0].utmSessionSource,
        }
      : undefined);

  const detail: ApiOrganicDetail = {
    contactId,
    name:
      contact.contactName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    source: contact.source ?? "",
    landingUrl: attribution?.url ?? "",
    sessionSource: attribution?.sessionSource ?? "",
    createdAt: contact.dateAdded ?? "",
    messages: thread.messages
      .filter((m) => m.type === "Live_Chat" && m.body.trim())
      .map((m) => ({ id: m.id, body: m.body, direction: m.direction, at: m.at })),
    answers: defs ? readableAnswers(raw.customFields, defs) : [],
    answersUnavailable: defs === null,
  };

  return Response.json(detail);
};
