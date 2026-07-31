import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { canWriteDoppler, writeDopplerSecrets, DopplerError } from "../../../lib/doppler";
import { generateFor } from "../../../lib/secretGen";
import { keyDef, isLocked } from "../../../../src/lib/agencyKeys";

// POST /api/admin/secrets/generate  (admin-only, gated in _middleware.ts)
//
// Four agency keys are invented rather than obtained: the session secret, the
// two cron secrets, and the VAPID pair. Making them by hand meant a shell
// command and a paste, which is how HEALTH_CRON_SECRET ended up never set.
//
// The value is written straight to Doppler and returned ONCE, because two of
// these have to be pasted somewhere else as well (both cron secrets go into
// their Worker's own config) and a value you can never see again is useless for
// that. After this response it is masked like everything else.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!canWriteDoppler(ctx.env)) {
    return Response.json(
      { error: "Editing is off. Add DOPPLER_WRITE_TOKEN to turn it on." },
      { status: 403 },
    );
  }

  let body: { name?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const def = keyDef(name);
  if (!def) {
    return Response.json(
      { error: "That key is not one this app declares." },
      { status: 400 },
    );
  }
  if (isLocked(name)) {
    return Response.json({ error: `${name} cannot be changed here.` }, { status: 403 });
  }
  if (def.entry !== "generate" || !def.generator) {
    // Pasted keys come from a vendor. Generating one would produce a valid-
    // looking string that authenticates against nothing.
    return Response.json(
      { error: `${name} is pasted from its vendor, not generated.` },
      { status: 400 },
    );
  }

  const generated = await generateFor(name, def.generator, def.pairedWith);

  try {
    await writeDopplerSecrets(ctx.env, generated.values);
  } catch (e) {
    const status = e instanceof DopplerError ? e.status : 502;
    return Response.json(
      { error: e instanceof Error ? e.message : "Doppler write failed." },
      { status },
    );
  }

  const client = getServiceClient(ctx.env);
  const adminId = ctx.data.admin?.id;
  if (client && adminId) {
    // Names only. The values are in the response body and nowhere else.
    await logAdminAction(client, adminId, "secrets.agency.generate", null, {
      names: Object.keys(generated.values),
    });
  }

  return Response.json(
    {
      values: generated.values,
      note: "Saved to Doppler. Copy it now if it is needed elsewhere: it is masked from here on. Press Apply to make it live.",
    },
    // The only response in the app that carries a secret in the clear. It is
    // deliberate (both cron secrets have to be pasted into their Worker too),
    // but it must not sit in any cache on the way back.
    { headers: { "Cache-Control": "no-store" } },
  );
};
