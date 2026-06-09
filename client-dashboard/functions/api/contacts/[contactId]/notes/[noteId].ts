import type { Env, ApiData } from "../../../../lib/env";
import { ghlFetch, ghlJson } from "../../../../lib/ghl";

interface GhlNote {
  id: string;
  body: string;
  dateAdded?: string;
  userId?: string;
}

interface UpdateBody {
  body?: string;
}

export const onRequestPut: PagesFunction<
  Env,
  "contactId" | "noteId",
  ApiData
> = async (ctx) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  const noteId = ctx.params.noteId as string;
  if (!contactId || !noteId) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }

  const input = (await ctx.request.json()) as UpdateBody;
  const body = input.body?.trim();
  if (!body) {
    return Response.json({ error: "empty_note" }, { status: 400 });
  }

  const updated = await ghlJson<{ note?: GhlNote }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "PUT", body: JSON.stringify({ body }) },
  );

  return Response.json({ note: updated.note ?? null });
};

export const onRequestDelete: PagesFunction<
  Env,
  "contactId" | "noteId",
  ApiData
> = async (ctx) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  const noteId = ctx.params.noteId as string;
  if (!contactId || !noteId) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }

  const res = await ghlFetch(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    const text = await res.text();
    return new Response(
      JSON.stringify({
        error: "ghl_error",
        status: res.status,
        body: text.slice(0, 500),
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  return Response.json({ ok: true });
};
