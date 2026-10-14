import type { Env, ApiData } from "../../../lib/env";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";

// GET /api/admin/cold-call/crm  (admin-only, gated in _middleware.ts)
//
// Which GoHighLevel sub-account the cold call book lives in, so the call card
// can build a link to a prospect's contact record and the caller dials from the
// agency's number instead of their own handset.
//
// Its own route rather than a field on /pipelines, which is the only other place
// the agency location id could have come from: that route makes two live calls
// to GoHighLevel to list the boards, and the call card needs none of them. This
// one reads the environment and nothing else, which is why the browser can hold
// it for the whole session.
//
// The token is never returned. Only the location id leaves here, and only to a
// signed-in admin, which is the same thing every client-side CRM link on this
// app already carries.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) {
    return Response.json({ configured: false, locationId: "" });
  }

  const agency = getAgencyGhlContext(ctx.env);
  return Response.json({ configured: true, locationId: agency.locationId });
};
