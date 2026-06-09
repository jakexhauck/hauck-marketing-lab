import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { sendChannelMessage, type SendInput } from "../../../lib/messaging";

// Channel-aware send for the leads path: resolves the opportunity's contact,
// then delegates to the same shared sender as the conversations route.
export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const id = ctx.params.id as string;
  const input = (await ctx.request.json()) as SendInput;

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

  const result = await sendChannelMessage(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    contactId,
    input,
  );

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
