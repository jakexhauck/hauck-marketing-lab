import type { Env, ApiData } from "../../../../lib/env";
import {
  resolveLocationUserId,
  oauthStartUrl,
  OAUTH_PLATFORMS,
  type OAuthPlatform,
} from "../../../../lib/connections";

// GET /api/connections/oauth/:platform/start - returns the provider's own OAuth
// consent URL for the session's client, which the browser then opens. GHL
// captures the callback and the connection lands in the client's sub-account.
// No token is ever returned to the browser.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const platform = ctx.params.platform as OAuthPlatform;
  if (!OAUTH_PLATFORMS.includes(platform)) {
    return Response.json({ error: "Unsupported connection" }, { status: 400 });
  }
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const userId = await resolveLocationUserId(gctx);
  const url = await oauthStartUrl(gctx, platform, userId);
  if (!url) {
    return Response.json(
      { error: "Could not start the connection. Please try again." },
      { status: 502 },
    );
  }
  return Response.json({ url });
};
