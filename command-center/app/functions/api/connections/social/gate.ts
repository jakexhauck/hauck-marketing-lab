import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { fetchSocialAccounts } from "../../social/_lib";
import type { GhlContext } from "../../../lib/ghl";

// GET /api/connections/social/gate -> { blocked, facebook, instagram, reason }
//
// The single question the blocking modal asks: may this client use the app yet?
//
// Computed on the SERVER so the browser is never trusted with the answer, and
// so the rule lives in one place rather than being reassembled from two calls in
// the UI. `blocked` is the only field the gate needs; the rest drives which step
// of the wizard opens and what the admin sees.
//
// Deliberately fails OPEN. If GHL cannot be reached we do not know whether the
// client is connected, and locking somebody out of paid software on the strength
// of an upstream hiccup is worse than letting an unconnected client in for one
// session. The gate reappears the moment the answer is knowable again.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;

  const open = (reason: string) =>
    Response.json({ blocked: false, facebook: false, instagram: false, reason });

  // A client whose GHL is not wired yet cannot connect anything, so gating them
  // would be a locked door with no key. That is an agency-side gap, not theirs.
  if (isPlaceholder(t.ghl_location_id) || isPlaceholder(t.ghl_token)) {
    return open("not_configured");
  }

  const client = getServiceClient(ctx.env);
  if (client) {
    const { data } = await client
      .from("tenants")
      .select("social_gate_waived")
      .eq("slug", t.slug)
      .maybeSingle();
    if (data?.social_gate_waived) return open("waived");
  }

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  let facebook = false;
  let instagram = false;
  try {
    const accounts = await fetchSocialAccounts(gctx);
    facebook = accounts.some((a) => a.platform === "fb");
    instagram = accounts.some((a) => a.platform === "ig");
  } catch {
    return open("upstream_unavailable");
  }

  return Response.json({
    blocked: !(facebook && instagram),
    facebook,
    instagram,
    reason: facebook && instagram ? "connected" : "missing",
  });
};
