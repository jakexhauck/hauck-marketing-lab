import type { Env, ApiData } from "../../../lib/env";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { isConnectPlatform, resolveGhlUserId, startOAuth } from "../../../lib/socialConnect";
import type { GhlContext } from "../../../lib/ghl";

// POST /api/connections/social/start  { platform } -> { url }
//
// Leg 1 of connecting the client's own Facebook page or Instagram account. The
// answer is a Meta consent URL for the browser to open in a popup.
//
// Client-facing, so _middleware.ts has already resolved and authenticated the
// tenant. THE LOCATION COMES FROM THAT SESSION, never from the body: it is what
// makes it impossible to aim the connection at another client's sub-account.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (isPlaceholder(t.ghl_location_id) || isPlaceholder(t.ghl_token)) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await ctx.request.json().catch(() => ({}))) as { platform?: unknown };
  if (!isConnectPlatform(body.platform)) {
    return Response.json({ error: "unknown platform" }, { status: 400 });
  }

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  try {
    const userId = await resolveGhlUserId(gctx);
    const url = await startOAuth(gctx, body.platform, userId);
    return Response.json({ url });
  } catch {
    // White-label: the client never learns whose API just refused us.
    return Response.json({ error: "Could not reach Facebook. Try again." }, { status: 502 });
  }
};
