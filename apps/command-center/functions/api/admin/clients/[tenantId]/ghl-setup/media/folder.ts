import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { fail, setupCtx } from "../_shared";

// POST /api/admin/clients/:tenantId/ghl-setup/media/folder  { name, parentId? } -> { ok }
//
// A folder in GHL's Media Storage (New Folder).

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const body = (await ctx.request.json().catch(() => null)) as { name?: unknown; parentId?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return Response.json({ error: "The folder needs a name." }, { status: 400 });
  try {
    const payload: Record<string, unknown> = { altId: s.g.locationId, altType: "location", name };
    if (typeof body?.parentId === "string" && body.parentId) payload.parentId = body.parentId;
    await ghlJson(s.g, `/medias/folder`, { method: "POST", body: JSON.stringify(payload) });
    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
};
