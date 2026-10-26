import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { parseStaffInput, withoutLocation } from "../../../../../../lib/ghlSetup";
import { fail, setupCtx, staffOf } from "../_shared";

// PUT    /api/admin/clients/:tenantId/ghl-setup/staff/:userId  StaffInput -> { users, jakeIn }
// DELETE /api/admin/clients/:tenantId/ghl-setup/staff/:userId             -> { users, jakeIn }
//
// Editing a user on this sub-account, and taking them off it. The DELETE never
// deletes the GHL user (lib/ghlSetup.ts withoutLocation): it only drops this
// sub-account from their list.

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const input = parseStaffInput(await ctx.request.json().catch(() => null));
  if (!input) return Response.json({ error: "A first name and a real email are needed, and the phone must be a full US number." }, { status: 400 });
  try {
    const user = (await staffOf(s)).users.find((u) => u.id === ctx.params.userId);
    if (!user) return Response.json({ error: "That user is not on this account." }, { status: 404 });
    const body: Record<string, unknown> = { firstName: input.firstName, lastName: input.lastName || user.lastName, phone: input.phone || undefined };
    // Role only changes for this sub-account's own users; Jake's stays as it is.
    if (user.type === "account" && user.role !== input.role) {
      body.type = "account";
      body.role = input.role;
    }
    await ghlJson(s.g, `/users/${encodeURIComponent(user.id)}`, { method: "PUT", body: JSON.stringify(body) });
    return Response.json(await staffOf(s));
  } catch (err) {
    return fail(err);
  }
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    const user = (await staffOf(s)).users.find((u) => u.id === ctx.params.userId);
    if (!user) return Response.json({ error: "That user is not on this account." }, { status: 404 });
    const next = withoutLocation(user, s.g.locationId);
    if (!next) return Response.json({ error: "This is their only GHL account, so remove them in GHL itself." }, { status: 409 });
    await ghlJson(s.g, `/users/${encodeURIComponent(user.id)}`, { method: "PUT", body: JSON.stringify({ locationIds: next }) });
    return Response.json(await staffOf(s));
  } catch (err) {
    return fail(err);
  }
};
