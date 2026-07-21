import { useMemo, type CSSProperties } from "react";
import {
  type CalendarItem,
  CALENDAR_SOURCE_META,
  layoutWeek,
  minutesToLabel,
  packDayColumns,
  splitBusy,
} from "../../lib/calendarModel";
import { toIso, isoToLocalDate } from "../../lib/jobsPipeline";

// Direction 2: seven day columns on a time-of-day axis, every timed item placed
// at its real hour as a colored block; all-day items ride a strip up top.

const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 19 * 60;
const PPM = 52 / 60; // 52px per hour
const HOURS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN + i * 60,
);
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRID_COLS = "52px repeat(7, 1fr)";

// Bookable granularity for the optional empty-slot layer. Thirty minutes
// matches the shortest appointment GHL calendars are configured for.
const SLOT_MIN = 30;
// 07:00 to 19:00 in 30-minute steps is 24 slots per day column.
export const SLOT_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;

// Minutes past midnight at which slot `index` starts. Slot 0 is 07:00, slot 1
// is 07:30, and so on up to slot 23 at 18:30.
export function slotStartMinutes(index: number): number {
  return DAY_START_MIN + index * SLOT_MIN;
}

function weekIsos(anchorIso: string): string[] {
  const d = isoToLocalDate(anchorIso);
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) =>
    toIso(
      new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i),
    ),
  );
}

function hourLabel(min: number): string {
  const h = Math.floor(min / 60);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

export function WeekView({
  items,
  anchorIso,
  todayIso,
  onSlotClick,
}: {
  items: CalendarItem[];
  anchorIso: string;
  todayIso: string;
  // Setter Suite only. When absent, no slot layer renders at all and this
  // component behaves exactly as it does on the client Jobs tab, which is
  // read-only and must stay that way.
  onSlotClick?: (iso: string, startMinutes: number) => void;
}) {
  const isos = useMemo(() => weekIsos(anchorIso), [anchorIso]);
  const cols = useMemo(() => layoutWeek(items, isos), [items, isos]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      {/* Day header row */}
      <div
        className="grid shrink-0 border-b border-border bg-surface-2"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div />
        {isos.map((iso) => {
          const d = isoToLocalDate(iso);
          const today = iso === todayIso;
          return (
            <div key={iso} className="border-l border-divider py-2 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-faint">
                {WD[d.getDay()]}
              </div>
              <div
                className={
                  today
                    ? "mx-auto mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[13px] font-semibold text-white"
                    : "mt-0.5 font-display text-[15px] font-semibold text-text"
                }
                style={today ? { backgroundImage: "var(--grad-brand)" } : undefined}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day strip */}
      <div
        className="grid shrink-0 border-b border-divider"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div className="py-1.5 pr-1 text-right text-[9px] font-semibold uppercase text-faint">
          All day
        </div>
        {cols.map((col) => (
          <div
            key={col.iso}
            className="flex min-h-[26px] flex-col gap-1 border-l border-divider p-1"
          >
            {col.allDay.map((item) => (
              <Block key={item.id} item={item} inline />
            ))}
          </div>
        ))}
      </div>

      {/* Scrollable timed grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: GRID_COLS,
            height: (DAY_END_MIN - DAY_START_MIN) * PPM,
          }}
        >
          <div className="relative">
            {HOURS.map((min) => (
              <div
                key={min}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold text-faint"
                style={{ top: (min - DAY_START_MIN) * PPM }}
              >
                {hourLabel(min)}
              </div>
            ))}
          </div>
          {cols.map((col) => (
            <div
              key={col.iso}
              className="relative border-l border-divider"
              style={
                col.iso === todayIso
                  ? {
                      background:
                        "color-mix(in srgb, var(--brand) 5%, transparent)",
                    }
                  : undefined
              }
            >
              {HOURS.map((min) => (
                <div
                  key={min}
                  className="absolute inset-x-0 border-t border-divider/60"
                  style={{ top: (min - DAY_START_MIN) * PPM }}
                />
              ))}
              {/* Optional empty-slot layer. Sits after the hour lines but
                  before the busy bands and item blocks on purpose, so a real
                  appointment is never covered by an invisible button. The busy
                  bands are pointer-events-none, so they do not swallow a click
                  on a free stretch behind them; item blocks are not, so they
                  correctly win over the slot underneath. */}
              {onSlotClick
                ? Array.from({ length: SLOT_COUNT }, (_, i) => {
                    const min = slotStartMinutes(i);
                    return (
                      <button
                        key={min}
                        type="button"
                        onClick={() => onSlotClick(col.iso, min)}
                        aria-label={`Book ${WD[isoToLocalDate(col.iso).getDay()]} ${minutesToLabel(min)}`}
                        className="group absolute inset-x-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                        style={{
                          top: (min - DAY_START_MIN) * PPM,
                          height: SLOT_MIN * PPM,
                        }}
                      >
                        <span className="pointer-events-none rounded border border-dashed border-[var(--brand)] bg-surface px-2 text-[10px] font-semibold text-[var(--brand)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          + Book
                        </span>
                      </button>
                    );
                  })
                : null}
              {/* Busy time from the client's own linked calendar: a full-width
                  band behind the day. Rendered before the blocks and excluded
                  from lane packing, so a booked-up personal calendar shades the
                  day without shrinking the real jobs. */}
              {splitBusy(col.timed).busy.map((b) => {
                const start = b.startMinutes ?? DAY_START_MIN;
                const end = b.endMinutes ?? start + 60;
                const height = Math.max(6, (end - start) * PPM);
                return (
                  <div
                    key={b.id}
                    aria-label="Busy"
                    className="pointer-events-none absolute inset-x-0 overflow-hidden"
                    style={{
                      top: (start - DAY_START_MIN) * PPM,
                      height,
                      background: "var(--source-busy-tint)",
                      borderTop: "1px solid var(--source-busy)",
                      borderBottom: "1px solid var(--source-busy)",
                    }}
                  >
                    {/* An unlabelled grey band reads as a rendering fault. Only
                        shown once the band is tall enough to hold the word
                        without clipping into the borders. */}
                    {height >= 20 ? (
                      <span
                        className="px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--source-busy)" }}
                      >
                        Busy
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {packDayColumns(col.timed).map((p) => {
                const top = (p.start - DAY_START_MIN) * PPM;
                const height = Math.max(28, (p.end - p.start) * PPM);
                // Split the column into lanes so overlapping items sit side by
                // side. Each lane is (100/cols)% wide with a small gutter.
                const widthPct = 100 / p.cols;
                return (
                  <Block
                    key={p.item.id}
                    item={p.item}
                    style={{
                      position: "absolute",
                      top,
                      height,
                      left: `calc(${p.col * widthPct}% + 3px)`,
                      width: `calc(${widthPct}% - 5px)`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Block({
  item,
  style,
  inline,
}: {
  item: CalendarItem;
  style?: CSSProperties;
  inline?: boolean;
}) {
  const meta = CALENDAR_SOURCE_META[item.source];
  return (
    <div
      className="overflow-hidden rounded-[7px] border-l-[3px] px-2 py-1 text-[11px] leading-tight"
      style={{
        ...style,
        background: `var(${meta.tintVar})`,
        borderColor: `var(${meta.varName})`,
        color: `var(${meta.varName})`,
      }}
      title={`${item.timeLabel} ${item.title}`.trim()}
    >
      <div className="truncate font-display text-[11px] font-semibold">
        {item.title}
      </div>
      {!inline && item.subtitle && (
        <div className="truncate opacity-80">{item.subtitle}</div>
      )}
    </div>
  );
}
