import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { buildFieldBody, parseFieldInput } from "../../../../../../lib/ghlSetup";
import { fail, fieldsOf, loc, setupCtx } from "../_shared";

// PUT    /api/admin/clients/:tenantId/ghl-setup/fields/:fieldId  { name, placeholder } -> { fields }
// DELETE /api/admin/clients/:tenantId/ghl-setup/fields/:fieldId                     -> { fields }

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const input = parseFieldInput(await ctx.request.json().catch(() => null), false);
  if (!input) return Response.json({ error: "A field needs a name." }, { status: 400 });
  try {
    const field = (await fieldsOf(s.g)).find((f) => f.id === ctx.params.fieldId);
    if (!field) return Response.json({ error: "That field is not on this account." }, { status: 404 });
    await ghlJson(s.g, `/locations/${loc(s.g)}/customFields/${encodeURIComponent(field.id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...buildFieldBody(input, false), model: field.model }),
    });
    return Response.json({ fields: await fieldsOf(s.g) });
  } catch (err) {
    return fail(err);
  }
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    const field = (await fieldsOf(s.g)).find((f) => f.id === ctx.params.fieldId);
    if (!field) return Response.json({ error: "That field is not on this account." }, { status: 404 });
    await ghlJson(s.g, `/locations/${loc(s.g)}/customFields/${encodeURIComponent(field.id)}`, { method: "DELETE" });
    return Response.json({ fields: await fieldsOf(s.g) });
  } catch (err) {
    return fail(err);
  }
};
