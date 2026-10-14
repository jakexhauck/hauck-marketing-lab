import type { Env, ApiData } from "../../../../../lib/env";
import { deleteValue, listValues, parseValueBody, updateValue } from "../../../../../lib/customValuesMirror";
import { ghlError, ownerGhl, refuseAppValue } from "./_shared";

// PUT    /api/admin/clients/:tenantId/custom-values/:id  { name, value } -> { values }
// DELETE /api/admin/clients/:tenantId/custom-values/:id                  -> { values }

export const onRequestPut: PagesFunction<Env, "tenantId" | "id", ApiData> = async (ctx) => {
  const g = await ownerGhl(ctx);
  if (g instanceof Response) return g;
  const input = parseValueBody(await ctx.request.json().catch(() => null));
  if (!input) return Response.json({ error: "Name is required." }, { status: 400 });
  try {
    const refused = await refuseAppValue(g, ctx.params.id as string);
    if (refused) return refused;
    await updateValue(g, ctx.params.id as string, input);
    return Response.json({ values: await listValues(g) });
  } catch (err) {
    return ghlError(err);
  }
};

export const onRequestDelete: PagesFunction<Env, "tenantId" | "id", ApiData> = async (ctx) => {
  const g = await ownerGhl(ctx);
  if (g instanceof Response) return g;
  try {
    const refused = await refuseAppValue(g, ctx.params.id as string);
    if (refused) return refused;
    await deleteValue(g, ctx.params.id as string);
    return Response.json({ values: await listValues(g) });
  } catch (err) {
    return ghlError(err);
  }
};
