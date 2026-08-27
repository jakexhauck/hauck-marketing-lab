import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { SELECT as RUN_SELECT, shapeRun } from "./runs";

// POST /api/admin/leads/stop -> end a scrape that is in flight.
//
// The run row is the authority, and that is the whole mechanism. The scraper has
// its own off switch (lead-scraper/data/.stop) but it is a file on Jake's PC,
// which this app cannot touch and would not want to: that switch stops ALL
// scraping until someone deletes it, and it puts the run back on the queue so the
// next poll picks it straight up again.
//
// So: this flips the row to 'cancelled', and the runner re-reads the row between
// keywords and stops when it is no longer 'running'. The page therefore never
// waits on a process that may not exist. A run stranded at 'running' by a killed
// runner (which nothing reaps) stops exactly like a live one does, which is the
// case this was actually needed for.
//
// What the run already found stays put. The rows are in the table, the tallies
// are on the row, and data/queue_<id>.jsonl still holds every query that
// finished, so a stopped run can be resumed by hand by putting it back to
// 'queued' rather than re-walking from the start.

// The three statuses that mean "not finished". Anything else has an end already
// and must not be given a second one: a finished run that could be re-stopped
// would rewrite its own finished_at every time somebody pressed the button.
const ACTIVE = ["preparing", "queued", "running"];

interface PostBody {
  id?: unknown;
}

export type StopOutcome =
  | { ok: true; run: ReturnType<typeof shapeRun> }
  | { ok: false; reason: "not_active" | "failed" };

/**
 * Flip one active run to 'cancelled'.
 *
 * The status filter travels WITH the update rather than being checked first. A
 * read-then-write would race the runner finishing a second later and would take
 * a run that had genuinely completed and mark it cancelled, losing the finish.
 * Filtered this way, the update simply matches nothing and we report that.
 */
export async function stopRun(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  id: string,
): Promise<StopOutcome> {
  const { data, error } = await client
    .from("scrape_runs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
      error: "stopped from the app",
    })
    .eq("id", id)
    .in("status", ACTIVE)
    .select(RUN_SELECT)
    .maybeSingle();

  // supabase-js RESOLVES a failed write with { data: null, error }, so `data`
  // alone cannot tell "there was nothing to stop" from "the write did not run".
  // Reported apart: the first is a state to explain, the second is a failure, and
  // telling Jake the run is stopped when the write never landed is the one answer
  // that leaves him watching a bar that will never move.
  if (error) {
    console.error("[leads/stop] update failed", error.message);
    return { ok: false, reason: "failed" };
  }
  if (!data) return { ok: false, reason: "not_active" };
  return { ok: true, run: shapeRun(data as Parameters<typeof shapeRun>[0]) };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "Which run?" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const outcome = await stopRun(client, id);

  if (!outcome.ok) {
    return outcome.reason === "not_active"
      ? Response.json({ error: "That run has already finished." }, { status: 409 })
      : Response.json({ error: "could not stop that run" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.run.stop", null, {
    runId: id,
    doneQueries: outcome.run.doneQueries,
    totalQueries: outcome.run.totalQueries,
  });

  return Response.json({ run: outcome.run });
};
