import type { Env, ApiData } from "../../../../../lib/env";
import { readJsonBody } from "../../../../../lib/body";
import { ghlFetch } from "../../../../../lib/ghl";
import { boardGhl } from "../../../../../lib/boardGhl";

// POST /api/admin/cold-sms/prospect/:contactId/send  { body }  (owner only)
//
// A text from the card's panel. GHL sends it from the sub-account's number, the
// same one the cold texts went out on, so the reply lands in the same thread.
// Never retried: a resent POST is a second text on a stranger's phone.

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const board = await boardGhl(ctx.env, ctx.request);
  if (board instanceof Response) return board;
  if (!board) return Response.json({ error: "not_configured" }, { status: 503 });
  const contactId = String(ctx.params.contactId ?? "").trim();
  const body = await readJsonBody<{ body?: unknown }>(ctx.request);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });
  if (!text) return Response.json({ error: "empty_message" }, { status: 400 });
  if (text.length > 1600) return Response.json({ error: "too_long" }, { status: 400 });

  const ghl = board.ghl;
  const res = await ghlFetch(ghl, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify({ type: "SMS", contactId, message: text }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("[cold-sms/send]", res.status, detail);
    // DND / opted out comes back as a 4xx naming it; say that, not "failed".
    if (/dnd|do not disturb|opted? ?out|unsubscribed/i.test(detail)) {
      return Response.json({ error: "opted_out" }, { status: 409 });
    }
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  const sent = (await res.json().catch(() => ({}))) as { messageId?: string };
  return Response.json({ ok: true, messageId: sent.messageId ?? null });
};
