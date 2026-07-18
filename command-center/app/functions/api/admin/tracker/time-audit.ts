import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Time Audit blocks for the Operations pillar. Agency-internal, so there is no
// tenant scoping here: one agency, one set of rows, gated by the admin
// middleware on /api/admin/*.
//
// A block exists only while it is tagged. GET returns the tagged blocks of one
// week; PATCH either upserts one block or deletes it, which is why there is no
// POST or DELETE route: click-to-cycle is a single round-trip either way.

const LEVERAGES = ["Low", "Low-Mid", "Mid", "Mid-High", "High"] as const;
const TASK_TYPES = [
  "Outreach",
  "Sales calls",
  "Roleplays",
  "Scraping leads",
  "Scrolling",
  "Admin",
] as const;

type Leverage = (typeof LEVERAGES)[number];
type TaskType = (typeof TASK_TYPES)[number];

const SELECT = "day_of_week, slot, leverage, task_type";

const SLOT_COUNT = 32;

interface BlockRow {
  day_of_week: number;
  slot: number;
  leverage: Leverage;
  task_type: TaskType;
}

function toBlock(row: BlockRow) {
  return {
    dayOfWeek: row.day_of_week,
    slot: row.slot,
    leverage: row.leverage,
    taskType: row.task_type,
  };
}

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isCellIndex(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

// GET /api/admin/tracker/time-audit?week=YYYY-MM-DD  (admin-only)
// `week` is the Monday of the week. An untagged week is a 200 with an empty
// array, never a 404: the grid is always renderable.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const week = new URL(ctx.request.url).searchParams.get("week");
  if (!isIsoDate(week)) {
    return Response.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
  }

  const { data, error } = await client
    .from("time_audit_blocks")
    .select(SELECT)
    .eq("week_start", week);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const blocks = ((data ?? []) as unknown as BlockRow[]).map(toBlock);
  return Response.json({ weekStart: week, blocks });
};

interface PatchBody {
  weekStart?: string;
  dayOfWeek?: number;
  slot?: number;
  leverage?: string;
  // null (or clear:true) means "untag this block", which deletes the row.
  taskType?: string | null;
  clear?: boolean;
}

// PATCH /api/admin/tracker/time-audit  (admin-only)
// Sets one block: { weekStart, dayOfWeek, slot, leverage, taskType }.
// Clears one block: { weekStart, dayOfWeek, slot, taskType: null } or clear:true.
// Everything is re-validated here even though the same rules are CHECK
// constraints in 0031, so a bad body is a 400 and not a 500 from Postgres.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const weekStart = body.weekStart;
  if (!isIsoDate(weekStart)) {
    return Response.json({ error: "weekStart must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!isCellIndex(body.dayOfWeek, 6)) {
    return Response.json({ error: "dayOfWeek must be 0 to 6" }, { status: 400 });
  }
  if (!isCellIndex(body.slot, SLOT_COUNT - 1)) {
    return Response.json({ error: `slot must be 0 to ${SLOT_COUNT - 1}` }, { status: 400 });
  }
  const dayOfWeek = body.dayOfWeek;
  const slot = body.slot;

  const match = { week_start: weekStart, day_of_week: dayOfWeek, slot };

  if (body.clear === true || body.taskType === null) {
    const { error } = await client.from("time_audit_blocks").delete().match(match);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAdminAction(client, ctx.data.admin!.id, "time_audit.clear", null, {
      weekStart,
      dayOfWeek,
      slot,
      taskType: null,
    });
    return Response.json({ cleared: true });
  }

  const taskType = body.taskType;
  if (!TASK_TYPES.includes(taskType as TaskType)) {
    return Response.json({ error: "unknown taskType" }, { status: 400 });
  }
  const leverage = body.leverage;
  if (!LEVERAGES.includes(leverage as Leverage)) {
    return Response.json({ error: "unknown leverage" }, { status: 400 });
  }

  // Whitelisted columns only: the raw body never reaches the table.
  const row = {
    ...match,
    leverage: leverage as Leverage,
    task_type: taskType as TaskType,
    updated_by: ctx.data.admin!.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("time_audit_blocks")
    .upsert(row, { onConflict: "week_start,day_of_week,slot" })
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save block" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "time_audit.tag", null, {
    weekStart,
    dayOfWeek,
    slot,
    taskType,
  });

  return Response.json({ block: toBlock(data as unknown as BlockRow) });
};
