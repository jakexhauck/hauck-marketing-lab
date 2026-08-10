import type { Env, ApiData } from "../../../lib/env";
import {
  channelMeta,
  fetchContactThread,
  isInternalContact,
} from "../../../lib/messaging";
import { isClientVisibleContact } from "../../../lib/handoffScope";

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

  // A lead the setter is still working is not the client's to read, even with
  // its contact id in hand. Filtering the list alone would leave every thread in
  // the location one hand-typed URL away. Same 404 as above, for the same
  // reason: a thread they were never handed must not read as an empty one.
  if (
    !(await isClientVisibleContact(gctx, t.client_inbox_pipeline_id, contactId))
  ) {
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
