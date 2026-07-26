import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Phone, TrendingUp } from "lucide-react";
import DailyTracker, {
  type StatTile,
  type TrackerRow,
} from "../tracker/DailyTracker";
import {
  buildMonthDays,
  cursorForToday,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";
import {
  COLD_CALL_COLUMNS,
  coldCallFooter,
  computeColdCallRow,
  emptyColdCallRow,
  monthParam,
  summarizeColdCallMonth,
  toTrackerRows,
  type ColdCallField,
} from "../../../lib/coldCall";
import { useColdCallsQuery, useSaveColdCallDay } from "../../../hooks/useColdCall";

// The Acquisition pillar's "Cold Call" tab body: a month of dialing days, one
// row each, typed by hand. All the layout lives in the shared DailyTracker and
// all the math in lib/coldCall; this component only owns the month cursor, the
// in-flight draft cells and the save debounce.

// Typing fires one save per cell, not per keystroke.
const SAVE_DELAY_MS = 400;

const EDITABLE_FIELDS = new Set<string>(
  COLD_CALL_COLUMNS.filter((c) => c.kind !== "computed").map((c) => c.key),
);

interface Props {
  // The page may own the month cursor so it can render the stepper in its own
  // header row (Cold Call does, beside the Dialing script button). Left out, the
  // tracker keeps its own state and draws the stepper itself, which is how every
  // other tracker still uses it.
  cursor?: MonthCursor;
  onCursorChange?: (cursor: MonthCursor) => void;
  // Whose tracker to show. Owner-only lens; left out, the server serves the
  // signed-in person's own month.
  callerId?: string;
}

export default function ColdCallSurface({
  cursor: cursorProp,
  onCursorChange,
  callerId,
}: Props = {}) {
  // The real today, read once, then injected everywhere (trackerMonth is pure).
  const today = useMemo<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, []);

  const [ownCursor, setOwnCursor] = useState<MonthCursor>(() => cursorForToday(today));
  const lifted = cursorProp !== undefined && onCursorChange !== undefined;
  const cursor = lifted ? cursorProp : ownCursor;
  const setCursor = lifted ? onCursorChange : setOwnCursor;
  const month = monthParam(cursor);

  const { data } = useColdCallsQuery(month, callerId);
  const saveDay = useSaveColdCallDay();

  // What the server has, keyed by ISO day. Days with no row stay absent and
  // render as the blank template: an unlogged month shows blanks, not zeros.
  const saved = useMemo(() => toTrackerRows(data?.days ?? []), [data]);

  // Cells typed but not yet round-tripped. Keyed by ISO day so they survive a
  // month switch and never collide across months.
  const [drafts, setDrafts] = useState<Record<string, TrackerRow>>({});

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const getRow = (iso: string): TrackerRow => ({
    ...emptyColdCallRow(),
    ...saved[iso],
    ...drafts[iso],
  });

  // Every day of the viewed month, so the rollups and tiles cover the whole
  // month and not just the days that happen to have a row.
  const monthRows = useMemo(
    () => buildMonthDays(cursor, today).map((d) => getRow(d.iso)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, today, saved, drafts],
  );

  const rollup = useMemo(() => coldCallFooter(monthRows), [monthRows]);
  const summary = useMemo(() => summarizeColdCallMonth(monthRows), [monthRows]);

  function handleEdit(iso: string, field: string, value: string) {
    if (!EDITABLE_FIELDS.has(field)) return;

    setDrafts((prev) => ({ ...prev, [iso]: { ...(prev[iso] ?? {}), [field]: value } }));

    const key = `${iso}:${field}`;
    const running = timers.current.get(key);
    if (running) clearTimeout(running);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        saveDay.mutate({ day: iso, field: field as ColdCallField, value, callerId });
      }, SAVE_DELAY_MS),
    );
  }

  const statTiles: StatTile[] = [
    {
      key: "calls",
      tone: "indigo",
      icon: <Phone />,
      label: "Calls Made",
      value: summary.callsMade,
      sub: "month to date",
      chip: summary.filledDays
        ? { text: "min 100/day", ok: summary.callsOnPace }
        : undefined,
    },
    {
      key: "pickup",
      tone: "green",
      icon: <TrendingUp />,
      label: "Pickup %",
      value: summary.pickupPct,
      sub: summary.pickupSub,
      chip: summary.filledDays
        ? { text: "std >15%", ok: summary.pickupOnPace }
        : undefined,
    },
    {
      key: "booked",
      tone: "sky",
      icon: <CalendarDays />,
      label: "Meetings Booked",
      value: summary.meetingsBooked,
      sub: "month to date",
    },
    {
      key: "booking",
      tone: "amber",
      icon: <Clock />,
      label: "Booking %",
      value: summary.bookingPct,
      sub: "per dial",
      chip: summary.filledDays
        ? { text: "target 1-3%", ok: summary.bookingOnPace }
        : undefined,
    },
  ];

  return (
    <DailyTracker
      title="Cold Call Tracker"
      subtitle={summary.subtitle}
      columns={COLD_CALL_COLUMNS}
      cursor={cursor}
      today={today}
      statTiles={statTiles}
      getRow={getRow}
      computeRow={computeColdCallRow}
      rollup={rollup}
      onEdit={handleEdit}
      onMonthChange={setCursor}
      hideMonthNav={lifted}
    />
  );
}
