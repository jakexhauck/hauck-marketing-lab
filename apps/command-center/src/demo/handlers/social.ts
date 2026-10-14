import type { DemoRoute } from "./index";
import { DEMO_SOCIAL_ACCOUNTS, DEMO_SOCIAL_POSTS, type SocialPost } from "../../lib/social";

// Demo cases for the Social Planner surfaces. Auto-registered (see ./index.ts);
// no edit to handler.ts. These only fire if a Social hook actually runs in a
// demo tab; the route files still render their own richer demo constants. Writes
// echo without mutating a store (the composer's demo path just toasts).

function respond(ctx: { clean: string; seg: string[]; method: string; body: Record<string, unknown> }): unknown {
  const { clean, seg, method, body } = ctx;

  if (clean === "/api/social/accounts") {
    return { accounts: DEMO_SOCIAL_ACCOUNTS, connected: true };
  }

  // /api/social/posts  (list GET, create POST)
  if (clean === "/api/social/posts") {
    if (method === "POST") {
      const post: SocialPost = {
        id: `demo-new-${DEMO_SOCIAL_POSTS.length + 1}`,
        summary: typeof body.summary === "string" ? body.summary : "",
        status: body.status === "scheduled" ? "scheduled" : "draft",
        scheduleAt: typeof body.scheduleAt === "string" ? body.scheduleAt : null,
        publishedAt: null,
        platforms: Array.isArray(body.platforms) ? (body.platforms as SocialPost["platforms"]) : [],
        mediaUrls: [],
      };
      return { post };
    }
    // Demo routes receive the path without its query string, so status filtering
    // is not applied here; the route files render their own demo constants and
    // this fallback just needs to resolve cleanly.
    return { posts: DEMO_SOCIAL_POSTS, total: DEMO_SOCIAL_POSTS.length };
  }

  // /api/social/posts/:id  (DELETE)
  if (seg[0] === "api" && seg[1] === "social" && seg[2] === "posts" && seg[3] && method === "DELETE") {
    return { ok: true };
  }

  return { error: "unhandled" };
}

export const route: DemoRoute = {
  match: (clean, seg) =>
    clean === "/api/social/accounts" ||
    clean === "/api/social/posts" ||
    (seg[0] === "api" && seg[1] === "social" && seg[2] === "posts" && Boolean(seg[3])),
  respond,
};
