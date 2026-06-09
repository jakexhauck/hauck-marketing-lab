import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { channelMeta } from "../../../lib/messaging";

interface SearchResp {
  conversations?: { id: string; contactId?: string }[];
}

interface MessagesResp {
  messages?: {
    messages?: {
      id: string;
      body?: string;
      direction?: string;
      dateAdded?: string;
      type?: string;
      messageType?: string;
    }[];
  };
}

function isSystemMessage(type?: string): boolean {
  if (!type) return false;
  const upper = type.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const search = await ghlJson<SearchResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/conversations/search?locationId=${encodeURIComponent(t.ghl_location_id)}&contactId=${encodeURIComponent(contactId)}`,
  );
  const conv = search.conversations?.[0];
  if (!conv) return Response.json({ messages: [] });

  const msgs = await ghlJson<MessagesResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/conversations/${encodeURIComponent(conv.id)}/messages`,
  );

  const list = (msgs.messages?.messages ?? [])
    .filter((m) => !isSystemMessage(m.type ?? m.messageType))
    .map((m) => ({
      id: m.id,
      body: m.body ?? "",
      direction: (m.direction ?? "outbound").toLowerCase(),
      type: m.type ?? m.messageType ?? "SMS",
      at: m.dateAdded ?? new Date().toISOString(),
    }));
  list.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return Response.json({
    conversationId: conv.id,
    messages: list,
    ...channelMeta(list),
  });
};
