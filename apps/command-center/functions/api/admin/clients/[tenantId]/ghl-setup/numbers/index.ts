import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { shapeAvailable, shapeNumbers } from "../../../../../../lib/ghlSetup";
import { fail, loc, setupCtx } from "../_shared";

// GET  /api/admin/clients/:tenantId/ghl-setup/numbers               -> { numbers }
// GET  /api/admin/clients/:tenantId/ghl-setup/numbers?area=734      -> { numbers, available, fingerprintId }
// POST /api/admin/clients/:tenantId/ghl-setup/numbers  { number, fingerprintId, confirm: true } -> { numbers }
//
// Client > GHL > Phone Numbers (checklist A3). Buying costs money every month,
// so the POST needs confirm: true and only takes a number GHL just offered for
// this sub-account. The default number, forwarding, compliance and recording
// have no API: the page shows them and links into GHL's settings.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const area = (new URL(ctx.request.url).searchParams.get("area") ?? "").replace(/\D/g, "");
  try {
    const numbers = shapeNumbers(await ghlJson<unknown>(s.g, `/phone-system/numbers/location/${loc(s.g)}`));
    if (!area) return Response.json({ numbers }, { headers: { "Cache-Control": "no-store" } });
    if (area.length !== 3) return Response.json({ error: "An area code is 3 digits." }, { status: 400 });
    const offered = shapeAvailable(
      await ghlJson<unknown>(s.g, `/phone-system/numbers/location/${loc(s.g)}/available?countryCode=US&numberTypes=local&firstPart=${area}&smsEnabled=true&voiceEnabled=true`),
    );
    return Response.json({ numbers, available: offered.numbers.filter((n) => n.number.startsWith(`+1${area}`)), fingerprintId: offered.fingerprintId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const body = (await ctx.request.json().catch(() => null)) as { number?: unknown; fingerprintId?: unknown; confirm?: unknown } | null;
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  if (!/^\+1\d{10}$/.test(number)) return Response.json({ error: "Pick a number from the list." }, { status: 400 });
  if (body?.confirm !== true) return Response.json({ error: "Confirm the purchase first." }, { status: 400 });
  try {
    const owned = shapeNumbers(await ghlJson<unknown>(s.g, `/phone-system/numbers/location/${loc(s.g)}`));
    if (owned.some((n) => n.number === number)) return Response.json({ numbers: owned });
    const payload: Record<string, unknown> = { phoneNumber: number, countryCode: "US", numberType: "local" };
    if (typeof body.fingerprintId === "string" && body.fingerprintId) payload.fingerprintId = body.fingerprintId;
    await ghlJson(s.g, `/phone-system/numbers/location/${loc(s.g)}/purchase`, { method: "POST", body: JSON.stringify(payload) });
    return Response.json({ numbers: shapeNumbers(await ghlJson<unknown>(s.g, `/phone-system/numbers/location/${loc(s.g)}`)) });
  } catch (err) {
    return fail(err);
  }
};
