import type { ApiActivity } from "../../lib/api";
import { formatDate } from "../../lib/format";

export interface DayGroup<T extends ApiActivity> {
  key: string;
  label: string;
  events: T[];
}

// Midnight of the given date, used to compare calendar days regardless of time.
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const that = startOfDay(date);
  const oneDay = 86_400_000;
  if (that === today) return "Today";
  if (that === today - oneDay) return "Yesterday";
  // Include the year only when it differs from the current one.
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return formatDate(
    date,
    sameYear
      ? { weekday: "short", month: "short", day: "numeric" }
      : { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  );
}

// Group already-sorted-newest-first events into day buckets, preserving order.
// Events with an unparseable created_at fall into a single "Earlier" bucket at
// the end so they never silently vanish.
export function groupByDay<T extends ApiActivity>(events: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const index = new Map<string, DayGroup<T>>();

  for (const ev of events) {
    const date = new Date(ev.created_at);
    const valid = !Number.isNaN(date.getTime());
    const key = valid
      ? String(startOfDay(date))
      : "earlier";
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        label: valid ? dayLabel(date) : "Earlier",
        events: [],
      };
      index.set(key, group);
      groups.push(group);
    }
    group.events.push(ev);
  }

  return groups;
}
