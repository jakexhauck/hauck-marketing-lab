import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// POST /api/admin/tasks/reorder  (admin-only, gated in _middleware.ts)
//
// Persists a drag-to-reorder of the standalone Operations checklist. The body
// carries the full visible id order; the server renumbers sort_order 0..n-1 in
// that order, scoped to the standalone list (pillar_id null) so a stale or
// hostile id can never renumber a pillar task. Ids the server does not know are
// dropped rather than erroring, so a list that went stale in another tab still
// lands in a sane order.

interface ReorderBody {
  ids?: unknown;
}

export type ReorderValidation = { ok: true; ids: string[] } | { ok: false; error: string };

export function validateReorderBody(body: ReorderBody): ReorderValidation {
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "ids must be a non-empty array" };
  }
  if (!ids.every((id): id is string => typeof id === "string" && id.length > 0)) {
    return { ok: false, error: "ids must be strings" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "ids must be unique" };
  }
  return { ok: true, ids };
}

// Position assignment: the sent order wins, filtered to ids the caller is
// actually allowed to reorder.
export function renumber(
  ids: string[],
  allowed: ReadonlySet<string>,
): { id: string; sort_order: number }[] {
  return ids.filter((id) => allowed.has(id)).map((id, i) => ({ id, sort_order: i }));
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: ReorderBody = {};
  try {
    body = (await ctx.request.json()) as ReorderBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const validated = validateReorderBody(body);
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });

  // The reorderable scope: standalone tasks only, same rows the no-param GET
  // returns. Pillar tasks keep their seed order and are not reorderable.
  const { data: existing, error: readError } = await client
    .from("admin_tasks")
    .select("id")
    .is("pillar_id", null);
  if (readError) return Response.json({ error: readError.message }, { status: 500 });

  const allowed = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
  const updates = renumber(validated.ids, allowed);
  if (updates.length === 0) {
    return Response.json({ error: "no known tasks in ids" }, { status: 400 });
  }

  // One round trip: upsert on the primary key touches only sort_order on rows
  // that all exist (renumber filtered to known ids), so no insert path fires.
  const { error: writeError } = await client
    .from("admin_tasks")
    .upsert(updates, { onConflict: "id" });
  if (writeError) return Response.json({ error: writeError.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "task.reorder", null, {
    count: updates.length,
  });

  return Response.json({ ok: true });
};
