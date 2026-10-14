import type { Env, ApiData } from "../../../../../lib/env";
import { ghlJson } from "../../../../../lib/ghl";
import { agencyGhlUserId, getAgencyGhlContext, isAgencyGhlConfigured } from "../../../../../lib/agencyGhl";
import { CALL_NOW_TAG } from "../../../../../lib/callNow";
import { fireCallTag } from "../../../../../lib/callNowHandler";

// POST /api/admin/cold-sms/prospect/:contactId/call  (owner only)
//
// The panel's Call button. Tags the prospect `call now` in the agency account and
// Jake's GHL workflow on that tag rings his phone, then dials the prospect from
// the GHL number (Jake, 2026-10-13: the tag, not the CC Bridge Dial workflow).
// Same mechanism as the client app's Call buttons (lib/callNowHandler.ts).
//
// The contact is assigned to Jake first: GHL's Call action rings the ASSIGNED
// user, and the company line when nobody is. A failed assign still calls.

const ID = /^[A-Za-z0-9]{8,64}$/;

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ ok: false, message: "GoHighLevel is not connected." });
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!ID.test(contactId)) return Response.json({ error: "bad_contact_id" }, { status: 400 });

  const agency = getAgencyGhlContext(ctx.env);
  try {
    await ghlJson(agency, `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PUT",
      body: JSON.stringify({ assignedTo: agencyGhlUserId(ctx.env) }),
    });
  } catch (err) {
    console.warn("[cold-sms/call] assign", err instanceof Error ? err.message : err);
  }

  try {
    await fireCallTag({ token: agency.token, locationId: agency.locationId }, contactId, CALL_NOW_TAG);
  } catch (err) {
    console.error("[cold-sms/call] tag", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, message: "GoHighLevel did not take the call now tag" });
  }
  return Response.json({ ok: true });
};
