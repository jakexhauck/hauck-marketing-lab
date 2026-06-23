import type { Env, ApiData } from "../../../../lib/env";
import { tenantTimezone } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  calendarConnection,
  getCalendarAccessToken,
  insertEvent,
  listEvents,
  type GoogleCalEvent,
} from "../../../../lib/calendarGoogle";

interface BlockRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string;
  google_event_id: string | null;
}

interface ApiWorkBlock {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  color: string;
  googleEventId: string | null;
}

function toBlock(r: BlockRow): ApiWorkBlock {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    color: r.color,
    googleEventId: r.google_event_id,
  };
}

const DAY = 24 * 60 * 60_000;

// GET /api/admin/calendar/blocks?from=&to=
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const now = Date.now();
  const parseMs = (raw: string | null, fb: number) => {
    if (!raw) return fb;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : fb;
  };
  const fromMs = parseMs(url.searchParams.get("from"), now - 7 * DAY);
  const toMs = parseMs(url.searchParams.get("to"), now + 45 * DAY);
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const { data, error } = await supabase
    .from("work_blocks")
    .select("id, title, starts_at, ends_at, color, google_event_id")
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const blocks = ((data ?? []) as BlockRow[]).map(toBlock);

  const conn = await calendarConnection(supabase);
  let googleEvents: GoogleCalEvent[] = [];
  let syncError: string | undefined;
  if (conn.connected) {
    try {
      const token = await getCalendarAccessToken(ctx.env, supabase);
      googleEvents = await listEvents(token, conn.calendarId, fromIso, toIso);
    } catch (e) {
      // Degrade: the page still renders blocks if the overlay fetch fails.
      syncError = e instanceof Error ? e.message : "Google overlay unavailable";
      console.warn("[calendar.blocks] overlay fetch failed", e);
    }
  }

  return Response.json({
    blocks,
    googleEvents,
    connection: { connected: conn.connected, email: conn.email },
    ...(syncError ? { syncError } : {}),
  });
};

interface CreateBody {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
}

// POST /api/admin/calendar/blocks
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const startMs = Date.parse(body.startsAt ?? "");
  const endMs = Date.parse(body.endsAt ?? "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return Response.json({ error: "valid startsAt/endsAt required (end after start)" }, { status: 400 });
  }
  const color = (body.color ?? "deep").trim() || "deep";

  // Mirror to Google first (best effort) so we can store the event id in one write.
  let googleEventId: string | null = null;
  const conn = await calendarConnection(supabase);
  let googleSyncFailed = false;
  if (conn.connected) {
    try {
      const token = await getCalendarAccessToken(ctx.env, supabase);
      googleEventId = await insertEvent(
        token,
        conn.calendarId,
        { title, startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() },
        tenantTimezone(ctx.env),
      );
    } catch (e) {
      googleSyncFailed = true;
      console.warn("[calendar.blocks] google insert failed", e);
    }
  }

  const { data, error } = await supabase
    .from("work_blocks")
    .insert({
      title,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      color,
      google_event_id: googleEventId,
      created_by: ctx.data.admin?.id ?? null,
    })
    .select("id, title, starts_at, ends_at, color, google_event_id")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "could not create block" }, { status: 500 });

  const payload: { block: ApiWorkBlock; syncWarning?: string } = { block: toBlock(data as BlockRow) };
  if (conn.connected && googleSyncFailed) {
    payload.syncWarning = "Saved. Google sync failed, will retry on next edit.";
  }
  return Response.json(payload, { status: 201 });
};
