// The times a callback can be agreed for, and how one reads.
//
// Pure: no React, no network, so the picker and the queue badge cannot disagree
// about what "14:30" means.
//
// Stored as "HH:MM" in a `time` column (0064) rather than folded into the date.
// A callback is a day, optionally with a time; those are two different promises
// and the queue has always been built on the day.

// Half-hourly through a working day. Half hours because a callback is agreed out
// loud ("about two"), not negotiated to the minute, and a list of 96 quarter
// hours is a list nobody scrolls.
export const CALLBACK_START_HOUR = 8;
export const CALLBACK_END_HOUR = 20;

export function buildCallbackTimes(): string[] {
  const out: string[] = [];
  for (let h = CALLBACK_START_HOUR; h < CALLBACK_END_HOUR; h += 1) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
}

export const CALLBACK_TIMES: string[] = buildCallbackTimes();

const HHMM = /^(\d{1,2}):(\d{2})/;

// Split "14:30" (or the "14:30:00" Postgres hands back for a time column) into
// its parts. Null for anything that is not a real time, so a bad value renders
// as no time rather than as "NaN:undefined".
export function parseTime(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// "14:30" -> "2:30 pm". Lower-case meridiem, because it sits inside sentences
// and next to numbers rather than in a heading.
export function formatTime(value: string | null | undefined): string {
  const parsed = parseTime(value);
  if (!parsed) return "";
  const { hour, minute } = parsed;
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// Postgres returns a `time` column as "14:30:00". The picker compares against
// its own "14:30" values, so both sides are reduced to the same shape.
export function normalizeTime(value: string | null | undefined): string {
  const parsed = parseTime(value);
  if (!parsed) return "";
  return `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
}

// "Thu 30 Jul" / "Thu 30 Jul, 2:30 pm". The day is never dropped: a time on its
// own is not a callback anybody can keep.
export function describeCallback(
  dateIso: string | null | undefined,
  time?: string | null,
): string {
  if (!dateIso) return "";
  // Midday avoids the date shifting a day backwards west of UTC.
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const at = formatTime(time);
  return at ? `${day}, ${at}` : day;
}
