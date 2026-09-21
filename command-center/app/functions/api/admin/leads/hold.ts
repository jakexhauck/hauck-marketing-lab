import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { SELECT as RUN_SELECT, shapeRun } from "./runs";

// POST /api/admin/leads/hold -> park a scrape without ending it.
//
// Stop's twin, and it works the same way: the row is the authority. This writes
// 'held', and the runner, which re-reads the row between keywords, sees a row
// that is no longer 'running', saves its place and leaves the status alone. The
// run's place stays in data/queue_<id>.jsonl on the machine working it, so
// Continue (resume.ts) picks up where it stood.
//
// The runner writes 'held' itself when a run reaches its cap (lead_cap). This is
// the same state reached by hand.
//
// Queued or running only. A finished run has nothing to park, and a 'preparing'
// run is flipped to 'queued' by the CRM sweep in runs.ts, which would quietly
// undo the hold a few seconds later.
const HOLDABLE = ["queued", "running"];

interface PostBody {
  id?: unknown;
}

export type HoldOutcome =
  | { ok: true; run: ReturnType<typeof shapeRun> }
  | { ok: false; reason: "not_active" | "failed" };

/** Flip one queued or running run to 'held'. The status filter travels with the write. */
export async function holdRun(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  id: string,
): Promise<HoldOutcome> {
  const { data, error } = await client
    .from("scrape_runs")
    .update({ status: "held" })
    .eq("id", id)
    .in("status", HOLDABLE)
    .select(RUN_SELECT)
    .maybeSingle();

  // supabase-js resolves a failed write with { data: null, error }: read the
  // error first, or a write that never ran reads as "nothing to hold".
  if (error) {
    console.error("[leads/hold] update failed", error.message);
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

  const outcome = await holdRun(client, id);

  if (!outcome.ok) {
    return outcome.reason === "not_active"
      ? Response.json({ error: "That run is not running." }, { status: 409 })
      : Response.json({ error: "could not hold that run" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.run.hold", null, {
    runId: id,
    newCount: outcome.run.added,
  });

  return Response.json({ run: outcome.run });
};
