import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";

interface SearchResp {
  conversations?: {
    id: string;
    contactId?: string;
    lastMessageDate?: string;
  }[];
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

  const list = (msgs.messages?.messages ?? []).map((m) => ({
    id: m.id,
    body: m.body ?? "",
    direction: (m.direction ?? "outbound").toLowerCase(),
    type: m.type ?? m.messageType ?? "SMS",
    at: m.dateAdded ?? new Date().toISOString(),
  }));
  list.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return Response.json({ conversationId: conv.id, messages: list });
};
