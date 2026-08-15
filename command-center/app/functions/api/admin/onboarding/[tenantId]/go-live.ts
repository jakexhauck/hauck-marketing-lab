import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// POST /api/admin/onboarding/:tenantId/go-live
//
// The end of onboarding: flip the client from 'setup' to 'live', which clears
// them off the Onboarding list.
//
// It no longer decides anything for the CLIENT (Jake, 2026-08-15). It used to:
// the middleware answered 423 on every tenant surface until this ran. Their app
// now opens as soon as their GoHighLevel sub-account is wired, so this is a
// marker of Jake's own work being finished, and forgetting to press it costs
// the client nothing.
//
// There is no gate on this any more. It used to re-count the required setup
// steps and refuse while any were outstanding, which was the right rule while
// the app held the checklist. The app no longer holds one: the process is in
// Jake's SOPs, he is the only person who presses this, and he asked for the
// judgement to be his rather than the server's. The action is still logged.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client
    .from("tenants")
    .select("id, name, onboarding_status")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return Response.json({ error: "not found" }, { status: 404 });

  if ((tenant as { onboarding_status: string }).onboarding_status === "live") {
    // Already live. Not an error: two clicks on a slow connection should not
    // read as a failure when the client is in exactly the state asked for.
    return Response.json({ ok: true, onboardingStatus: "live", alreadyLive: true });
  }

  const { error } = await client
    .from("tenants")
    .update({ onboarding_status: "live" })
    .eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "onboarding.go-live", tenantId, {
    name: (tenant as { name: string }).name,
  });

  return Response.json({ ok: true, onboardingStatus: "live" });
};
