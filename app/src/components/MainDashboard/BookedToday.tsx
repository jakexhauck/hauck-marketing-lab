import type { GCalEvent } from "../../lib/googleCalendar";

interface Props {
  events?: GCalEvent[];
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function BookedToday({ events = [] }: Props) {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const cap = 8;
  const shown = sorted.slice(0, cap);
  const overflow = sorted.length - shown.length;

  return (
    <div className="md-panel">
      <div className="md-panel-head">
        <span className="md-panel-title">▸ Today · Events</span>
        <span className="md-panel-meta">
          {sorted.length > 0 ? `${sorted.length} ON DECK` : "NO DATA"}
        </span>
      </div>
      {sorted.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            color: "var(--text-faint)",
            fontFamily: "var(--mono)",
            fontSize: 12,
            letterSpacing: "0.08em",
          }}
        >
          No events today.
        </div>
      ) : (
        <ul className="md-event-list">
          {shown.map((e) => (
            <li key={e.id} className="md-event-row">
              <span className="md-event-time">
                {e.allDay ? "All day" : `${fmtTime(e.start)}–${fmtTime(e.end)}`}
              </span>
              <span className="md-event-body">
                <span className="md-event-title">{e.title}</span>
                {e.location ? (
                  <span className="md-event-loc">{e.location}</span>
                ) : null}
              </span>
            </li>
          ))}
          {overflow > 0 ? (
            <li className="md-event-row md-event-more">+{overflow} more</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
