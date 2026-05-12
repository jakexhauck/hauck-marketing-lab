import { activeDaysInMonth, type GCalEvent } from "../../lib/googleCalendar";
import type { CalendarConnection } from "../../lib/types";

interface Cell {
  day: number;
  dim: boolean;
  today?: boolean;
  hasEvent?: boolean;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildMonthGrid(
  year: number,
  month: number,
  todayDay: number,
  activeDays: Set<number>,
): Cell[] {
  const cells: Cell[] = [];
  const firstOfMonth = new Date(year, month, 1);
  const jsDay = firstOfMonth.getDay();
  const leading = (jsDay + 6) % 7;
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = leading; i > 0; i--) {
    cells.push({ day: prevMonthLast - i + 1, dim: true });
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      dim: false,
      today: d === todayDay,
      hasEvent: activeDays.has(d),
    });
  }
  const total = cells.length;
  const trailing = (7 - (total % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    cells.push({ day: i, dim: true });
  }
  return cells;
}

function nowHHMM(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

interface Props {
  connection?: CalendarConnection | null;
  events?: GCalEvent[];
  onConnect: () => void;
  onDisconnect: () => void;
}

export function CalendarWidget({ connection, events = [], onConnect, onDisconnect }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDay = now.getDate();
  const activeDays = activeDaysInMonth(events, year, month);
  const cells = buildMonthGrid(year, month, todayDay, activeDays);
  const monthLabel = `${MONTHS[month]} ${year}`;
  const monthShort = MONTHS[month].slice(0, 3).toUpperCase();
  const isConnected = !!connection;

  return (
    <div className="md-panel">
      <div className="md-panel-head">
        <span className="md-panel-title">▸ Calendar</span>
        <span className="md-panel-meta">{monthShort}</span>
      </div>
      <div className="md-cal">
        <div className="md-cal-head">
          <span className="md-cal-month">{monthLabel}</span>
          <span className="md-cal-nav">
            <span>‹</span>
            <span>›</span>
          </span>
        </div>
        <div className="md-cal-grid">
          {DAY_LABELS.map((l, i) => (
            <div key={`lbl-${i}`} className="md-cal-day-label">
              {l}
            </div>
          ))}
          {cells.map((c, i) => {
            const cls = [
              "md-cal-cell",
              c.dim ? "md-dim" : "",
              c.today ? "md-today" : "",
              c.hasEvent ? "md-has-event" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={`c-${i}`} className={cls}>
                {c.day}
              </div>
            );
          })}
        </div>
      </div>
      <div className="md-gcal">
        {!isConnected ? (
          <>
            <button type="button" className="md-gcal-btn" onClick={onConnect}>
              Connect Google Calendar
            </button>
            <div className="md-gcal-hint">
              Connect a public calendar via API key to see today's events.
            </div>
          </>
        ) : (
          <>
            <div className="md-gcal-row">
              <span className="md-gcal-email" title={connection?.calendarId}>
                {connection?.label ?? "Google Calendar"}
              </span>
              <button type="button" className="md-gcal-link" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
            <div className="md-gcal-hint">Synced · {nowHHMM()}</div>
          </>
        )}
      </div>
    </div>
  );
}
