import type { Env, ApiData } from "../../../../lib/env";
import { tenantTimezone } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  calendarConnection,
  getCalendarAccessToken,
  insertEvent,
  patchEvent,
  deleteEvent,
} from "../../../../lib/calendarGoogle";

interface BlockRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string;
  google_event_id: string | null;
}

function toBlock(r: BlockRow) {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    color: r.color,
    googleEventId: r.google_event_id,
  };
}

interface PatchBody {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
}

// PATCH /api/admin/calendar/blocks/:blockId
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const blockId = ctx.params.blockId as string;

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return Response.json({ error: "title cannot be empty" }, { status: 400 });
    update.title = t;
  }
  if (typeof body.color === "string" && body.color.trim()) update.color = body.color.trim();
  if (typeof body.startsAt === "string") {
    const ms = Date.parse(body.startsAt);
    if (!Number.isFinite(ms)) return Response.json({ error: "invalid startsAt" }, { status: 400 });
    update.starts_at = new Date(ms).toISOString();
  }
  if (typeof body.endsAt === "string") {
    const ms = Date.parse(body.endsAt);
    if (!Number.isFinite(ms)) return Response.json({ error: "invalid endsAt" }, { status: 400 });
    update.ends_at = new Date(ms).toISOString();
  }

  const { data, error } = await supabase
    .from("work_blocks")
    .update(update)
    .eq("id", blockId)
    .select("id, title, starts_at, ends_at, color, google_event_id")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "block not found" }, { status: 404 });
  const row = data as BlockRow;

  // Mirror the edit to Google (best effort). Create the event if missing.
  const conn = await calendarConnection(supabase);
  if (conn.connected && (update.starts_at || update.ends_at || update.title)) {
    try {
      const token = await getCalendarAccessToken(ctx.env, supabase);
      const ev = { title: row.title, startsAt: row.starts_at, endsAt: row.ends_at };
      if (row.google_event_id) {
        await patchEvent(token, conn.calendarId, row.google_event_id, ev, tenantTimezone(ctx.env));
      } else {
        const newId = await insertEvent(token, conn.calendarId, ev, tenantTimezone(ctx.env));
        await supabase.from("work_blocks").update({ google_event_id: newId }).eq("id", blockId);
        row.google_event_id = newId;
      }
    } catch (e) {
      console.warn("[calendar.blocks] google patch failed", e);
    }
  }

  return Response.json({ block: toBlock(row) });
};

// DELETE /api/admin/calendar/blocks/:blockId
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const blockId = ctx.params.blockId as string;

  // Read the google_event_id before deleting so we can clean up the mirror.
  const { data } = await supabase
    .from("work_blocks")
    .select("google_event_id")
    .eq("id", blockId)
    .maybeSingle();
  const googleEventId = (data as { google_event_id: string | null } | null)?.google_event_id ?? null;

  const { error } = await supabase.from("work_blocks").delete().eq("id", blockId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (googleEventId) {
    const conn = await calendarConnection(supabase);
    if (conn.connected) {
      try {
        const token = await getCalendarAccessToken(ctx.env, supabase);
        await deleteEvent(token, conn.calendarId, googleEventId);
      } catch (e) {
        console.warn("[calendar.blocks] google delete failed", e);
      }
    }
  }

  return Response.json({ ok: true });
};
