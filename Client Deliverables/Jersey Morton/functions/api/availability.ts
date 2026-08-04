// GET /api/availability?service=&addons=&from=&days=
//
// Open start times per day. One freebusy read of her Google calendar covers
// the whole span.

import { BOOKING_HORIZON_DAYS, TIMEZONE } from "../lib/config.ts";
import { type Interval, slotsForDate } from "../lib/availability.ts";
import { addDays, dateInZone, isValidDate } from "../lib/time.ts";
import { findService, quote, resolveAddons } from "../lib/services.ts";
import type { Env } from "../lib/composio.ts";
import { connectedAccountId, getBusy } from "../lib/calendar.ts";
import { fail, json } from "../lib/http.ts";

const MAX_DAYS_PER_REQUEST = 21;

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url);
  const env = context.env;

  const service = findService(url.searchParams.get("service"));
  if (!service) return fail("Unknown service", 400);

  const addons = resolveAddons(service, (url.searchParams.get("addons") ?? "").split(",").filter(Boolean));
  const { minutes } = quote(service, addons);

  const now = Date.now();
  const today = dateInZone(now, TIMEZONE);
  const from = url.searchParams.get("from") ?? today;
  if (!isValidDate(from)) return fail("Bad from date", 400);
  // Never let a crafted "from" reach back before today.
  const start = from < today ? today : from;

  const asked = Number(url.searchParams.get("days") ?? 14);
  const days = Math.min(Math.max(Number.isFinite(asked) ? asked : 14, 1), MAX_DAYS_PER_REQUEST);
  const lastAllowed = addDays(today, BOOKING_HORIZON_DAYS);

  const accountId = await connectedAccountId(env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  // Padded a day either side so an appointment straddling midnight in UTC is
  // still seen, and so a booking running past 18:00 is counted on its own day.
  const windowFrom = new Date(Date.parse(`${addDays(start, -1)}T00:00:00Z`)).toISOString();
  const windowTo = new Date(Date.parse(`${addDays(start, days + 1)}T00:00:00Z`)).toISOString();

  let busy: Interval[];
  try {
    busy = await getBusy(env, accountId, windowFrom, windowTo);
  } catch {
    // An unreadable calendar must not read as a wide open fortnight.
    return fail("Could not read the calendar just now", 503);
  }

  const out: { date: string; slots: string[]; startIsos: string[] }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    if (date > lastAllowed) break;
    const slots = slotsForDate({ dateISO: date, minutes, busy, nowMs: now });
    out.push({
      date,
      slots: slots.map((s) => s.time),
      startIsos: slots.map((s) => s.startIso),
    });
  }

  return json({ timezone: TIMEZONE, service: service.id, minutes, horizonEnd: lastAllowed, days: out });
}
