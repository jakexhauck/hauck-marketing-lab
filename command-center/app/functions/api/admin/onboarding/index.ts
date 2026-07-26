import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { CHECKLIST_TASKS } from "../../../../src/lib/onboarding";

// GET /api/admin/onboarding  (admin-only, gated in _middleware.ts)
// Every client with its onboarding status and how far through the checklist it
// is, for the Onboarding page's roster.
//
// The count is taken against the shipped task list rather than against whatever
// rows happen to exist, so a saved tick for a task we no longer ship cannot push
// a client past done. Three of the nine tasks are answered live by GHL and are
// not reflected here: this is what has been recorded, and the client's own page
// is where the live checks run.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, name, slug, niche, brand_color, brand_initials")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: ob } = await client
    .from("onboarding")
    .select("tenant_id, status, provisioned_at");
  const byId = new Map(
    ((ob ?? []) as { tenant_id: string; status: string; provisioned_at: string | null }[]).map(
      (r) => [r.tenant_id, r],
    ),
  );

  const { data: ticks } = await client
    .from("onboarding_checklist")
    .select("tenant_id, task_key")
    .eq("done", true);
  const shipped = new Set(CHECKLIST_TASKS.map((t) => t.key));
  const doneById = new Map<string, number>();
  for (const row of (ticks ?? []) as { tenant_id: string; task_key: string }[]) {
    if (!shipped.has(row.task_key)) continue;
    doneById.set(row.tenant_id, (doneById.get(row.tenant_id) ?? 0) + 1);
  }

  const clients = (
    (tenants ?? []) as {
      id: string;
      name: string;
      slug: string;
      niche: string | null;
      brand_color: string | null;
      brand_initials: string | null;
    }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    niche: t.niche ?? "",
    brandColor: t.brand_color ?? "",
    brandInitials: t.brand_initials ?? "",
    status: byId.get(t.id)?.status ?? "draft",
    provisionedAt: byId.get(t.id)?.provisioned_at ?? null,
    tasksDone: doneById.get(t.id) ?? 0,
    tasksTotal: CHECKLIST_TASKS.length,
  }));

  return Response.json({ clients });
};
