import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// POST /api/admin/leads/exported -> take the leads that just went into a CSV off
// the Leads list.
//
// The Leads CSV is built in the browser and marks nothing on its own. Since
// 21 September 2026 pressing it asks whether to keep the leads on the list or
// remove them, and "remove" is this route: the ticked rows are stamped
// `csv_<yyyymmdd>_exported`, which takes them out of CALLABLE_LEAD_FILTER (pending
// only) and so off the list, the send buttons and the power dialer's pool.
//
// Deliberately NOT `_queued`. That suffix is how leadReturn.ts recognises a
// company sitting on the power dialer, and a CSV is not the dialer.
//
// Only a `pending` row is ever stamped, and the filter travels WITH the write.
// A row that was sent or put on the do-not-contact list in the meantime keeps
// what it says; overwriting either would lose where that number actually went.

export const MAX_PER_EXPORT = 200;

interface PostBody {
  ids?: unknown;
}

export function exportedLabel(now: Date = new Date()): string {
  return `csv_${now.toISOString().slice(0, 10).replace(/-/g, "")}_exported`;
}

export type MarkOutcome = { ok: true; marked: number } | { ok: false };

export async function markExported(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  ids: string[],
  now: Date = new Date(),
): Promise<MarkOutcome> {
  const { data, error } = await client
    .from("cold_sms_outreach_numbers")
    .update({ send_status: exportedLabel(now), sent_to: "csv", sent_at: now.toISOString() })
    .in("id", ids)
    .eq("send_status", "pending")
    .select("id");
  // supabase-js RESOLVES a failed write with { data: null, error }. Reading
  // `data` alone would report "0 marked" for a write that never ran, and the
  // file would go out with every lead still on the list.
  if (error) {
    console.error("[leads/exported] stamp failed", error.message);
    return { ok: false };
  }
  return { ok: true, marked: (data ?? []).length };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && x.trim() !== ""))]
    : [];
  if (ids.length === 0) return Response.json({ error: "Which leads?" }, { status: 400 });
  if (ids.length > MAX_PER_EXPORT) {
    return Response.json({ error: `At most ${MAX_PER_EXPORT} at a time.` }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const outcome = await markExported(client, ids);
  if (!outcome.ok) {
    return Response.json({ error: "Could not take those leads off the list." }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.export.csv_removed", null, {
    rows: outcome.marked,
    asked: ids.length,
  });

  return Response.json({ marked: outcome.marked });
};
