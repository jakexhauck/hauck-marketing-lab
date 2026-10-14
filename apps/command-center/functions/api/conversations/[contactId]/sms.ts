import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";
import { isInternalContact } from "../../../lib/messaging";
import { isClientVisibleContact } from "../../../lib/handoffScope";

interface SendBody {
  body: string;
}

interface SendResponse {
  messageId?: string;
  conversationId?: string;
  msg?: string;
}

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  const body = await readJsonBody<SendBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }

  // This route is the SMS-only predecessor of send.ts, kept for rollback and no
  // longer called by the app. It still reaches GHL though, so it carries the
  // same two guards send.ts does rather than standing as the way around them:
  // no replying to a notification sink, and no replying to a lead the setter is
  // still working.
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  if (await isInternalContact(gctx, contactId, t.internal_recipients)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (
    !(await isClientVisibleContact(gctx, t.client_inbox_pipeline_id, contactId, t.inbox_visible_tag, t.inbox_show_ad_leads))
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const sent = await ghlJson<SendResponse>(
    gctx,
    `/conversations/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "SMS",
        contactId,
        message: body.body,
      }),
    },
  );

  return Response.json({
    ok: true,
    messageId: sent.messageId,
    conversationId: sent.conversationId,
  });
};
