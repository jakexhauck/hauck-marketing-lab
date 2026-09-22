import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { agencyToken } from "../../../lib/ghlApp";
import { annotateLocations, suggestLocationId } from "../../../lib/subaccountLink";

// GET /api/admin/ghl-app/locations?tenantId=
//
// Every sub-account in the agency, each marked with the client that already
// holds it, plus the one that looks like this client's. Admin only, enforced
// upstream in _middleware.ts.
//
// Read with the agency (Company) token, which is the only token that can see
// across sub-accounts: a client's own key can only ever see its own.
//
// Deliberately not cached. A sub-account created thirty seconds ago has to
// appear on the next open, because that is exactly when this is opened.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId") ?? "";

  const agency = await agencyToken(client, ctx.env);
  if (!agency) return Response.json({ error: "app_not_installed" }, { status: 409 });

  const res = await fetch(
    `https://services.leadconnectorhq.com/locations/search?companyId=${encodeURIComponent(
      agency.companyId,
    )}&limit=500`,
    {
      headers: {
        Authorization: `Bearer ${agency.token}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    return Response.json(
      { error: "GoHighLevel refused the sub-account list.", status: res.status },
      { status: 502 },
    );
  }
  const body = (await res.json()) as { locations?: { id: string; name: string }[] };

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, name, ghl_location_id");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const locations = annotateLocations(body.locations ?? [], tenants ?? []);
  const me = (tenants ?? []).find((t) => t.id === tenantId);
  return Response.json({
    locations,
    suggestedId: me ? suggestLocationId(locations, me.name ?? "") : null,
  });
};
