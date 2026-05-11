interface Cell {
  day: number;
  dim: boolean;
  today?: boolean;
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

function buildMonthGrid(year: number, month: number, todayDay: number): Cell[] {
  const cells: Cell[] = [];
  const firstOfMonth = new Date(year, month, 1);
  // JS getDay: 0 = Sunday … 6 = Saturday. We want Monday-start, so map to 0..6
  // with Mon = 0.
  const jsDay = firstOfMonth.getDay();
  const leading = (jsDay + 6) % 7;
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = leading; i > 0; i--) {
    cells.push({ day: prevMonthLast - i + 1, dim: true });
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dim: false, today: d === todayDay });
  }
  // Pad trailing cells so the grid fills 7-wide rows
  const total = cells.length;
  const trailing = (7 - (total % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    cells.push({ day: i, dim: true });
  }
  return cells;
}

export function CalendarWidget() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDay = now.getDate();
  const cells = buildMonthGrid(year, month, todayDay);
  const monthLabel = `${MONTHS[month]} ${year}`;
  const monthShort = MONTHS[month].slice(0, 3).toUpperCase();

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
      <div className="md-cal-summary">
        <strong>No data</strong> — calendar integration not wired up yet.
      </div>
    </div>
  );
}
