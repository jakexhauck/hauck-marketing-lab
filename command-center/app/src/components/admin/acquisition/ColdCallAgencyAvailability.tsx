import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import {
  addWeeks,
  buildWeek,
  coverageIn,
  dayHours,
  describeDay,
  formatHours,
  gridSlots,
  isHourStart,
  rosterHours,
  slotLabel,
  toISO,
  uncoveredHours,
  unionWeek,
  weekHours,
  weekLabel,
  weekStart,
  type RosterWeek,
  type WeekDay,
} from "../../../lib/availabilityWeek";
import { useTeamAvailabilityQuery } from "../../../hooks/useColdCallAvailability";
import { AvailabilityStyle } from "./ColdCallAvailability";

// Cold Call > Availability with the picker on Agency: everybody's week in the
// same grid one person paints, colour-coded by who.
//
// The same shape on purpose. Switching from a name to Agency should change WHOSE
// week is on screen and nothing else, so this reuses the painter's stylesheet
// rather than restating it: same row height, same day headers, same hour rules,
// same written summary underneath. Only the cells differ, because a cell here
// answers "who is on" rather than "am I on".
//
// Read-only, like Management > Team availability. Painting into a merged cell
// would have to pick a person to write to, and quietly choosing one is how a
// rota stops matching who is actually at a desk. Pick a name to edit.
//
// Not a duplicate of Management > Team availability either: that page is a
// density map plus a per-person hours table, built to answer "how much is each
// person giving me". This one answers "who is on the phones right now", in the
// shape the callers already read.

// The console's eight-token palette (the same hexes the task categories use), in
// a fixed order. A caller takes the token at their index in the roster, which
// guarantees two people on screen never share a colour. It also means a new hire
// can shift the colours below them: distinctness this week matters more than a
// colour somebody keeps forever, since the legend is always on screen.
const CALLER_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // green
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#64748b", // slate
];

function colorFor(index: number): string {
  return CALLER_COLORS[index % CALLER_COLORS.length];
}

export default function ColdCallAgencyAvailability() {
  const todayISO = useMemo(() => toISO(new Date()), []);
  const [monday, setMonday] = useState(() => weekStart(todayISO));

  const days = useMemo(() => buildWeek(monday, todayISO), [monday, todayISO]);
  const slots = useMemo(() => gridSlots(), []);
  const query = useTeamAvailabilityQuery(monday, days[6].iso);

  const roster: RosterWeek[] = query.data ?? [];

  // id -> colour, resolved once. The cells and the legend read the same map, so
  // a stripe and its name in the key can never disagree.
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    roster.forEach((m, i) => map.set(m.id, colorFor(i)));
    return map;
  }, [roster]);

  // The roster as one week, so the day totals and the written summary read
  // "covered" rather than any one person's hours.
  const covered = useMemo(() => unionWeek(roster), [roster]);
  const coveredHours = weekHours(covered, days);
  const personHours = rosterHours(roster, days);
  const uncovered = uncoveredHours(roster, days, slots);

  if (query.isLoading) {
    return <div className="pk-empty">Loading the agency&apos;s week...</div>;
  }
  if (query.isError) {
    return (
      <div className="pk-empty">
        Could not load the agency&apos;s availability. Reload to try again.
      </div>
    );
  }
  if (roster.length === 0) {
    return (
      <div className="pk-empty">
        Nobody is set up to cold call yet. Add a cold caller on the Team page and
        their week appears here.
      </div>
    );
  }

  return (
    <div className="cca">
      <AvailabilityStyle />
      <AgencyStyle />

      <div className="cca-bar">
        <div className="cca-nav">
          <button
            type="button"
            className="cca-navbtn"
            aria-label="Previous week"
            onClick={() => setMonday((m) => addWeeks(m, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="cca-weeklabel">{weekLabel(days)}</span>
          <button
            type="button"
            className="cca-navbtn"
            aria-label="Next week"
            onClick={() => setMonday((m) => addWeeks(m, 1))}
          >
            <ChevronRight size={18} />
          </button>
          {monday !== weekStart(todayISO) && (
            <button
              type="button"
              className="cca-today"
              onClick={() => setMonday(weekStart(todayISO))}
            >
              This week
            </button>
          )}
        </div>

        <div className="cca-total">
          <CalendarClock size={15} aria-hidden />
          {/* Two different numbers, said as two different things. Covered hours
              is how much of the week has anybody on it; person-hours is how much
              phone time the agency is actually buying. Reporting only the second
              would let four people stacked on one morning look like a full week. */}
          <span>
            <strong>{formatHours(coveredHours)}</strong> covered{" "}
            {coveredHours === 1 ? "hour" : "hours"}
            <span className="cca-ag-sep">/</span>
            <strong>{formatHours(personHours)}</strong> person-
            {personHours === 1 ? "hour" : "hours"}
          </span>
          {coveredHours === 0 ? (
            <span className="cca-ag-warn">
              <TriangleAlert size={15} aria-hidden />
              Nobody has marked this week
            </span>
          ) : (
            <span className="cca-ag-gap">
              {formatHours(uncovered)} uncovered between 8am and 8pm
            </span>
          )}
        </div>
      </div>

      <div className="cca-scroll">
        {/* Not a paint surface: no pointer handlers, and the cells are plain
            elements rather than buttons, so nothing here looks clickable. */}
        <div className="cca-grid cca-ag">
          <div className="cca-corner" />
          {days.map((d) => (
            <div
              key={d.iso}
              className={`cca-head${d.isToday ? " today" : ""}${d.isWeekend ? " weekend" : ""}`}
            >
              <span className="cca-dow">{d.dowLabel}</span>
              <span className="cca-daynum">{d.dayNum}</span>
              <span className="cca-dayhrs">{formatHours(dayHours(covered, d.iso))}h</span>
            </div>
          ))}

          {slots.map((slot) => (
            <AgencyRow
              key={slot}
              slot={slot}
              days={days}
              roster={roster}
              colors={colors}
            />
          ))}
        </div>
      </div>

      {/* Who is who. Always on screen, because the grid is unreadable without it
          and a colour key hidden behind a hover is a key nobody has. */}
      <ul className="cca-ag-legend">
        {roster.map((m) => {
          const hours = weekHours(m.days, days);
          return (
            <li key={m.id}>
              <span
                className="cca-ag-swatch"
                style={{ background: colors.get(m.id) }}
                aria-hidden
              />
              <span className="cca-ag-name">{m.name}</span>
              <span className="cca-ag-hrs">
                {hours ? `${formatHours(hours)}h` : "nothing marked"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="cca-ag-note">
        A cell split into stripes is more than one person on at once. Hover a cell
        to read the names. Times are the agency&apos;s local clock. To change
        somebody&apos;s hours, pick their name above.
      </p>

      <ul className="cca-summary">
        {days.map((d) => {
          const text = describeDay(covered, d.iso);
          return (
            <li key={d.iso} className={d.isToday ? "today" : undefined}>
              <span className="cca-sday">
                {d.dowLabel} {d.dayNum}
              </span>
              <span className="cca-stext">{text || "Nobody on the phones"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// One half-hour row across all seven days. Split out for the same reason the
// painter's is: a week is 168 cells, and rendering them a row at a time keeps
// the week nav responsive.
function AgencyRow({
  slot,
  days,
  roster,
  colors,
}: {
  slot: number;
  days: WeekDay[];
  roster: RosterWeek[];
  colors: Map<string, string>;
}) {
  const hourStart = isHourStart(slot);
  return (
    <>
      <div className={`cca-time${hourStart ? " hour" : ""}`}>
        {hourStart ? slotLabel(slot) : ""}
      </div>
      {days.map((d) => {
        const on = coverageIn(roster, d.iso, slot);
        return (
          <div
            key={d.iso}
            className={[
              "cca-cell",
              "cca-agcell",
              hourStart ? "hour" : "",
              d.isWeekend ? "weekend" : "",
              d.isPast ? "past" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={
              on.length
                ? `${d.dowLabel} ${d.dayNum}, ${slotLabel(slot)}: ${on.map((m) => m.name).join(", ")}`
                : `${d.dowLabel} ${d.dayNum}, ${slotLabel(slot)}: nobody`
            }
          >
            {/* One stripe per person on at this moment, in roster order, so a
                colour sits in the same position down a column and a block of
                somebody's morning reads as one continuous band. */}
            {on.map((m) => (
              <span
                key={m.id}
                className="cca-ag-stripe"
                style={{ background: colors.get(m.id) }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// Only what differs from the painted grid. Everything else (row height, headers,
// hour rules, weekend tint, the summary list) comes from AvailabilityStyle.
function AgencyStyle() {
  return (
    <style>{`
      /* Nothing here is painted, so the grid drops the paint affordances: no
         pointer cursor, no hover tint, no touch-action lock. */
      .cca-grid.cca-ag { touch-action: auto; user-select: text; }
      .cca-agcell { display: flex; cursor: default; }
      .cca-agcell:hover { background: transparent; }
      .cca-agcell.weekend:hover { background: color-mix(in srgb, var(--surface-2) 55%, transparent); }
      /* Equal stripes: one person fills the cell, three split it in three. */
      .cca-ag-stripe { flex: 1 1 0; min-width: 0; }

      .cca-ag-sep { margin: 0 7px; color: var(--text-faint); }
      .cca-ag-gap { font-size: 12.5px; color: var(--text-faint); }
      .cca-ag-warn { display: inline-flex; align-items: center; gap: 6px; color: var(--danger); font-weight: 600; }

      .cca-ag-legend {
        list-style: none; margin: 11px 0 0; padding: 0;
        display: flex; flex-wrap: wrap; gap: 7px 16px;
      }
      .cca-ag-legend li { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; }
      .cca-ag-swatch { width: 13px; height: 13px; border-radius: 3px; flex-shrink: 0; }
      .cca-ag-name { color: var(--text); font-weight: 600; }
      .cca-ag-hrs { color: var(--text-faint); font-family: var(--font-mono); font-size: 11.5px; }

      .cca-ag-note { margin: 9px 0 0; font-size: 12.5px; color: var(--text-muted); }
    `}</style>
  );
}
