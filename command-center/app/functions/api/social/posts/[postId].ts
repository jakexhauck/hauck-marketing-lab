import type { Env, ApiData } from "../../../lib/env";
import type { GhlContext } from "../../../lib/ghl";
import { deleteSocialPost } from "../_lib";

// DELETE /api/social/posts/:postId -> { ok }. Powers the My Posts trash action.
// Terminal write against the client's GHL Social Planner. Edit (PUT) is out of
// v1 scope; the composer only creates.

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const postId = ctx.params.postId as string;
  if (!postId) return Response.json({ error: "postId required" }, { status: 400 });

  await deleteSocialPost(gctx, postId);
  return Response.json({ ok: true });
};
