import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { channelMeta, fetchContactThread } from "../../../lib/messaging";

export const onRequestGet: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const id = ctx.params.id as string;

  const opp = await ghlJson<{
    opportunity: { contact?: { id?: string }; contactId?: string };
  }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/${encodeURIComponent(id)}`,
  );
  const contactId = opp.opportunity.contact?.id ?? opp.opportunity.contactId;
  if (!contactId) return Response.json({ messages: [] });

  const thread = await fetchContactThread(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    contactId,
  );

  return Response.json({
    conversationId: thread.conversationId,
    messages: thread.messages,
    truncated: thread.truncated,
    unreadCount: thread.unreadCount,
    ...channelMeta(thread.messages),
  });
};
