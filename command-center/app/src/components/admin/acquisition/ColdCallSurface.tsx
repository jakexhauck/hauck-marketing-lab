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
  isColdCallNumericField,
  monthParam,
  summarizeColdCallMonth,
  toTrackerRows,
  typedCellNote,
  typedCells,
  type ColdCallField,
} from "../../../lib/coldCall";
import { useColdCallsQuery, useSaveColdCallDay } from "../../../hooks/useColdCall";

// The Acquisition pillar's "Cold Call" tab body: a month of dialing days, one
// row each. All the layout lives in the shared DailyTracker and all the math in
// lib/coldCall; this component only owns the month cursor, the in-flight draft
// cells and the save debounce.
//
// Since 0052 the four counts fill themselves from the attempts logged on the
// call card. Typing is still allowed, for dialing done off-app, and a typed cell
// is marked as typed: the tracker shows a measurement and a claim side by side
// and never lets them look alike.

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

  // Which cells came from a keyboard rather than from a button press, and what
  // the app had recorded underneath each one.
  const typed = useMemo(() => typedCells(data?.days ?? []), [data]);

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
        saveDay.mutate(
          { day: iso, field: field as ColdCallField, value, callerId },
          {
            // Once the server has it, the draft has done its job and must go.
            // A cleared cell is the case that matters: the draft holds "", and
            // an "" that outlives the save would keep hiding the number the app
            // recorded for that day, which is exactly what clearing a typed
            // cell is meant to bring back.
            onSuccess: () =>
              setDrafts((prev) => {
                const row = prev[iso];
                if (!row || row[field] !== value) return prev;
                const { [field]: _saved, ...rest } = row;
                const next = { ...prev };
                if (Object.keys(rest).length === 0) delete next[iso];
                else next[iso] = rest;
                return next;
              }),
          },
        );
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

  // undefined = nothing typed in this cell; otherwise the recorded number the
  // typing overrode (null when the app recorded nothing that day). Read from the
  // server's rows, not the drafts, so the mark cannot flicker mid-keystroke.
  const overriddenValue = (iso: string, field: string): number | null | undefined =>
    isColdCallNumericField(field) ? typed[iso]?.[field] : undefined;

  const cellTitle = (iso: string, field: string) => {
    const recorded = overriddenValue(iso, field);
    if (recorded === undefined) return undefined;
    const label = COLD_CALL_COLUMNS.find((c) => c.key === field)?.label ?? field;
    return typedCellNote(label, recorded);
  };

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
      cellClass={(iso, field) =>
        overriddenValue(iso, field) !== undefined ? "typed" : undefined
      }
      cellTitle={cellTitle}
      legendExtra={
        <b title="Counts fill themselves from the outcome buttons on the call card.">
          <span className="adt-dot rec" /> Recorded by the app
        </b>
      }
    />
  );
}
