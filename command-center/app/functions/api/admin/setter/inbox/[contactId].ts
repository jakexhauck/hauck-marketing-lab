import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { ghlFetch } from "../../../../lib/ghl";
import {
  fetchContactThread,
  sendChannelMessage,
  type ThreadMessage,
} from "../../../../lib/messaging";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
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
// 1. Credentials come from getGhlContextForTenant ONLY. resolveGhlCreds in
//    tenantResolve.ts falls back to env.GHL_LOCATION_ID / env.GHL_TOKEN,
//    which hold a live production client's credentials. On this
//    client-switching admin surface that fallback would text a DIFFERENT
//    client's real customers while the setter believed they were on the test
//    account. getGhlContextForTenant throws instead of falling back.
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

export interface ApiThreadMessage {
  id: string;
  direction: string;
  channel: string;
  body: string;
  sentAt: string;
}

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
  };
}

// sendChannelMessage's codes predate this contract (it backs the client app's
// own send routes too). Map its vocabulary onto the documented one rather
// than renaming it there, which would change two live client-facing routes.
const SEND_ERROR_CODES: Record<string, string> = {
  empty_message: "missing_body",
  subject_required: "missing_subject",
};

// Pure: rename the lib's thread shape onto the API contract.
export function shapeMessages(messages: ThreadMessage[]): ApiThreadMessage[] {
  return messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    channel: m.type,
    body: m.body,
    sentAt: m.at,
  }));
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
