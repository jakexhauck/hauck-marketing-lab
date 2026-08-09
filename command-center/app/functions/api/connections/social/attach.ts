import type { Env, ApiData } from "../../../lib/env";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { attachPage, isConnectPlatform, isGhlId } from "../../../lib/socialConnect";
import type { GhlContext } from "../../../lib/ghl";

// POST /api/connections/social/attach { platform, accountId, pageId } -> { page }
//
// Leg 3, the one that actually links the page to the client's sub-account.
//
// The page is re-read from GHL server-side inside attachPage rather than taken
// from this body, so a caller cannot attach something GHL never offered. All
// three inputs are validated to an id shape first: two of them end up in a URL
// path.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (isPlaceholder(t.ghl_location_id) || isPlaceholder(t.ghl_token)) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await ctx.request.json().catch(() => ({}))) as {
    platform?: unknown;
    accountId?: unknown;
    pageId?: unknown;
  };

  if (!isConnectPlatform(body.platform)) {
    return Response.json({ error: "unknown platform" }, { status: 400 });
  }
  if (!isGhlId(body.accountId) || !isGhlId(body.pageId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  try {
    const page = await attachPage(gctx, body.platform, body.accountId, body.pageId);
    return Response.json({ page: { id: page.id, name: page.name, avatar: page.avatar } });
  } catch (e) {
    // "no longer available" is the operator's own doing (they picked a page that
    // vanished between listing and choosing), so it is worth saying plainly.
    const message = (e as Error)?.message ?? "";
    if (message.includes("no longer available")) {
      return Response.json({ error: "That page is no longer available. Try again." }, { status: 409 });
    }
    return Response.json({ error: "Could not connect that page. Try again." }, { status: 502 });
  }
};
