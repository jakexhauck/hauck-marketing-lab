import type { Env, ApiData } from "../../../lib/env";
import { channelMeta, fetchContactThread } from "../../../lib/messaging";

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

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
