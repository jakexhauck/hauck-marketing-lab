import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { linkSubaccount } from "../../../../lib/subaccountLinkRun";

// POST /api/admin/clients/:tenantId/subaccount   { locationId }
//
// The client sheet's Link button: the moment a client's software account starts
// reading their own GoHighLevel sub-account. Admin only, enforced upstream in
// _middleware.ts. The link itself, and the order it runs in, is in
// lib/subaccountLinkRun.ts.
//
// A LIVE client may be re-linked through this same endpoint, deliberately.
// There is no separate unlink: clearing a client back to nothing is the move
// that empties their app, and swapping them to a sub-account that has just
// answered a real read is not. The warning for a live client lives on the
// button (SubaccountCard), where the client's name can be said out loud.

export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  let body: { locationId?: unknown } = {};
  try {
    body = (await ctx.request.json()) as { locationId?: unknown };
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";

  const result = await linkSubaccount(
    client,
    ctx.env,
    tenantId,
    locationId,
    new URL(ctx.request.url).origin,
    ctx.data.admin?.id ?? null,
  );
  if (!result.ok) {
    return Response.json(
      result.code ? { error: result.error, code: result.code } : { error: result.error },
      { status: result.status },
    );
  }
  return Response.json(result);
};
