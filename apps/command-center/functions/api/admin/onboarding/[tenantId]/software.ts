import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { selfDialPatch } from "../../../../lib/selfDial";
import { isBundle, isDialer } from "../../../../../src/lib/onboardingWizard";
import { SOFTWARE_LIVE_CODE } from "../../../../../src/lib/setupSteps";

// POST /api/admin/onboarding/:tenantId/software  body { bundle, dialer }
//
// Software setup's Submit (Jake, 2026-09-23). Saves the bundle and who dials,
// stamps software_live_at, and ticks Software Account Made on the checklist.
// Submitting again (Edit) overwrites both choices and moves the date.
//
// Who dials is live (2026-09-23): "client" turns on self-dial (lib/selfDial.ts),
// so their Leads page lists every lead for the owner to mark. "agency" turns it
// off. The bundle is recorded only; it changes nothing in the client app yet.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let body: { bundle?: unknown; dialer?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isBundle(body.bundle)) return Response.json({ error: "Pick a bundle." }, { status: 400 });
  if (!isDialer(body.dialer)) return Response.json({ error: "Pick who dials." }, { status: 400 });

  const now = new Date().toISOString();
  const { data: tenant, error } = await client
    .from("tenants")
    .update({
      onboarding_bundle: body.bundle,
      ...selfDialPatch(body.dialer === "client"),
      software_live_at: now,
    })
    .eq("id", tenantId)
    .select("id, name")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!tenant) return Response.json({ error: "not found" }, { status: 404 });

  // The tick is a convenience, not the record: software_live_at is. A missing
  // step (deleted in Settings) or a failed tick leaves the submit standing.
  let ticked = false;
  const { data: step } = await client
    .from("setup_steps")
    .select("id")
    .eq("code", SOFTWARE_LIVE_CODE)
    .eq("archived", false)
    .maybeSingle();
  if (step) {
    const { error: tickErr } = await client.from("onboarding_checklist").upsert(
      {
        tenant_id: tenantId,
        task_key: (step as { id: string }).id,
        done: true,
        done_at: now,
        done_by: ctx.data.admin?.id ?? null,
      },
      { onConflict: "tenant_id,task_key" },
    );
    ticked = !tickErr;
  }

  await logAdminAction(client, ctx.data.admin!.id, "onboarding.software-live", tenantId, {
    name: (tenant as { name: string }).name,
    bundle: body.bundle,
    dialer: body.dialer,
  });

  return Response.json({ ok: true, softwareLiveAt: now, ticked });
};
