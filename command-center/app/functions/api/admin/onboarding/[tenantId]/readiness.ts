import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch } from "../../../../lib/ghl";
import { summarizeReadiness, type GhlCustomValue } from "../../../../../src/lib/onboarding";

// GET /api/admin/onboarding/:tenantId/readiness -> live auto-checks
export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("id", tenantId)
    .maybeSingle();
  const locationId = (tenant?.ghl_location_id as string) ?? "";
  const token = (tenant?.ghl_token as string) ?? "";
  if (!locationId || !token || locationId === "pending" || token === "pending") {
    return Response.json({ checks: [{ key: "token", ok: false, detail: "No token/location set yet" }] });
  }
  const gctx = { token, locationId };

  let tokenValid = false;
  let customValues: GhlCustomValue[] = [];
  const cvRes = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}/customValues`);
  if (cvRes.ok) {
    tokenValid = true;
    const data = (await cvRes.json()) as { customValues?: GhlCustomValue[] };
    customValues = data.customValues ?? [];
  }

  let calendarIds: string[] = [];
  const calRes = await ghlFetch(gctx, `/calendars/?locationId=${encodeURIComponent(locationId)}`, {
    headers: { Version: "2021-04-15" },
  });
  if (calRes.ok) {
    const data = (await calRes.json()) as { calendars?: { id: string }[] };
    calendarIds = (data.calendars ?? []).map((c) => c.id);
  }

  const checks = summarizeReadiness({ fields: {}, customValues, calendarIds, tokenValid });
  return Response.json({ checks });
};
