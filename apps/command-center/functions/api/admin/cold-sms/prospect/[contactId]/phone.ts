import type { Env, ApiData } from "../../../../../lib/env";
import { readJsonBody } from "../../../../../lib/body";
import { ghlFetch } from "../../../../../lib/ghl";
import { boardGhl } from "../../../../../lib/boardGhl";
import { toE164 } from "../../../../../lib/agencyCrm";

// POST /api/admin/cold-sms/prospect/:contactId/phone  { phone }  (owner only)
//
// Replaces the prospect's number on the GHL contact (Jake, 2026-10-13), so the
// next text, call and booking go to it. Normalised to +1XXXXXXXXXX first. GHL
// refuses a number another contact already has (its duplicate rule); that comes
// back as "taken" so the panel can say so.

const ID = /^[A-Za-z0-9]{8,64}$/;

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const board = await boardGhl(ctx.env, ctx.request);
  if (board instanceof Response) return board;
  if (!board) return Response.json({ error: "not_configured" }, { status: 503 });
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!ID.test(contactId)) return Response.json({ error: "bad_contact_id" }, { status: 400 });
  const body = await readJsonBody<{ phone?: unknown }>(ctx.request);
  const phone = toE164(typeof body?.phone === "string" ? body.phone : "");
  if (!phone) return Response.json({ error: "bad_phone" }, { status: 400 });

  const res = await ghlFetch(board.ghl, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("[cold-sms/phone]", res.status, detail);
    if (/duplicate|already exist/i.test(detail)) return Response.json({ error: "taken" }, { status: 409 });
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
  return Response.json({ ok: true, phone });
};
