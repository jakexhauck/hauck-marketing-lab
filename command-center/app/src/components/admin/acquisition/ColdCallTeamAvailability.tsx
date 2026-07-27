import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import {
  addWeeks,
  buildWeek,
  coveredBy,
  dayHours,
  describeDay,
  formatHours,
  gridSlots,
  isHourStart,
  peakCoverage,
  slotLabel,
  toISO,
  uncoveredHours,
  weekHours,
  weekLabel,
  weekStart,
} from "../../../lib/availabilityWeek";
import { useTeamAvailabilityQuery } from "../../../hooks/useColdCallAvailability";

// Management > Team availability: the whole roster's week, read only.
//
// Read only on purpose. Editing happens on the Availability page, where a
// person paints their own week; an owner who wants to change someone's hours
// picks that person there. A grid where the owner could overwrite a hire's
// stated availability from a screen the hire never sees is how a rota stops
// matching who is actually at a desk.
//
// Two questions, two shapes. The grid answers "is anyone on at 10 on Tuesday",
// shaded by how many. The table under it answers "how much is each person
// actually giving me", which is a number per person and reads worse as colour.

export default function ColdCallTeamAvailability() {
  const todayISO = useMemo(() => toISO(new Date()), []);
  const [monday, setMonday] = useState(() => weekStart(todayISO));

  const days = useMemo(() => buildWeek(monday, todayISO), [monday, todayISO]);
  const slots = useMemo(() => gridSlots(), []);
  const query = useTeamAvailabilityQuery(monday, days[6].iso);

  const roster = query.data ?? [];
  const peak = peakCoverage(roster, days, slots);
  const uncovered = uncoveredHours(roster, days, slots);

  if (query.isLoading) {
    return <div className="pk-empty">Loading the team&apos;s week...</div>;
  }
  if (query.isError) {
    return (
      <div className="pk-empty">
        Could not load the team&apos;s availability. Reload to try again.
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
    <div className="cct">
      <TeamStyle />

      <div className="cct-bar">
        <div className="cct-nav">
          <button
            type="button"
            className="cct-navbtn"
            aria-label="Previous week"
            onClick={() => setMonday((m) => addWeeks(m, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="cct-weeklabel">{weekLabel(days)}</span>
          <button
            type="button"
            className="cct-navbtn"
            aria-label="Next week"
            onClick={() => setMonday((m) => addWeeks(m, 1))}
          >
            <ChevronRight size={18} />
          </button>
          {monday !== weekStart(todayISO) && (
            <button
              type="button"
              className="cct-today"
              onClick={() => setMonday(weekStart(todayISO))}
            >
              This week
            </button>
          )}
        </div>

        <div className="cct-stat">
          {peak === 0 ? (
            <span className="cct-warn">
              <TriangleAlert size={15} aria-hidden />
              Nobody has marked this week
            </span>
          ) : (
            <span>
              <strong>{formatHours(uncovered)}</strong> uncovered{" "}
              {uncovered === 1 ? "hour" : "hours"} between 8am and 8pm
            </span>
          )}
        </div>
      </div>

      <div className="cct-scroll">
        <div className="cct-grid">
          <div className="cct-corner" />
          {days.map((d) => (
            <div
              key={d.iso}
              className={`cct-head${d.isToday ? " today" : ""}${d.isWeekend ? " weekend" : ""}`}
            >
              <span className="cct-dow">{d.dowLabel}</span>
              <span className="cct-daynum">{d.dayNum}</span>
            </div>
          ))}

          {slots.map((slot) => {
            const hourStart = isHourStart(slot);
            return (
              <div key={slot} className="contents">
                <div className={`cct-time${hourStart ? " hour" : ""}`}>
                  {hourStart ? slotLabel(slot) : ""}
                </div>
                {days.map((d) => {
                  const names = coveredBy(roster, d.iso, slot);
                  // Shading is relative to the busiest cell in the week, so a
                  // two-person agency reads as clearly as a ten-person one.
                  const strength = peak > 0 ? names.length / peak : 0;
                  return (
                    <div
                      key={d.iso}
                      className={[
                        "cct-cell",
                        hourStart ? "hour" : "",
                        d.isWeekend ? "weekend" : "",
                        names.length ? "on" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        names.length
                          ? { opacity: 0.28 + strength * 0.72 }
                          : undefined
                      }
                      title={
                        names.length
                          ? `${slotLabel(slot)}: ${names.join(", ")}`
                          : `${slotLabel(slot)}: nobody`
                      }
                    >
                      {names.length > 1 ? names.length : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="cct-legend">
        Darker means more people on at once. A number appears where more than one
        person overlaps. Times are the agency&apos;s local clock.
      </p>

      <div className="cct-tablewrap">
        <table className="cct-table">
          <thead>
            <tr>
              <th scope="col">Who</th>
              {days.map((d) => (
                <th key={d.iso} scope="col" className={d.isToday ? "today" : undefined}>
                  {d.dowLabel}
                </th>
              ))}
              <th scope="col">Week</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => {
              const total = weekHours(m.days, days);
              return (
                <tr key={m.id}>
                  <th scope="row">
                    <span className="cct-name">{m.name}</span>
                    {m.role === "owner" && <span className="cct-tag">Owner</span>}
                  </th>
                  {days.map((d) => {
                    const hours = dayHours(m.days, d.iso);
                    return (
                      <td
                        key={d.iso}
                        className={hours ? "has" : undefined}
                        title={describeDay(m.days, d.iso) || "Not available"}
                      >
                        {hours ? formatHours(hours) : "-"}
                      </td>
                    );
                  })}
                  <td className="cct-total">
                    {total ? `${formatHours(total)}h` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamStyle() {
  return (
    <style>{`
      .cct { --cct-rowh: 15px; }

      .cct-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .cct-nav { display: flex; align-items: center; gap: 6px; }
      .cct-navbtn { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-muted); cursor: pointer; padding: 0; }
      .cct-navbtn:hover { border-color: var(--brand); color: var(--brand-text); }
      .cct-weeklabel { font-family: var(--font-display); font-size: 14.5px; font-weight: 600; color: var(--text); min-width: 168px; text-align: center; }
      .cct-today { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; }
      .cct-today:hover { border-color: var(--brand); color: var(--brand-text); }
      .cct-stat { font-size: 13px; color: var(--text-muted); }
      .cct-stat strong { color: var(--text); font-family: var(--font-display); font-size: 15px; }
      .cct-warn { display: inline-flex; align-items: center; gap: 7px; color: var(--danger); font-weight: 600; }

      .cct-scroll { overflow-x: auto; }
      .cct-grid { min-width: 620px; display: grid; grid-template-columns: 62px repeat(7, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); }
      /* Each slot row is one element wrapping eight cells; display:contents lets
         those cells sit in the parent grid instead of nesting a second one. */
      .cct-grid .contents { display: contents; }

      .cct-corner { background: var(--surface-2); border-bottom: 1px solid var(--border); }
      .cct-head { background: var(--surface-2); border-bottom: 1px solid var(--border); border-left: 1px solid var(--divider); padding: 7px 4px 6px; text-align: center; }
      .cct-head.weekend { background: var(--surface); }
      .cct-dow { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
      .cct-daynum { display: block; font-family: var(--font-display); font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.3; }
      .cct-head.today .cct-dow, .cct-head.today .cct-daynum { color: var(--brand-text); }

      .cct-time { height: var(--cct-rowh); font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); text-align: right; padding-right: 7px; background: var(--surface-2); }
      .cct-time.hour { border-top: 1px solid var(--divider); line-height: var(--cct-rowh); }

      .cct-cell { height: var(--cct-rowh); border-left: 1px solid var(--divider); font-family: var(--font-mono); font-size: 9.5px; color: #fff; display: grid; place-items: center; }
      .cct-cell.hour { border-top: 1px solid var(--divider); }
      .cct-cell.weekend { background: color-mix(in srgb, var(--surface-2) 55%, transparent); }
      .cct-cell.on { background: var(--brand); }

      .cct-legend { margin: 11px 0 0; font-size: 12.5px; color: var(--text-muted); }

      .cct-tablewrap { margin-top: 18px; overflow-x: auto; }
      .cct-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 13px; }
      .cct-table th, .cct-table td { padding: 9px 10px; text-align: center; border-bottom: 1px solid var(--divider); }
      .cct-table thead th { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
      .cct-table thead th.today { color: var(--brand-text); }
      .cct-table tbody th { text-align: left; font-weight: 600; color: var(--text); white-space: nowrap; }
      .cct-table td { font-family: var(--font-mono); color: var(--text-faint); }
      .cct-table td.has { color: var(--text); }
      .cct-table td.cct-total { font-weight: 700; color: var(--brand-text); }
      .cct-name { margin-right: 8px; }
      .cct-tag { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); background: var(--surface-2); border-radius: 999px; padding: 2px 7px; }
    `}</style>
  );
}
