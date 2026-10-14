import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { SELECT as RUN_SELECT, shapeRun } from "./runs";

// POST /api/admin/leads/resume -> Continue on a held run.
//
// Back to 'queued', with the next hold point moved up by the cap. The runner
// claims it again, but only the machine that holds its queue file (store.py's
// claim is scoped to host null or its own host), and resumes from
// data/queue_<id>.jsonl rather than from the first search.
//
// Counted from where the run actually stopped, not from the old hold point. A
// run overshoots its cap by up to a keyword's worth of leads, so 200 + 200 would
// hold again almost straight away.
export function nextHoldAt(newCount: number, leadCap: number | null): number | null {
  return leadCap ? newCount + leadCap : null;
}

interface PostBody {
  id?: unknown;
}

export type ResumeOutcome =
  | { ok: true; run: ReturnType<typeof shapeRun> }
  | { ok: false; reason: "not_held" | "failed" };

export async function resumeRun(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  id: string,
): Promise<ResumeOutcome> {
  const { data: row, error: readErr } = await client
    .from("scrape_runs")
    .select("id, status, new_count, lead_cap")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[leads/resume] read failed", readErr.message);
    return { ok: false, reason: "failed" };
  }
  const held = row as { status: string; new_count: number | null; lead_cap: number | null } | null;
  if (!held || held.status !== "held") return { ok: false, reason: "not_held" };

  // The status filter travels with the write: a Stop pressed between the read
  // and here leaves the row 'cancelled', this matches nothing, and it stays so.
  const { data, error } = await client
    .from("scrape_runs")
    .update({ status: "queued", hold_at: nextHoldAt(held.new_count ?? 0, held.lead_cap) })
    .eq("id", id)
    .eq("status", "held")
    .select(RUN_SELECT)
    .maybeSingle();
  if (error) {
    console.error("[leads/resume] update failed", error.message);
    return { ok: false, reason: "failed" };
  }
  if (!data) return { ok: false, reason: "not_held" };
  return { ok: true, run: shapeRun(data as Parameters<typeof shapeRun>[0]) };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "Which run?" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const outcome = await resumeRun(client, id);

  if (!outcome.ok) {
    return outcome.reason === "not_held"
      ? Response.json({ error: "That run is not held." }, { status: 409 })
      : Response.json({ error: "could not continue that run" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.run.resume", null, {
    runId: id,
    holdAt: outcome.run.holdAt,
  });

  return Response.json({ run: outcome.run });
};
