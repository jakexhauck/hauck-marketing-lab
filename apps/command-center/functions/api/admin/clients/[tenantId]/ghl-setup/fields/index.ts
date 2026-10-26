import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { buildFieldBody, parseFieldInput } from "../../../../../../lib/ghlSetup";
import { fail, fieldsOf, loc, setupCtx } from "../_shared";

// GET  /api/admin/clients/:tenantId/ghl-setup/fields -> { fields }
// POST /api/admin/clients/:tenantId/ghl-setup/fields  { name, dataType, placeholder } -> { fields }
//
// Client > GHL > Custom Fields (checklist B4): the contact fields the lead form
// questions land in.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    return Response.json({ fields: await fieldsOf(s.g) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const input = parseFieldInput(await ctx.request.json().catch(() => null), true);
  if (!input) return Response.json({ error: "A field needs a name and a type this page can make." }, { status: 400 });
  try {
    const existing = await fieldsOf(s.g);
    if (existing.some((f) => f.name.toLowerCase() === input.name.toLowerCase())) {
      return Response.json({ error: `There is already a field called ${input.name}.` }, { status: 409 });
    }
    await ghlJson(s.g, `/locations/${loc(s.g)}/customFields`, { method: "POST", body: JSON.stringify(buildFieldBody(input, true)) });
    return Response.json({ fields: await fieldsOf(s.g) });
  } catch (err) {
    return fail(err);
  }
};
