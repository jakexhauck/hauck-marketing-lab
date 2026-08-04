// GET  /api/admin/schedule  what she is open, as she set it
// PUT  /api/admin/schedule  replace the weekly schedule
//
// The weekly schedule is read back from the recurring events themselves rather
// than from a saved copy, so the page always shows what is actually in force,
// including anything she changed in the Google Calendar app.

import { TIMEZONE } from "../../lib/config.ts";
import { dateInZone } from "../../lib/time.ts";
import type { Env } from "../../lib/composio.ts";
import { connectedAccountId } from "../../lib/calendar.ts";
import {
  addExtraDay,
  deleteEvent,
  ensureHoursCalendar,
  findHoursCalendar,
  listExtraDays,
  type OpenWindow,
  readWeekly,
  writeWeekly,
} from "../../lib/hoursCalendar.ts";
import { type AdminEnv, requireAdmin } from "../../lib/adminAuth.ts";
import { cleanText, fail, json } from "../../lib/http.ts";

type Ctx = { request: Request; env: Env & AdminEnv };

// "13:30", on the half hour or better. Anything else would produce a window
// the slot grid can never land on.
function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Rejects rather than repairs. A schedule that is nearly what she typed is
// worse than one she is asked to fix, because she will not notice.
export function parseWeekly(raw: unknown): { windows: OpenWindow[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Send a list of windows" };
  if (raw.length > 40) return { error: "That is more windows than a week can hold" };

  const windows: OpenWindow[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    const weekday = Number(item?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { error: "Every window needs a day of the week" };
    }
    if (!validTime(item?.from) || !validTime(item?.to)) {
      return { error: "Times need to look like 13:30" };
    }
    if (item.to <= item.from) {
      return { error: "A window has to end after it starts" };
    }
    windows.push({ weekday, from: item.from, to: item.to });
  }

  // Overlapping windows on one day would offer the same start time twice.
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i];
      const b = windows[j];
      if (a.weekday === b.weekday && a.from < b.to && b.from < a.to) {
        return { error: "Two windows on the same day overlap" };
      }
    }
  }

  return { windows };
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  const calendarId = await findHoursCalendar(context.env, accountId);
  if (!calendarId) {
    // Nothing set up yet: the booking page is running on the hardcoded hours.
    return json({ timezone: TIMEZONE, usingFallback: true, weekly: [], extraDays: [] });
  }

  const [weekly, extraDays] = await Promise.all([
    readWeekly(context.env, accountId, calendarId),
    listExtraDays(context.env, accountId, calendarId),
  ]);
  return json({ timezone: TIMEZONE, usingFallback: false, weekly, extraDays });
}

export async function onRequestPut(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return fail("Bad request body", 400);
  }

  const parsed = parseWeekly(payload.weekly);
  if ("error" in parsed) return fail(parsed.error, 400);

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  try {
    const calendarId = await ensureHoursCalendar(context.env, accountId);
    await writeWeekly(context.env, accountId, calendarId, parsed.windows, dateInZone(Date.now(), TIMEZONE));
    const weekly = await readWeekly(context.env, accountId, calendarId);
    return json({ ok: true, weekly, openNothing: weekly.length === 0 });
  } catch {
    return fail("Could not save that to your calendar just now", 502);
  }
}

// A one-off extra day, on top of the weekly schedule.
export async function onRequestPost(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return fail("Bad request body", 400);
  }

  const date = cleanText(payload.date, 10);
  if (!validDate(date)) return fail("Pick a date", 400);
  if (!validTime(payload.from) || !validTime(payload.to)) return fail("Times need to look like 13:30", 400);
  if ((payload.to as string) <= (payload.from as string)) return fail("A window has to end after it starts", 400);

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  try {
    const calendarId = await ensureHoursCalendar(context.env, accountId);
    await addExtraDay(context.env, accountId, calendarId, date, payload.from as string, payload.to as string);
    return json({ ok: true, extraDays: await listExtraDays(context.env, accountId, calendarId) }, 201);
  } catch {
    return fail("Could not add that to your calendar just now", 502);
  }
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const denied = await requireAdmin(context.request, context.env);
  if (denied) return denied;

  const eventId = new URL(context.request.url).searchParams.get("eventId") ?? "";
  if (!eventId) return fail("Which one?", 400);

  const accountId = await connectedAccountId(context.env);
  if (!accountId) return fail("Calendar is not connected yet", 503);

  const calendarId = await findHoursCalendar(context.env, accountId);
  if (!calendarId) return fail("No hours calendar yet", 404);

  try {
    await deleteEvent(context.env, accountId, calendarId, eventId);
    return json({ ok: true, extraDays: await listExtraDays(context.env, accountId, calendarId) });
  } catch {
    return fail("Could not remove that just now", 502);
  }
}
