import type { ApiCalendarEvent } from "@hauck/core";
import { formatDate } from "@/lib/format";

// Pure grouping + labelling logic for the agenda, kept out of the view so the
// time-scope filters and day headers stay easy to reason about and test.

export type Scope = "upcoming" | "all" | "past";

export interface DayGroup {
  // Stable key (YYYY-MM-DD in local time) used for React keys and sticky heads.
  key: string;
  // Smart label: "Today", "Tomorrow", or "Thu, Jun 12".
  label: string;
  // Relative day offset from today, negative for past, used for accenting.
  offset: number;
  events: ApiCalendarEvent[];
}

// Events without a startTime can't be placed on the agenda; treat the rest as
// timed. We sort ascending by start so the readout flows top to bottom.
function startMs(e: ApiCalendarEvent): number {
  const t = e.startTime ? new Date(e.startTime).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

// Local midnight for a date, so a day key never crosses a timezone boundary mid
// render.
function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Whole-day difference between two local dates.
function dayOffset(target: Date, today: Date): number {
  const ms = dayStart(target).getTime() - dayStart(today).getTime();
  return Math.round(ms / 86_400_000);
}

export function dayLabel(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return formatDate(date, { weekday: "short", month: "short", day: "numeric" });
}

// Apply the time-scope filter relative to "now". Events with no start are only
// kept under "all" so they remain reachable rather than silently dropped.
export function filterByScope(
  events: ApiCalendarEvent[],
  scope: Scope,
  now: number,
): ApiCalendarEvent[] {
  if (scope === "all") return events;
  return events.filter((e) => {
    const s = startMs(e);
    if (!Number.isFinite(s)) return false;
    return scope === "upcoming" ? s >= now : s < now;
  });
}

// Count of events in each scope so the segmented control can show live totals.
export function scopeCounts(
  events: ApiCalendarEvent[],
  now: number,
): Record<Scope, number> {
  let upcoming = 0;
  let past = 0;
  for (const e of events) {
    const s = startMs(e);
    if (!Number.isFinite(s)) continue;
    if (s >= now) upcoming += 1;
    else past += 1;
  }
  return { upcoming, all: events.length, past };
}

// Group sorted events into labelled days. Input need not be pre-sorted.
export function groupByDay(events: ApiCalendarEvent[], now: Date): DayGroup[] {
  const sorted = [...events].sort((a, b) => startMs(a) - startMs(b));
  const groups = new Map<string, DayGroup>();
  for (const e of sorted) {
    if (!e.startTime) continue;
    const d = new Date(e.startTime);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: dayLabel(d, now), offset: dayOffset(d, now), events: [] };
      groups.set(key, group);
    }
    group.events.push(e);
  }
  return [...groups.values()];
}

// Today's event count, surfaced as a real (non fabricated) stat.
export function countOnDay(events: ApiCalendarEvent[], now: Date): number {
  const key = dayKey(now);
  return events.filter((e) => {
    if (!e.startTime) return false;
    const d = new Date(e.startTime);
    return !Number.isNaN(d.getTime()) && dayKey(d) === key;
  }).length;
}
