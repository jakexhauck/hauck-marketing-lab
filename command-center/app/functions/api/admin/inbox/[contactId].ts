import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { readContactDnd } from "../../../lib/dnd";
import { ghlFetch } from "../../../lib/ghl";
import { fetchContactThread, sendChannelMessage } from "../../../lib/messaging";
import { AgencyGhlError, getAgencyGhlContext } from "../../../lib/agencyGhl";
import { SEND_ERROR_CODES, shapeMessages } from "../../../lib/inboxFeed";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// GET  /api/admin/inbox/:contactId   one thread in the agency's own account.
// POST /api/admin/inbox/:contactId   send a text as Hauck Marketing.
// Both admin-only, gated in _middleware.ts.
//
// SMS only, on purpose. This is the account the cold call works: the outbound
// channel is a text, and a channel picker here would offer three ways to do
// one job. The GET still renders whatever a thread already holds, so an email
// or a Facebook message that landed in this account is readable; the reply is a
// text.
//
// Two rules carried over from the Setter Suite's send, and neither may be
// relaxed. This one messages a real person under the agency's name, the
// recipient cannot tell it did not come from Jake's phone, and there is no undo:
//
// 1. Credentials come from getAgencyGhlContext ONLY, which throws when the
//    agency pair is unset rather than resolving to a client's account.
// 2. The audit row is written ONLY after the send actually succeeded, and its
//    failure is reported rather than assumed away: `audited` false means the
//    text went out but was not recorded.

interface GhlContactResponse {
  contact?: {
    id?: string;
    contactName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dnd?: boolean;
    dndSettings?: Record<string, { status?: string; message?: string } | null | undefined>;
  };
}

export interface AgencySendBody {
  body?: string;
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (e) {
    if (!(e instanceof AgencyGhlError)) throw e;
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    // ghlFetch rather than ghlJson so a 404 can be told apart from a CRM
    // outage: "this contact is not in the agency's account" is a real answer,
    // not a failure.
    const res = await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}`);
    if (res.status === 404) {
      return Response.json({ error: "contact_not_found" }, { status: 404 });
    }
    if (!res.ok) return Response.json({ error: "ghl_unavailable" }, { status: 502 });
    const data = (await res.json()) as GhlContactResponse;
    const c = data.contact ?? {};

    const name =
      c.contactName ||
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
      c.email ||
      c.phone ||
      "Unknown";

    const thread = await fetchContactThread(gctx, contactId);

    return Response.json({
      contactId,
      name,
      phone: c.phone ?? "",
      messages: shapeMessages(thread.messages),
      // Read from the contact record this handler already fetched, so the
      // composer's warning comes from the SAME record the send will hit rather
      // than from whatever the list happened to cache.
      dnd: readContactDnd(c),
    });
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  const input = await readJsonBody<AgencySendBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (e) {
    if (!(e instanceof AgencyGhlError)) throw e;
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  let result;
  try {
    result = await sendChannelMessage(gctx, contactId, {
      channel: "SMS",
      body: input.body ?? "",
    });
  } catch {
    // A throw here is a transport/CRM failure, so the message did NOT go out.
    // Fall through to 502 without auditing.
    return Response.json({ error: "send_failed" }, { status: 502 });
  }

  // Validation rejection: nothing was sent, so nothing is audited.
  if ("error" in result) {
    const code = SEND_ERROR_CODES[result.error.code] ?? result.error.code;
    return Response.json({ error: code }, { status: result.error.status });
  }

  // Past this line the text is out the door and cannot be recalled, so the
  // audit row is written now and only now. No target tenant: this message
  // belongs to the agency's own account, not to a client.
  const client = getServiceClient(ctx.env);
  const audited = client
    ? await logAdminAction(client, ctx.data.admin!.id, "agency_inbox.send", null, {
        contactId,
        channel: "SMS",
        body: input.body?.trim() ?? "",
        messageId: result.messageId ?? null,
      })
    : false;

  if (!audited) {
    console.error(
      `[agency_inbox.send] message sent to contact ${contactId} was NOT recorded in the audit log`,
    );
  }

  return Response.json({ sent: true, messageId: result.messageId, audited });
};
