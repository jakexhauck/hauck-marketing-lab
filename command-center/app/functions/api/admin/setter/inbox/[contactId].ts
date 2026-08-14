import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { readContactDnd } from "../../../../lib/dnd";
import { ghlFetch, ghlJson } from "../../../../lib/ghl";
import { fetchContactThread, sendChannelMessage } from "../../../../lib/messaging";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import { SEND_ERROR_CODES, shapeMessages } from "../../../../lib/inboxFeed";
import {
  isInternalRecipient,
  parseInternalRecipients,
} from "../../../../lib/internalRecipients";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// GET  /api/admin/setter/inbox/:contactId?tenantId=  one thread, newest last.
// POST /api/admin/setter/inbox/:contactId            send as the client.
// Both admin-only, gated in _middleware.ts.
//
// The POST is the highest-blast-radius write in the app: it messages a real
// customer under the client's name, the recipient cannot tell it came from
// the agency, and there is no undo and no approval step. Two rules follow
// from that and neither may be relaxed:
//
// 1. Credentials come from getGhlContextForTenant ONLY. On this
//    client-switching admin surface, anything that quietly resolved to another
//    account would text a DIFFERENT client's real customers while the setter
//    believed they were on another one. getGhlContextForTenant throws on a
//    half-configured client rather than returning something plausible.
// 2. The audit row is written ONLY after the send actually succeeded. A row for
//    a message that was never delivered is worse than no row: this log is the
//    only record of who messaged whom, since there are no per-setter accounts.
//
//    The converse is NOT guaranteed, and the response says so rather than
//    pretending otherwise. A send can succeed while its audit row does not land
//    (Supabase unreachable, or the insert rejected: Postgres jsonb refuses a NUL
//    byte, which a customer's message body can carry). The message is already
//    gone at that point, so failing the request would be a lie in the other
//    direction. Instead `audited` comes back false and the caller warns the
//    operator that the send happened but was not recorded.

// Shaped in lib/inboxFeed.ts, shared with the Operations pillar's Inbox.
// Re-exported so this route's contract and its tests keep naming one place.
export { shapeMessages } from "../../../../lib/inboxFeed";
export type { ApiThreadMessage } from "../../../../lib/inboxFeed";

export interface SendBody {
  tenantId?: string;
  channel?: string;
  body?: string;
  subject?: string;
}

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

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  const contactId = ctx.params.contactId as string;
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  let gctx;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }

  try {
    // ghlFetch rather than ghlJson so a 404 can be told apart from a CRM
    // outage: "this contact is not in this client's account" is a real
    // answer, not a failure.
    const res = await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}`);
    if (res.status === 404) {
      return Response.json({ error: "contact_not_found" }, { status: 404 });
    }
    if (!res.ok) return Response.json({ error: "ghl_unavailable" }, { status: 502 });
    const data = (await res.json()) as GhlContactResponse;
    const c = data.contact ?? {};

    // The contact is already in hand, so the sink check costs nothing here.
    // Reported as not-found, matching the 404 above: an internal recipient is
    // not a contact this tool works, in either the client app or the setter.
    if (
      isInternalRecipient(c, parseInternalRecipients(gctx.internal_recipients))
    ) {
      return Response.json({ error: "contact_not_found" }, { status: 404 });
    }

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
      messages: shapeMessages(thread.messages),
      // Read from the contact record this handler already fetched, so the
      // composer's warning comes from the SAME record the send will hit rather
      // than from whatever the list happened to cache. The list carries it too
      // (for the row badge); this is the authoritative one.
      dnd: readContactDnd(c),
    });
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const contactId = ctx.params.contactId as string;
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  const body = await readJsonBody<SendBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const tenantId = body.tenantId?.trim();
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  let gctx;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }

  let result;
  try {
    result = await sendChannelMessage(gctx, contactId, {
      channel: body.channel ?? "SMS",
      body: body.body ?? "",
      subject: body.subject,
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

  // Past this line the message is out the door and cannot be recalled, so the
  // audit row is written now and only now.
  //
  // `audited` is reported honestly rather than assumed. No Supabase client means
  // no row; a rejected insert means no row. Either way the customer already has
  // the message, so the response stays 200 and the caller is told the send was
  // not recorded instead of being shown an unqualified success.
  const client = getServiceClient(ctx.env);
  const audited = client
    ? await logAdminAction(client, ctx.data.admin!.id, "setter.send", tenantId, {
        tenantId,
        contactId,
        channel: (body.channel ?? "SMS").trim(),
        body: body.body?.trim() ?? "",
        subject: body.subject?.trim() || undefined,
        messageId: result.messageId ?? null,
      })
    : false;

  if (!audited) {
    console.error(
      `[setter.send] message sent to contact ${contactId} for tenant ${tenantId} was NOT recorded in the audit log`,
    );
  }

  return Response.json({ sent: true, messageId: result.messageId, audited });
};

// DELETE /api/admin/setter/inbox/:contactId?tenantId=
//
// Deletes this contact's conversation(s) in the client's CRM. A contact can
// hold several conversations (one per channel, or after merges), and the
// inbox shows them as ONE thread, so "delete this conversation" means all of
// them; deleting only the newest would leave the thread reappearing with
// older history. Irreversible, so the caller confirms before calling and the
// response reports exact counts rather than a bare ok. The audit row lands
// only after at least one deletion actually happened.
export const onRequestDelete: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  const contactId = ctx.params.contactId as string;
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  let gctx;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }

  let ids: string[];
  try {
    const search = await ghlJson<{ conversations?: { id?: string }[] }>(
      gctx,
      `/conversations/search?locationId=${encodeURIComponent(gctx.locationId)}&contactId=${encodeURIComponent(contactId)}`,
    );
    ids = (search.conversations ?? [])
      .map((c) => c.id)
      .filter((id): id is string => Boolean(id));
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }

  if (ids.length === 0) return Response.json({ deleted: 0, failed: 0 });

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const res = await ghlFetch(gctx, `/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) deleted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  if (deleted > 0) {
    const client = getServiceClient(ctx.env);
    if (client) {
      await logAdminAction(client, ctx.data.admin!.id, "setter.delete_conversation", tenantId, {
        contactId,
        deleted,
        failed,
      });
    }
  }

  // Nothing deleted at all is a failure; a partial delete is a 200 with
  // honest counts so the caller can say "1 of 2 could not be deleted".
  if (deleted === 0) return Response.json({ error: "delete_failed", failed }, { status: 502 });
  return Response.json({ deleted, failed });
};
