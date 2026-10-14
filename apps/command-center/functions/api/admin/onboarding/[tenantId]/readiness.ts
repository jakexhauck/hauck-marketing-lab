import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch, type GhlContext } from "../../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import { summarizeReadiness, type GhlCustomValue } from "../../../../../src/lib/onboarding";

// Which checklist task each live check answers. The answers are recorded so the
// Onboarding roster can show a client's real progress without calling GHL once
// per client; the record page still shows the live answer, and re-checking
// rewrites these rows.
const READINESS_TASK: Record<string, string> = {
  token: "token-connected",
  custom_values: "provision-values",
  calendars: "calendars-present",
};

async function recordChecks(
  client: ReturnType<typeof getServiceClient>,
  tenantId: string,
  checks: { key: string; ok: boolean }[],
) {
  if (!client) return;
  const rows = checks
    .filter((c) => READINESS_TASK[c.key])
    .map((c) => ({
      tenant_id: tenantId,
      task_key: READINESS_TASK[c.key],
      done: c.ok,
      done_at: c.ok ? new Date().toISOString() : null,
      // Nobody ticked these: GHL answered them.
      done_by: null,
    }));
  if (rows.length === 0) return;
  // Best effort: a checklist that failed to record is not a reason to withhold
  // the answer the screen asked for.
  await client.from("onboarding_checklist").upsert(rows, { onConflict: "tenant_id,task_key" });
}

// GET /api/admin/onboarding/:tenantId/readiness -> live auto-checks
export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let gctx: GhlContext;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    // Not found, not connected, or the lookup itself failed: this screen's
    // job is a checklist, not an error page, so any of those states surfaces
    // as the same "not wired up yet" item rather than an HTTP error.
    const checks = [{ key: "token", ok: false, detail: "No token/location set yet" }];
    await recordChecks(client, tenantId, checks);
    return Response.json({ checks });
  }

  let tokenValid = false;
  let customValues: GhlCustomValue[] = [];
  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(gctx.locationId)}/customValues`);
  if (cvRes.ok) {
    tokenValid = true;
    const data = (await cvRes.json()) as { customValues?: GhlCustomValue[] };
    customValues = data.customValues ?? [];
  }

  let calendarIds: string[] = [];
  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`, {
    headers: { Version: "2021-04-15" },
  });
  if (calRes.ok) {
    const data = (await calRes.json()) as { calendars?: { id: string }[] };
    calendarIds = (data.calendars ?? []).map((c) => c.id);
  }

  const checks = summarizeReadiness({ fields: {}, customValues, calendarIds, tokenValid });
  await recordChecks(client, tenantId, checks);
  return Response.json({ checks });
};
