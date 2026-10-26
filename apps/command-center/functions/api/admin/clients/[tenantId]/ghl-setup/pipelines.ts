import type { Env, ApiData } from "../../../../../lib/env";
import { ghlJson } from "../../../../../lib/ghl";
import { shapeSetupPipelines } from "../../../../../lib/ghlSetup";
import { fail, loc, setupCtx } from "./_shared";

// GET /api/admin/clients/:tenantId/ghl-setup/pipelines -> { pipelines }
//
// Client > GHL > Pipelines (checklist B1). Read only: GHL's API has no pipeline
// create, edit or delete, so the page checks and links into GHL for the delete.
// Each pipeline carries its opportunity count, so a delete never takes deals
// nobody looked at.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    const pipelines = shapeSetupPipelines(await ghlJson<unknown>(s.g, `/opportunities/pipelines?locationId=${loc(s.g)}`));
    const counted = await Promise.all(
      pipelines.map(async (p) => {
        const r = await ghlJson<{ meta?: { total?: number } }>(s.g, `/opportunities/search?location_id=${loc(s.g)}&pipeline_id=${encodeURIComponent(p.id)}&limit=1`).catch(() => null);
        return { ...p, opportunities: typeof r?.meta?.total === "number" ? r.meta.total : null };
      }),
    );
    return Response.json({ pipelines: counted }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};
