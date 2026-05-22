import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";

interface SendBody {
  body: string;
}

interface SendResponse {
  messageId?: string;
  conversationId?: string;
  msg?: string;
}

export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const id = ctx.params.id as string;
  const body = (await ctx.request.json()) as SendBody;
  if (!body.body?.trim()) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }

  const opp = await ghlJson<{
    opportunity: { contact?: { id?: string }; contactId?: string };
  }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/${encodeURIComponent(id)}`,
  );
  const contactId = opp.opportunity.contact?.id ?? opp.opportunity.contactId;
  if (!contactId) {
    return Response.json({ error: "no_contact" }, { status: 400 });
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
