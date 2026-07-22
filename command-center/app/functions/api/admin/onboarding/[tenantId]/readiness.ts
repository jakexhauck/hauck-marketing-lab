import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch, type GhlContext } from "../../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import { summarizeReadiness, type GhlCustomValue } from "../../../../../src/lib/onboarding";

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
    return Response.json({ checks: [{ key: "token", ok: false, detail: "No token/location set yet" }] });
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
  return Response.json({ checks });
};
