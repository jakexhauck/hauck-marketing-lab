import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";

// Cold SMS > A/B script test. One row per opener variation, displayed in
// sort_order. Agency-global: no tenant.
//
// Positive Reply % and Booking % are computed client-side in
// src/lib/coldSms.ts and never stored.

interface ScriptRow {
  id: string;
  name: string;
  total_sent: number | null;
  positive_replies: number | null;
  calls_booked: number | null;
  clients_closed: number | null;
  sort_order: number;
}

const SELECT =
  "id, name, total_sent, positive_replies, calls_booked, clients_closed, sort_order";

function toRow(row: ScriptRow) {
  return {
    id: row.id,
    name: row.name,
    totalSent: row.total_sent,
    positiveReplies: row.positive_replies,
    callsBooked: row.calls_booked,
    clientsClosed: row.clients_closed,
    sortOrder: row.sort_order,
  };
}

// A blank cell must round-trip as blank, never as a fabricated 0.
function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const COUNT_FIELDS = ["total_sent", "positive_replies", "calls_booked", "clients_closed"] as const;

// GET /api/admin/tracker/cold-sms-script: every variation, in display order.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("cold_sms_script_test")
    .select(SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ rows: ((data ?? []) as unknown as ScriptRow[]).map(toRow) });
};

type WriteBody = Record<string, unknown> & { id?: unknown; name?: unknown };

// POST /api/admin/tracker/cold-sms-script: add a variation at the end.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: WriteBody = {};
  try {
    body = (await ctx.request.json()) as WriteBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  // Next slot in the display order. A fresh table has no rows, so start at 0.
  const { data: last } = await client
    .from("cold_sms_script_test")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = last ? ((last as { sort_order: number }).sort_order ?? 0) + 1 : 0;

  const insert: Record<string, unknown> = { name, sort_order: sortOrder };
  for (const field of COUNT_FIELDS) {
    if (field in body) insert[field] = toIntOrNull(body[field]);
  }

  const { data, error } = await client
    .from("cold_sms_script_test")
    .insert(insert)
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "could not create variation" },
      { status: 500 },
    );
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_script.create", null, insert);

  return Response.json({ row: toRow(data as unknown as ScriptRow) }, { status: 201 });
};

// PATCH /api/admin/tracker/cold-sms-script: edit one variation by id.
// Only the supplied whitelisted fields are written.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: WriteBody = {};
  try {
    body = (await ctx.request.json()) as WriteBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "name cannot be empty" }, { status: 400 });
    update.name = name;
  }
  for (const field of COUNT_FIELDS) {
    if (field in body) update[field] = toIntOrNull(body[field]);
  }

  const { data, error } = await client
    .from("cold_sms_script_test")
    .update(update)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "could not update variation" },
      { status: 500 },
    );
  }

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_script.update", null, { id, ...update });

  return Response.json({ row: toRow(data as unknown as ScriptRow) });
};

// DELETE /api/admin/tracker/cold-sms-script?id=<uuid>
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const id = new URL(ctx.request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const { error } = await client.from("cold_sms_script_test").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "cold_sms_script.delete", null, { id });

  return Response.json({ ok: true });
};
