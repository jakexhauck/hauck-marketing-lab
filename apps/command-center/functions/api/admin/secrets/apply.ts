import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { fetchDopplerSecrets, canReadDoppler, DopplerError } from "../../../lib/doppler";
import {
  buildEnvPayload,
  canDeploy,
  fetchEnvVars,
  latestDeployment,
  patchEnvVars,
  triggerDeploy,
  CloudflareError,
} from "../../../lib/cloudflarePages";
import { AGENCY_KEYS } from "../../../../src/lib/agencyKeys";

// /api/admin/secrets/apply  (admin-only, gated in _middleware.ts)
//
// The half-step this whole thing exists to remove. Saving an agency key wrote it
// to Doppler and then told the operator to go and run a shell command, which is
// why HEALTH_CRON_SECRET sat unbound for weeks: the save looked like it worked.
//
//   POST  rebind every declared key from Doppler into Cloudflare, in ONE PATCH,
//         then start exactly one deployment.
//   GET   how that deployment is doing, so the panel can poll until it lands.
//
// One PATCH for the whole batch rather than one per save, both because
// Cloudflare's secret round-trip is the dangerous operation in this app (see
// cloudflarePages.ts) and because eight pasted keys should cost one restart.

/** Keys this app is willing to bind. Never "everything Doppler holds". */
function bindableNames(): string[] {
  // Deliberately the catalogue, not the Doppler key list. Doppler also holds
  // local-tooling credentials (the account-wide Cloudflare token, the Supabase
  // access token) which must never be pushed into the app's runtime.
  return AGENCY_KEYS.map((k) => k.name);
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!canDeploy(ctx.env)) {
    return Response.json(
      {
        error:
          "No deploy token. Add CF_DEPLOY_TOKEN (Pages:Edit on this project only) to turn this on.",
      },
      { status: 503 },
    );
  }
  if (!canReadDoppler(ctx.env)) {
    return Response.json(
      { error: "No Doppler read token, so there are no values to bind." },
      { status: 503 },
    );
  }

  let doppler: Record<string, string>;
  try {
    doppler = await fetchDopplerSecrets(ctx.env);
  } catch (e) {
    const status = e instanceof DopplerError ? e.status : 502;
    return Response.json({ error: e instanceof Error ? e.message : "Doppler read failed." }, { status });
  }

  try {
    const current = await fetchEnvVars(ctx.env);
    const plan = buildEnvPayload(current, doppler, bindableNames());

    // Nothing to write is not a failure, but it must not cost a restart either.
    if (plan.set.length === 0 && plan.added.length === 0) {
      return Response.json({
        set: 0,
        added: [],
        skipped: plan.skipped,
        refused: plan.refused,
        deployment: await latestDeployment(ctx.env),
      });
    }

    await patchEnvVars(ctx.env, plan.payload);
    const deployment = await triggerDeploy(ctx.env);

    const client = getServiceClient(ctx.env);
    const adminId = ctx.data.admin?.id;
    if (client && adminId) {
      // Names only, never values. This log is readable inside the app.
      await logAdminAction(client, adminId, "secrets.agency.apply", null, {
        set: plan.set.length,
        added: plan.added,
        skipped: plan.skipped,
        deployment: deployment.id,
      });
    }

    return Response.json({
      set: plan.set.length,
      added: plan.added,
      skipped: plan.skipped,
      refused: plan.refused,
      deployment,
    });
  } catch (e) {
    const status = e instanceof CloudflareError ? e.status : 502;
    return Response.json(
      { error: e instanceof Error ? e.message : "Cloudflare rejected the change." },
      { status },
    );
  }
};

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!canDeploy(ctx.env)) {
    return Response.json(
      { canDeploy: false, deployment: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    return Response.json(
      { canDeploy: true, deployment: await latestDeployment(ctx.env) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // A failed status read must not read as a failed deploy. The panel keeps
    // polling; the deployment itself is unaffected by our inability to see it.
    return Response.json(
      { canDeploy: true, deployment: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
};
