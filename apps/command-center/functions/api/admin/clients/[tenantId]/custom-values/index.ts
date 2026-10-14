import type { Env, ApiData } from "../../../../../lib/env";
import { createValue, listValues, parseValueBody } from "../../../../../lib/customValuesMirror";
import { provisionOwnerLinks } from "../../../../../lib/ghlProvision";
import { ghlError, ownerGhl } from "./_shared";

// GET  /api/admin/clients/:tenantId/custom-values  -> { values: MirrorValue[] }
// POST /api/admin/clients/:tenantId/custom-values  { name, value } -> { values }
//
// Client > GHL > Custom Values. Read live from the sub-account every time,
// never cached (lib/customValuesMirror.ts). Each read first puts Open Lead
// back if it is missing or wrong, so a deleted one heals on the next open.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const g = await ownerGhl(ctx);
  if (g instanceof Response) return g;
  try {
    await provisionOwnerLinks(g, new URL(ctx.request.url).origin, (ctx.env.SESSION_SECRET ?? "").trim());
    return Response.json({ values: await listValues(g) });
  } catch (err) {
    return ghlError(err);
  }
};

export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const g = await ownerGhl(ctx);
  if (g instanceof Response) return g;
  const input = parseValueBody(await ctx.request.json().catch(() => null));
  if (!input) return Response.json({ error: "Name is required." }, { status: 400 });
  try {
    await createValue(g, input);
    return Response.json({ values: await listValues(g) });
  } catch (err) {
    return ghlError(err);
  }
};
