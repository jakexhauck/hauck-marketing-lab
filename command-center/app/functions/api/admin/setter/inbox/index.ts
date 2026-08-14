import type { Env, ApiData } from "../../../../lib/env";
import { loadInboxPage, parseCursor, parseLimit } from "../../../../lib/inboxFeed";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";

// GET /api/admin/setter/inbox?tenantId=&q=&limit=&cursor= (admin-only, gated
// in _middleware.ts). The client's WHOLE inbox, paged.
//
// The reading and shaping live in lib/inboxFeed.ts, shared with the Operations
// pillar's Inbox (Hauck Marketing's own sub-account). What stays here is the
// half that must NOT be shared:
//
// Credentials come from getGhlContextForTenant ONLY. It throws on a
// half-configured client rather than returning something usable, which is what
// this cross-client screen needs: showing a setter another client's real
// customer conversations would have the send endpoint next door reply to them.
// (resolveGhlCreds used to fall back to the env creds, a live client's, which
// is exactly the hole this rule was written around. It no longer does, and this
// rule stands anyway: one helper for cross-client admin writes.)

// Re-exported so this route's contract and its tests keep naming one place.
export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseLimit,
  parseCursor,
  matchesQuery,
  shapeThread,
  buildDndIndex,
  buildPlacementIndex,
  loadPlacement,
  pagesNeeded,
  isUpstreamCapped,
  pageThreads,
} from "../../../../lib/inboxFeed";
export type { ApiInboxThread, ThreadPlacement } from "../../../../lib/inboxFeed";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseCursor(url.searchParams.get("cursor"));

  let gctx;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }

  try {
    return Response.json(
      await loadInboxPage(gctx, {
        q,
        limit,
        offset,
        internalRecipients: gctx.internal_recipients,
      }),
    );
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
};
