import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";
import {
  sendChannelMessage,
  isInternalContact,
  type SendInput,
} from "../../../lib/messaging";

// Channel-aware send for the leads path: resolves the opportunity's contact,
// then delegates to the same shared sender as the conversations route.
export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const id = ctx.params.id as string;
  const input = await readJsonBody<SendInput>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });

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

  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  if (await isInternalContact(gctx, contactId, t.internal_recipients)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await sendChannelMessage(gctx, contactId, input);

  if ("error" in result) {
    return Response.json(
      { error: result.error.code },
      { status: result.error.status },
    );
  }

  return Response.json({
    ok: true,
    messageId: result.messageId,
    conversationId: result.conversationId,
  });
};
