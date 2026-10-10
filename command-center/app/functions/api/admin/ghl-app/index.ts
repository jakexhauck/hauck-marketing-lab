import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { createInstallState, installUrl, loadAgencyInstall, missingScopes } from "../../../lib/ghlApp";

// GET /api/admin/ghl-app
//
// Whether the Marketplace app is installed on the agency, and the link that
// installs it. Admin only, enforced upstream in _middleware.ts.
//
// One install covers every sub-account: the agency (Company) token it returns
// is what mints each client's key on demand. So this is asked once, not once
// per client, and Client setup shows the Install button only while it is false.
//
// The URL carries a freshly minted signed state every time. The callback is
// public by necessity and refuses any install it did not start, so a stale
// state is not worth caching.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const agency = await loadAgencyInstall(client);
  const base = installUrl(ctx.env, new URL(ctx.request.url).origin);
  const url = base
    ? `${base}&state=${encodeURIComponent(await createInstallState(ctx.env))}`
    : null;

  // An install missing a scope the app now asks for counts as not installed,
  // so Client setup shows Install app again until it is re-approved.
  const installed = Boolean(agency) && missingScopes(agency?.scopes).length === 0;
  return Response.json({ installed, installUrl: url });
};
