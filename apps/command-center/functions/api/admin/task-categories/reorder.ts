import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { renumber, validateReorderBody } from "../../../lib/reorder";

// POST /api/admin/task-categories/reorder  (admin-only, gated in _middleware.ts)
//
// Persists the order of the operator's own categories (0063), which is the
// order of the filter chips above the checklist and of the dropdown on every
// row. sort_order was on the table from the start and only the POST ever wrote
// to it, by appending; this is the endpoint that lets it be rearranged.
//
// The body carries the FULL id order, same contract as the task list next door
// and for the same reason: "move this one up" has to be applied against a list
// the server re-reads, and two tabs doing that at once interleave into an order
// neither asked for. Ids the server does not know are dropped rather than
// erroring, so a list that went stale in another tab still lands sanely.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: { ids?: unknown } = {};
  try {
    body = (await ctx.request.json()) as { ids?: unknown };
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const validated = validateReorderBody(body);
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });

  // Every category is reorderable, so the allowed set is simply the ones that
  // exist. Read anyway rather than trusting the body: it is what stops a stale
  // id from being written back as a row that is not there.
  const { data: existing, error: readError } = await client
    .from("admin_task_categories")
    .select("id");
  if (readError) return Response.json({ error: readError.message }, { status: 500 });

  const allowed = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
  const updates = renumber(validated.ids, allowed);
  if (updates.length === 0) {
    return Response.json({ error: "no known categories in ids" }, { status: 400 });
  }

  // Plain per-row updates, in parallel. NOT an upsert: Postgres checks NOT NULL
  // on the proposed insert tuple BEFORE conflict resolution, so a partial
  // {id, sort_order} upsert dies on the name column even when every row already
  // exists. There are never more than a couple of dozen categories.
  const results = await Promise.all(
    updates.map((u) =>
      client
        .from("admin_task_categories")
        .update({ sort_order: u.sort_order, updated_at: new Date().toISOString() })
        .eq("id", u.id),
    ),
  );
  const writeError = results.find((r) => r.error)?.error;
  if (writeError) return Response.json({ error: writeError.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "task_category.reorder", null, {
    count: updates.length,
  });

  return Response.json({ ok: true });
};
