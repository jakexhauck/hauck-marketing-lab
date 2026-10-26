import type { Env, ApiData } from "../../../../../lib/env";
import { ghlJson } from "../../../../../lib/ghl";
import { shapeSetupWorkflows } from "../../../../../lib/ghlSetup";
import { fail, loc, setupCtx } from "./_shared";

// GET /api/admin/clients/:tenantId/ghl-setup/workflows -> { workflows }
//
// Client > GHL > Workflows (checklist B6). Read only: GHL's API lists workflows
// but cannot edit or publish them, so the page shows status and opens GHL's
// builder.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    const workflows = shapeSetupWorkflows(await ghlJson<unknown>(s.g, `/workflows/?locationId=${loc(s.g)}`));
    return Response.json({ workflows }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};
