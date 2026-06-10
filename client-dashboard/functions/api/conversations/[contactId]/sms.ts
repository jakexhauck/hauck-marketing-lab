import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";

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

  return Response.json({
    ok: true,
    messageId: sent.messageId,
    conversationId: sent.conversationId,
  });
};
