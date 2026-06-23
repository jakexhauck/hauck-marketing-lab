import { useMemo } from "react";
import { categoryMeta } from "../../../lib/workBlocks";
import type { ApiWorkBlock, ApiGoogleCalEvent } from "../../../lib/api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 6 rows x 7 cols covering the visible month (leading/trailing days included).
function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function MonthGrid({
  year,
  month,
  blocks,
  googleEvents,
  onPickDay,
  onPickBlock,
}: {
  year: number;
  month: number;
  blocks: ApiWorkBlock[];
  googleEvents: ApiGoogleCalEvent[];
  onPickDay: (day: Date) => void;
  onPickBlock: (b: ApiWorkBlock) => void;
}) {
  const cells = useMemo(() => monthMatrix(year, month), [year, month]);
  const todayKey = dayKey(new Date());

  const blocksByDay = useMemo(() => {
    const m = new Map<string, ApiWorkBlock[]>();
    for (const b of blocks) {
      const k = dayKey(new Date(b.startsAt));
      (m.get(k) ?? m.set(k, []).get(k)!).push(b);
    }
    return m;
  }, [blocks]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, ApiGoogleCalEvent[]>();
    for (const e of googleEvents) {
      if (!e.startTime) continue;
      const k = dayKey(new Date(e.startTime));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [googleEvents]);

  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-7 border-b border-divider bg-surface-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === month;
          const isToday = k === todayKey;
          const dayBlocks = blocksByDay.get(k) ?? [];
          const dayEvents = eventsByDay.get(k) ?? [];
          return (
            <button
              key={k}
              onClick={() => onPickDay(d)}
              className={[
                "flex min-h-[104px] flex-col gap-1 border-b border-r border-divider p-1.5 text-left transition-colors hover:bg-surface-2",
                inMonth ? "" : "bg-surface-2/40",
              ].join(" ")}
            >
              <span
                className={[
                  "ml-auto grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
                  isToday ? "bg-brand text-brand-fg" : inMonth ? "text-text" : "text-faint",
                ].join(" ")}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {dayBlocks.map((b) => {
                  const meta = categoryMeta(b.color);
                  return (
                    <span
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onPickBlock(b); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onPickBlock(b); } }}
                      className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.chipClass}`}
                      title={b.title}
                    >
                      {timeFmt.format(new Date(b.startsAt))} {b.title}
                    </span>
                  );
                })}
                {dayEvents.map((ev) => (
                  <span
                    key={ev.id}
                    className="truncate rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] text-muted"
                    title={`Google: ${ev.title}`}
                  >
                    {ev.allDay || !ev.startTime ? "" : `${timeFmt.format(new Date(ev.startTime))} `}{ev.title}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
