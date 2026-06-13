// Shared day-bucketing for date-grouped feeds (notifications, calendar).
// Items with an unparseable or missing key are dropped. Labeling and sort
// order stay with the caller; the semantics differ per screen ("Yesterday"
// vs "Tomorrow", ascending vs descending).
export function groupByDayKey<T>(
  items: T[],
  keyOf: (item: T) => string | null,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const list = byDay.get(key) ?? [];
    list.push(item);
    byDay.set(key, list);
  }
  return byDay;
}
