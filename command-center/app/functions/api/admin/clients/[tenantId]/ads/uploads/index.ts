import type { Env, ApiData } from "../../../../../../lib/env";
import { resolveUploadTarget } from "../../../../../../lib/creativeUploadTarget";
import { listLabelledMedia } from "../../../../../../lib/metaUpload";

// GET /api/admin/clients/:tenantId/ads/uploads -> { items }
//
// The creatives in this client's Meta ad account library that carry a size
// label. Read live from Meta every time, no table: Meta is the library, and a
// copy here would only be a second answer that can disagree with it. The same
// list tells the uploader what to skip as already there.
//
// Admin-only via _middleware.ts.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const target = await resolveUploadTarget(ctx.env, ctx.params.tenantId as string);
  if (target instanceof Response) return target;
  try {
    const items = await listLabelledMedia(target.token, target.account);
    return Response.json({ items });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
