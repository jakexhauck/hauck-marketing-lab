import type { Env, ApiData } from "../../../lib/env";
import type { GhlContext } from "../../../lib/ghl";
import {
  fetchSocialAccounts,
  fetchSocialPosts,
  fetchLocationUserId,
  createSocialPost,
  platformMap,
  normalizePlatform,
  type SocialPost,
  type SocialPlatform,
} from "../_lib";

// The one posts endpoint that powers My Posts, the Calendar, and Overview.
//
// GET  /api/social/posts?status=&from=&to=  -> { posts, total }
//   Reads every post once (accounts resolved first so platforms can be joined),
//   then filters by status and by date window in-app. Date filtering is done
//   here, not sent to GHL, because the posts/list date params were unconfirmed
//   in Task 0 and risked a 422. Degrades to an empty list on any GHL error.
//
// POST /api/social/posts  { platforms, summary, status, scheduleAt? } -> { post }
//   Maps the selected fb/ig/gb platforms to the client's connected account ids
//   and creates a draft or scheduled post. Terminal write, no retry.

interface PostsResponse {
  posts: SocialPost[];
  total: number;
}

const EMPTY: PostsResponse = { posts: [], total: 0 };

function ms(v: string | null): number | undefined {
  if (!v) return undefined;
  const t = +new Date(v);
  return Number.isFinite(t) ? t : undefined;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const url = new URL(ctx.request.url);
  const status = url.searchParams.get("status"); // scheduled | draft | posted | failed
  const fromMs = ms(url.searchParams.get("from"));
  const toMs = ms(url.searchParams.get("to"));

  let posts: SocialPost[];
  try {
    const accounts = await fetchSocialAccounts(gctx);
    posts = await fetchSocialPosts(gctx, platformMap(accounts));
  } catch {
    return Response.json(EMPTY);
  }

  let filtered = posts;
  if (status) filtered = filtered.filter((p) => p.status === status);
  if (fromMs !== undefined || toMs !== undefined) {
    filtered = filtered.filter((p) => {
      const when = ms(p.scheduleAt) ?? ms(p.publishedAt);
      if (when === undefined) return false;
      if (fromMs !== undefined && when < fromMs) return false;
      if (toMs !== undefined && when > toMs) return false;
      return true;
    });
  }

  return Response.json({ posts: filtered, total: filtered.length });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  let body: {
    platforms?: unknown;
    summary?: unknown;
    status?: unknown;
    scheduleAt?: unknown;
  };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) return Response.json({ error: "summary required" }, { status: 400 });

  const status = body.status === "scheduled" ? "scheduled" : "draft";
  const scheduleAt = typeof body.scheduleAt === "string" ? body.scheduleAt : null;
  if (status === "scheduled" && !scheduleAt) {
    return Response.json({ error: "scheduleAt required to schedule" }, { status: 400 });
  }

  const wanted = new Set<SocialPlatform>();
  if (Array.isArray(body.platforms)) {
    for (const p of body.platforms) {
      const norm = normalizePlatform(p);
      if (norm) wanted.add(norm);
    }
  }
  if (wanted.size === 0) {
    return Response.json({ error: "at least one platform required" }, { status: 400 });
  }

  // Resolve the client's connected account ids for the requested platforms. If
  // none of the requested platforms are actually connected, refuse rather than
  // post to nothing.
  const accounts = await fetchSocialAccounts(gctx);
  const map = platformMap(accounts);
  const accountIds = accounts.filter((a) => wanted.has(a.platform)).map((a) => a.id);
  if (accountIds.length === 0) {
    return Response.json({ error: "no connected account for those platforms" }, { status: 409 });
  }

  // GHL requires the authoring userId on create (confirmed live: omitting it
  // 422s "userId must be a string").
  const userId = await fetchLocationUserId(gctx);
  if (!userId) {
    return Response.json({ error: "no authoring user for this location" }, { status: 409 });
  }

  const post = await createSocialPost(gctx, { accountIds, userId, summary, status, scheduleAt }, map);
  return Response.json({ post });
};
