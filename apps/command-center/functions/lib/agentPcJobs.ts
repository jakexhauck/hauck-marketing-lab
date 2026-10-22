import type { SupabaseClient } from "@supabase/supabase-js";
import type { PcJob, PcJobBody, PcJobStatus } from "../../src/lib/agentWire";
import { isUuid } from "./agentItems";
import { creativeTurn, type Refusal } from "./agentCreative";

// PC jobs (migration 0177, docs/build-plans/hermes-ads.md).
//
// The Ads Agent answers from the VPS runner, which cannot render video. Its
// turn queues the clip work here and waits; the PC runner claims it, reports
// its steps and posts the result. The runner secret is all either side has,
// so the rules that matter are checked against the app's own rows:
//
//   create   only for a running Ads turn at that client (creativeTurn), the
//            same check every upload makes
//   create   also cancels any job still open for the same message: a turn
//            the app requeued after a runner died starts clean
//   claim    the oldest queued job whose message is still running and that
//            was queued in the last few minutes; anything else is cancelled
//            instead of handed out (the VPS stops waiting long before)
//   step,    only by the host that claimed it, only while it runs
//   finish
//
// A job gives the PC nothing it could not already do: what it runs is the
// runner's own video pipeline, and every upload and card it makes is checked
// against the same running message as before.

type Row = Record<string, unknown>;

const TABLE = "agent_pc_jobs";
// The payload carries config files and the creative state; the result the
// transcripts the agent reads next. Both stay small, so a big one is a bug.
const MAX_PAYLOAD = 1_000_000;
const MAX_RESULT = 2_000_000;
const MAX_STEP = 200;
const CLAIM_SCAN = 10;
// The VPS gives up on an unclaimed job after 90 seconds (pcJobs.ts).
const QUEUED_MAX_MS = 3 * 60_000;

const STATUSES: PcJobStatus[] = ["queued", "running", "done", "error", "cancelled"];
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function jobFromRow(r: Row): PcJob {
  const status = STATUSES.includes(r.status as PcJobStatus) ? (r.status as PcJobStatus) : "error";
  return {
    id: r.id as string,
    messageId: r.message_id as string,
    tenantId: r.tenant_id as string,
    kind: "video",
    payload: obj(r.payload) ?? {},
    status,
    host: str(r.host),
    step: str(r.step),
    result: obj(r.result),
    error: str(r.error),
  };
}

type Out = { job: PcJob | null } | Refusal;

// A job has an error field of its own, so a refusal is told apart by its
// numeric status, never by "error" in it.
export const refused = (v: object): v is Refusal => typeof (v as { status?: unknown }).status === "number";

async function load(client: SupabaseClient, id: unknown): Promise<PcJob | Refusal> {
  if (!isUuid(id)) return { status: 400, error: "id required" };
  const { data, error } = await client.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`job: ${error.message}`);
  if (!data) return { status: 404, error: "job not found" };
  return jobFromRow(data as Row);
}

async function messageRunning(client: SupabaseClient, messageId: string): Promise<boolean> {
  const { data, error } = await client.from("agent_messages").select("id, status").eq("id", messageId).maybeSingle();
  if (error) throw new Error(`message: ${error.message}`);
  return (data as Row | null)?.status === "running";
}

async function patch(client: SupabaseClient, id: string, from: PcJobStatus, p: Row): Promise<PcJob | null> {
  const { data, error } = await client
    .from(TABLE)
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`job update: ${error.message}`);
  return data ? jobFromRow(data as Row) : null;
}

async function create(client: SupabaseClient, b: Row): Promise<Out> {
  const payload = obj(b.payload);
  if (!payload) return { status: 400, error: "payload must be an object" };
  if (JSON.stringify(payload).length > MAX_PAYLOAD) return { status: 400, error: "payload too large" };
  const turn = await creativeTurn(client, b.messageId, b.tenantId);
  if ("error" in turn) return turn;
  const { error: oldErr } = await client
    .from(TABLE)
    .update({ status: "cancelled", error: "a newer job for the same turn", updated_at: new Date().toISOString() })
    .eq("message_id", turn.message.id)
    .in("status", ["queued", "running"]);
  if (oldErr) throw new Error(`old jobs: ${oldErr.message}`);
  const { data, error } = await client
    .from(TABLE)
    .insert({ message_id: turn.message.id, tenant_id: turn.tenantId, kind: "video", payload, status: "queued" })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`job insert: ${error.message}`);
  return { job: jobFromRow(data as Row) };
}

async function claim(client: SupabaseClient, host: string, now: Date): Promise<Out> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(CLAIM_SCAN);
  if (error) throw new Error(`jobs: ${error.message}`);
  for (const row of (data ?? []) as Row[]) {
    const job = jobFromRow(row);
    if (now.getTime() - Date.parse(String(row.created_at)) > QUEUED_MAX_MS) {
      await patch(client, job.id, "queued", { status: "cancelled", error: "nobody took it in time" });
      continue;
    }
    if (!(await messageRunning(client, job.messageId))) {
      await patch(client, job.id, "queued", { status: "cancelled", error: "the turn had already finished" });
      continue;
    }
    // Only one runner wins a queued row: the update names the status it read.
    const got = await patch(client, job.id, "queued", { status: "running", host, step: "Claimed" });
    if (got) return { job: got };
  }
  return { job: null };
}

async function owned(client: SupabaseClient, b: Row): Promise<PcJob | Refusal> {
  const job = await load(client, b.id);
  if (refused(job)) return job;
  if (job.status !== "running") return { status: 409, error: `job is ${job.status}` };
  if (!b.host || job.host !== b.host) return { status: 403, error: "another host has this job" };
  return job;
}

async function step(client: SupabaseClient, b: Row): Promise<Out> {
  const job = await owned(client, b);
  if (refused(job)) return job;
  const text = (str(b.step) ?? "").slice(0, MAX_STEP);
  return { job: (await patch(client, job.id, "running", { step: text })) ?? job };
}

async function finish(client: SupabaseClient, b: Row): Promise<Out> {
  const job = await owned(client, b);
  if (refused(job)) return job;
  const err = str(b.error);
  const result = obj(b.result);
  if (!err && !result) return { status: 400, error: "result or error required" };
  if (result && JSON.stringify(result).length > MAX_RESULT) return { status: 400, error: "result too large" };
  const p = err ? { status: "error", error: err.slice(0, 2000) } : { status: "done", result };
  const done = await patch(client, job.id, "running", p);
  return done ? { job: done } : { status: 409, error: "job changed meanwhile" };
}

// Against whatever status the job has now: a claim landing between the read
// and the write is read again, so the caller always gets the job as it ends up.
// ifStatus "queued" cancels only a job nobody has taken: the VPS giving up on
// an unclaimed job must not stop a PC that took it that same moment.
async function cancel(client: SupabaseClient, b: Row): Promise<Out> {
  for (let i = 0; i < 3; i++) {
    const job = await load(client, b.id);
    if (refused(job)) return job;
    if (job.status !== "queued" && job.status !== "running") return { job };
    if (b.ifStatus === "queued" && job.status !== "queued") return { job };
    const done = await patch(client, job.id, job.status, { status: "cancelled" });
    if (done) return { job: done };
  }
  const job = await load(client, b.id);
  return refused(job) ? job : { job };
}

/** One pc-job call. Returns the job (or null for an empty claim), or why not. */
export async function pcJob(client: SupabaseClient, body: Partial<PcJobBody> | null, now: Date = new Date()): Promise<Out> {
  const b = (obj(body) ?? {}) as Row;
  switch (b.action) {
    case "create":
      return create(client, b);
    case "get": {
      const job = await load(client, b.id);
      return refused(job) ? job : { job };
    }
    case "claim":
      return str(b.host)?.trim() ? claim(client, (b.host as string).trim(), now) : { status: 400, error: "host required" };
    case "step":
      return step(client, b);
    case "finish":
      return finish(client, b);
    case "cancel":
      return cancel(client, b);
    default:
      return { status: 400, error: "unknown action" };
  }
}
