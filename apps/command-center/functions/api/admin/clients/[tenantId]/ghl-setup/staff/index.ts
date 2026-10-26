import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { buildUserCreate, newPassword, parseStaffInput, shapeUsers, withLocation } from "../../../../../../lib/ghlSetup";
import { JAKE_GHL_EMAIL, agencyCtx, companyIdOf, fail, setupCtx, staffOf } from "../_shared";

// GET  /api/admin/clients/:tenantId/ghl-setup/staff -> { users, jakeIn }
// POST /api/admin/clients/:tenantId/ghl-setup/staff  { kind: "jake" } | { kind: "new", ...StaffInput }
//   -> { users, jakeIn, password? }
//
// Client > GHL > Staff (checklist B2). Jake is one GHL user across every client,
// so "Add Jake" puts this sub-account on his existing user rather than making a
// second one. A new user (the owner, a dialer) is made on this sub-account only,
// with a generated password handed back once so it can be passed on.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    return Response.json(await staffOf(s), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const body = (await ctx.request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    if (body?.kind === "jake") {
      const agency = await agencyCtx(s);
      const found = shapeUsers(
        await ghlJson<unknown>(agency, `/users/search?companyId=${encodeURIComponent(agency.companyId)}&query=${encodeURIComponent(JAKE_GHL_EMAIL)}&limit=10`),
      ).find((u) => u.email.toLowerCase() === JAKE_GHL_EMAIL);
      if (!found) return Response.json({ error: `No GHL user with ${JAKE_GHL_EMAIL}.` }, { status: 404 });
      await ghlJson(agency, `/users/${encodeURIComponent(found.id)}`, {
        method: "PUT",
        body: JSON.stringify({ locationIds: withLocation(found, s.g.locationId) }),
      });
      return Response.json(await staffOf(s));
    }

    const input = parseStaffInput(body);
    if (!input) return Response.json({ error: "A first name and a real email are needed, and the phone must be a full US number." }, { status: 400 });
    const current = await staffOf(s);
    if (current.users.some((u) => u.email.toLowerCase() === input.email)) {
      return Response.json({ error: `${input.email} is already on this account.` }, { status: 409 });
    }
    const password = newPassword();
    const companyId = await companyIdOf(s.g);
    await ghlJson(s.g, `/users/`, { method: "POST", body: JSON.stringify(buildUserCreate(input, companyId, s.g.locationId, password)) });
    return Response.json({ ...(await staffOf(s)), password });
  } catch (err) {
    return fail(err);
  }
};
