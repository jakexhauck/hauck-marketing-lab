import type { Env, ApiData } from "../../../lib/env";
import { AgencyGhlError, getAgencyGhlContext } from "../../../lib/agencyGhl";
import { loadInboxPage, parseCursor, parseLimit } from "../../../lib/inboxFeed";

// GET /api/admin/inbox?q=&limit=&cursor= (admin-only, gated in _middleware.ts).
//
// Hauck Marketing's OWN inbox: the sub-account the cold call texts from, not a
// client's. Every other inbox in this app is pinned to a tenant, which is why
// the messages the agency itself sends and receives were readable only inside
// GoHighLevel.
//
// Credentials come from getAgencyGhlContext ONLY, which throws when the pair is
// unset rather than falling back to a client's. That is the whole safety
// property of this route: the send endpoint next door replies as whoever these
// credentials belong to, and a fallback would answer a client's customer under
// the agency's name, or the reverse.
//
// The reading and shaping are the Setter inbox's, shared through
// lib/inboxFeed.ts. No internal-recipient list is passed: that is a per-client
// setting for hiding a client's notification sinks, and this account has none.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseCursor(url.searchParams.get("cursor"));

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (e) {
    if (!(e instanceof AgencyGhlError)) throw e;
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    return Response.json(await loadInboxPage(gctx, { q, limit, offset }));
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
};
