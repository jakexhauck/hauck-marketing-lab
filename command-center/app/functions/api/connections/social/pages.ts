import type { Env, ApiData } from "../../../lib/env";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { isConnectPlatform, isGhlId, listPages } from "../../../lib/socialConnect";
import type { GhlContext } from "../../../lib/ghl";

// GET /api/connections/social/pages?platform=&accountId= -> { pages }
//
// Leg 2: which pages/accounts the consent just granted us. `accountId` is minted
// by GHL's finish page and reaches the browser by postMessage, so it is treated
// as untrusted input: validated to an id shape before it is put in a URL path.
//
// `raw` is stripped on the way out. The browser only needs to draw a list and
// hand back an id; GHL's own record is re-read server-side at attach time.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (isPlaceholder(t.ghl_location_id) || isPlaceholder(t.ghl_token)) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const url = new URL(ctx.request.url);
  const platform = url.searchParams.get("platform");
  const accountId = url.searchParams.get("accountId");

  if (!isConnectPlatform(platform)) {
    return Response.json({ error: "unknown platform" }, { status: 400 });
  }
  if (!isGhlId(accountId)) {
    return Response.json({ error: "bad accountId" }, { status: 400 });
  }

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  try {
    const pages = await listPages(gctx, platform, accountId);
    return Response.json({
      pages: pages.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
    });
  } catch {
    return Response.json({ error: "Could not read your pages. Try again." }, { status: 502 });
  }
};
