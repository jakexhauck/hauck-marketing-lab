import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";

// GET /api/admin/errors?hours=24
//
// Reads back the background failure receipts that lib/errorLog.ts writes
// (0119). This is the "what actually broke while nobody was watching" surface:
// webhook side effects, cron handlers and uncaught API errors all land here
// instead of dying in console output inside an isolate.
//
// Admin-only via _middleware.ts. Hired roles get 403 by default (no allowlist
// entry), which is correct: receipts can carry vendor error text.
//
// Response shape:
//   counts:   { hour, day }        burst detection at a glance
//   latest:   newest N receipts    source + message + when, for reading

interface ErrorRow {
  id: string;
  created_at: string;
  source: string;
  message: string;
}

const MAX_HOURS = 168; // one week; the retention delete keeps the table honest anyway

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const hoursRaw = Number(url.searchParams.get("hours")) || 24;
  const hours = Math.min(Math.max(hoursRaw, 1), MAX_HOURS);

  const sinceDay = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [dayRes, hourRes, latestRes] = await Promise.all([
    client
      .from("error_log")
      .select("id", { count: "exact", head: true })
      .gt("created_at", sinceDay),
    client
      .from("error_log")
      .select("id", { count: "exact", head: true })
      .gt("created_at", sinceHour),
    client
      .from("error_log")
      .select("id, created_at, source, message")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (dayRes.error) return Response.json({ error: dayRes.error.message }, { status: 500 });
  if (hourRes.error) return Response.json({ error: hourRes.error.message }, { status: 500 });
  if (latestRes.error) return Response.json({ error: latestRes.error.message }, { status: 500 });

  return Response.json(
    {
      windowHours: hours,
      counts: {
        day: dayRes.count ?? 0,
        hour: hourRes.count ?? 0,
      },
      latest: (latestRes.data ?? []) as ErrorRow[],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
