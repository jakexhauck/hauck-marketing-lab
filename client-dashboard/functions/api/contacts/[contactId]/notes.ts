import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";

interface GhlNote {
  id: string;
  body: string;
  dateAdded?: string;
  userId?: string;
}

interface NotesResp {
  notes?: GhlNote[];
}

interface CreateBody {
  body?: string;
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const data = await ghlJson<NotesResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/notes`,
  );

  const notes = (data.notes ?? []).sort(
    (a, b) => +new Date(b.dateAdded ?? 0) - +new Date(a.dateAdded ?? 0),
  );

  return Response.json({ notes });
};

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const input = (await ctx.request.json()) as CreateBody;
  const body = input.body?.trim();
  if (!body) {
    return Response.json({ error: "empty_note" }, { status: 400 });
  }

  const created = await ghlJson<{ note?: GhlNote }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/notes`,
    { method: "POST", body: JSON.stringify({ body }) },
  );

  return Response.json({ note: created.note ?? null });
};
