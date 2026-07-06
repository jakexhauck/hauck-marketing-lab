import { ORIGINS, convOrigin, type InboxView, type OriginKey } from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

// The single row of filter pills for a channel page: "Needs reply" and "All"
// (both always shown), then one pill per lead source present in this channel
// (Paid Ad, Estimate Form, Chat Widget, ...). Replaces the old per-channel smart
// pills: the page is already scoped to one channel, so we slice it by where the
// lead came from instead. Only sources that actually have conversations appear.
export default function InboxFilterPills({
  items,
  active,
  onChange,
}: {
  items: ApiConversation[];
  active: InboxView;
  onChange: (v: InboxView) => void;
}) {
  const needsCount = items.filter((c) => c.unreadCount > 0).length;
  const originCounts = new Map<OriginKey, number>();
  for (const c of items) {
    const o = convOrigin(c);
    originCounts.set(o, (originCounts.get(o) ?? 0) + 1);
  }

  const pills: { key: InboxView; label: string; count: number }[] = [
    { key: "needs", label: "Needs reply", count: needsCount },
    { key: "all", label: "All", count: items.length },
  ];
  for (const o of ORIGINS) {
    const n = originCounts.get(o.key) ?? 0;
    if (n === 0) continue;
    pills.push({ key: o.key, label: o.label, count: n });
  }

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto"
      style={{ scrollbarWidth: "none" }}
    >
      {pills.map((p) => {
        const on = p.key === active;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            aria-pressed={on}
            className={
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-[11px] border px-3 text-[12.5px] font-semibold transition-colors " +
              (on
                ? "border-brand bg-brand text-brand-fg shadow-brand"
                : "border-border bg-surface text-muted hover:border-border-strong")
            }
          >
            {p.label}
            <span
              className={
                "rounded-[8px] px-1.5 py-px font-data text-[10.5px] font-bold tabular-nums " +
                (on ? "bg-white/20 text-brand-fg" : "bg-surface-2 text-muted")
              }
            >
              {p.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
