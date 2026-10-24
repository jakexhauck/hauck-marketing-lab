import type { Env, ApiData } from "../../../lib/env";
import { ownerCallTag } from "../../../lib/appCall";
import { fireCallTag } from "../../../lib/callNowHandler";
import { logErrorBestEffort } from "../../../lib/errorLog";

// POST /api/contacts/<contactId>/call
//
// The in-app Call button. Same mechanism as the owner's texted Call Now link:
// tag the contact (`call now`, or `client app call` on the restructured
// snapshot, see ownerCallTag), and the sub-account's workflow rings the
// owner, then dials the lead and bridges them on the business number.
//
// The tenant's own GHL credentials do the tagging, so a contact id from another
// sub-account simply fails at GHL rather than ringing anyone.

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const contactId = String(ctx.params.contactId ?? "");
  if (!/^[A-Za-z0-9]{8,64}$/.test(contactId)) {
    return Response.json({ error: "bad_contact_id" }, { status: 400 });
  }

  try {
    const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
    await fireCallTag(gctx, contactId, await ownerCallTag(gctx));
  } catch (err) {
    logErrorBestEffort(ctx.env, "in-app-call", String(err), {
      locationId: t.ghl_location_id,
      contactId,
    });
    return Response.json({ error: "call_failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
};
