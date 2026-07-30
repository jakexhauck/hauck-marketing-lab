import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { CHECKLIST_TASKS } from "../../../../../src/lib/onboarding";

// POST /api/admin/onboarding/:tenantId/go-live
//
// The end of onboarding: flip the client from 'setup' to 'live' and their app
// opens. Until this runs they can sign in and see the holding screen, which is
// the middleware's onboarding gate reading the same column.
//
// The checklist is re-counted HERE rather than trusted from the browser. The
// button is disabled while anything is outstanding, but a disabled button is a
// courtesy and not a rule, and going live early is exactly the mistake worth
// making impossible: it hands a client an app wired to nothing.
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

  const { data: rows } = await client
    .from("onboarding_checklist")
    .select("task_key, done")
    .eq("tenant_id", tenantId);

  const done = new Set(
    ((rows ?? []) as { task_key: string; done: boolean }[])
      .filter((r) => r.done)
      .map((r) => r.task_key),
  );
  // Counted over the tasks we ship, not over the rows that happen to exist: a
  // saved row for a retired task must not stand in for a real one.
  const outstanding = CHECKLIST_TASKS.filter((t) => !done.has(t.key));
  if (outstanding.length > 0) {
    return Response.json(
      {
        error: `${outstanding.length} ${outstanding.length === 1 ? "item is" : "items are"} still outstanding.`,
        outstanding: outstanding.map((t) => t.label),
      },
      { status: 409 },
    );
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
