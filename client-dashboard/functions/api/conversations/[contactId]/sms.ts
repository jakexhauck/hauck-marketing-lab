import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { admin } from "../../../lib/supabase-admin";

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
  const body = (await ctx.request.json()) as SendBody;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }

  const sent = await ghlJson<SendResponse>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
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

  await admin(ctx.env)
    .from("activity_log")
    .insert({
      tenant_id: t.id,
      user_id: ctx.data.userId,
      action: "conversation.sms.send",
      payload: { contactId, length: body.body.length, ghl: sent },
    });

  return Response.json({
    ok: true,
    messageId: sent.messageId,
    conversationId: sent.conversationId,
  });
};
