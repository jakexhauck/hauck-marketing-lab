import type { Env, ApiData } from "../../../lib/env";
import { sendChannelMessage, type SendInput } from "../../../lib/messaging";

// Channel-aware send: { channel, body, subject? }. Supersedes the SMS-only
// sms.ts (kept for rollback). Maps channel -> GHL type via the shared helper.
export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const input = (await ctx.request.json()) as SendInput;
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
