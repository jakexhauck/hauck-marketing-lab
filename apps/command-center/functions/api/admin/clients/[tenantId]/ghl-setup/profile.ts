import type { Env, ApiData } from "../../../../../lib/env";
import { ghlJson } from "../../../../../lib/ghl";
import { buildProfileUpdate, parseProfileInput, shapeProfile } from "../../../../../lib/ghlSetup";
import { agencyCtx, fail, loc, setupCtx } from "./_shared";

// GET /api/admin/clients/:tenantId/ghl-setup/profile -> { profile, timezones }
// PUT /api/admin/clients/:tenantId/ghl-setup/profile  ProfileInput -> { profile }
//
// Client > GHL > Business Profile. GHL only takes a sub-account update from the
// agency token (PUT /locations/:id is Agency-Access, locations.write).

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    const [raw, tz] = await Promise.all([
      ghlJson<unknown>(s.g, `/locations/${loc(s.g)}`),
      ghlJson<{ timeZones?: string[] }>(s.g, `/locations/${loc(s.g)}/timezones`).catch(() => ({ timeZones: [] })),
    ]);
    return Response.json({ profile: shapeProfile(raw), timezones: tz.timeZones ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const input = parseProfileInput(await ctx.request.json().catch(() => null));
  if (!input) return Response.json({ error: "A business name is required, and the phone must be a full US number." }, { status: 400 });
  try {
    const agency = await agencyCtx(s);
    await ghlJson(agency, `/locations/${loc(s.g)}`, { method: "PUT", body: JSON.stringify(buildProfileUpdate(input, agency.companyId)) });
    return Response.json({ profile: shapeProfile(await ghlJson<unknown>(s.g, `/locations/${loc(s.g)}`)) });
  } catch (err) {
    return fail(err);
  }
};
