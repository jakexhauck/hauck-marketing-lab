// What the booking endpoints need before they can answer: her settings, and
// the windows she is open in.
//
// One place, because availability.ts and book.ts must agree exactly. If the
// page offers a slot the booking endpoint would refuse, a client fills in a
// form and is told no at the last step.

import { TIMEZONE } from "./config.ts";
import type { Interval } from "./availability.ts";
import type { Env } from "./composio.ts";
import { findHoursCalendar, readOpenWindows } from "./hoursCalendar.ts";
import { readSettings, type Settings } from "./settings.ts";

export interface Schedule {
  settings: Settings;
  // undefined means "no hours calendar, use the hardcoded fallback". An empty
  // array means "she is genuinely open nowhere in this span". Collapsing the
  // two either closes her book or opens it while she is away.
  windows: Interval[] | undefined;
}

export async function loadSchedule(
  env: Env,
  accountId: string,
  fromIso: string,
  toIso: string,
): Promise<Schedule> {
  const calendarId = await findHoursCalendar(env, accountId);
  const settings = await readSettings(env, accountId, calendarId);
  if (!calendarId) return { settings, windows: undefined };

  // An unreadable hours calendar is NOT an empty week. Letting this throw sends
  // a 503 up, the same as an unreadable busy list, because offering slots we
  // cannot verify is how two clients end up in the chair at once.
  const windows = await readOpenWindows(env, accountId, calendarId, fromIso, toIso);
  return { settings, windows };
}

export { TIMEZONE };
