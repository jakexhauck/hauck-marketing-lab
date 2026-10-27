import type { Env, ApiData } from "../../../../../lib/env";
import { readJsonBody } from "../../../../../lib/body";
import { ghlFetch } from "../../../../../lib/ghl";
import { boardGhl } from "../../../../../lib/boardGhl";

// POST /api/admin/cold-sms/prospect/:contactId/tag  { tag, on }  (owner only)
//
// Marks a prospect from the board's right-click menu (Jake, 2026-10-13: "put
// contacted on a card"). A GHL tag on the contact, so it shows in GHL too and
// rides back on the card's tags. Only the tags listed here can be set from the
// board, so this route is not a general tag writer.

export const BOARD_TAGS = ["contacted"] as const;
const ID = /^[A-Za-z0-9]{8,64}$/;

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const board = await boardGhl(ctx.env, ctx.request);
  if (board instanceof Response) return board;
  if (!board) return Response.json({ error: "not_configured" }, { status: 503 });
  const contactId = String(ctx.params.contactId ?? "").trim();
  const body = await readJsonBody<{ tag?: unknown; on?: unknown }>(ctx.request);
  const tag = typeof body?.tag === "string" ? body.tag.trim().toLowerCase() : "";
  if (!ID.test(contactId)) return Response.json({ error: "bad_contact_id" }, { status: 400 });
  if (!(BOARD_TAGS as readonly string[]).includes(tag)) return Response.json({ error: "bad_tag" }, { status: 400 });
  if (typeof body?.on !== "boolean") return Response.json({ error: "bad_on" }, { status: 400 });

  const ghl = board.ghl;
  const res = await ghlFetch(ghl, `/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: body.on ? "POST" : "DELETE",
    body: JSON.stringify({ tags: [tag] }),
  });
  if (!res.ok) {
    console.error("[cold-sms/tag]", res.status, (await res.text()).slice(0, 300));
    return Response.json({ error: "tag_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
};
