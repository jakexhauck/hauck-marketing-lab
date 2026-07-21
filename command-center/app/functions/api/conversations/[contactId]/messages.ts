import type { Env, ApiData } from "../../../lib/env";
import {
  channelMeta,
  fetchContactThread,
  isInternalContact,
} from "../../../lib/messaging";

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  // 404 rather than an empty thread: a notification sink must not look like a
  // real contact who happens to have no history.
  if (await isInternalContact(gctx, contactId, t.internal_recipients)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const thread = await fetchContactThread(gctx, contactId);

  return Response.json({
    conversationId: thread.conversationId,
    messages: thread.messages,
    truncated: thread.truncated,
    unreadCount: thread.unreadCount,
    ...channelMeta(thread.messages),
  });
};
