import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import {
  eventsOn,
  fetchCalendarEvents,
  type GCalEvent,
} from "../../lib/googleCalendar";
import type {
  CalendarConnection,
  ClientEntry,
  OpsClientRow,
} from "../../lib/types";
import { CreateEventModal } from "./CreateEventModal";

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
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface CalendarPageProps {
  root: string | null;
  onBack: () => void;
  /** Real clients — populates the per-event "Assign to client" picker. */
  clients?: ClientEntry[];
}

function eventYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Cell {
  day: number;
  date: Date;
  dim: boolean;
  today: boolean;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(year: number, month: number): Cell[] {
  const cells: Cell[] = [];
  const today = startOfDay(new Date());
  const firstOfMonth = new Date(year, month, 1);
  const jsDay = firstOfMonth.getDay();
  const leading = (jsDay + 6) % 7;
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = leading; i > 0; i--) {
    const day = prevMonthLast - i + 1;
    const date = new Date(year, month - 1, day);
    cells.push({ day, date, dim: true, today: sameDay(date, today) });
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ day: d, date, dim: false, today: sameDay(date, today) });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    const date = new Date(year, month + 1, i);
    cells.push({ day: i, date, dim: true, today: sameDay(date, today) });
  }
  return cells;
}

function formatTime(d: Date): string {
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatFullDate(d: Date): string {
  const weekday = WEEKDAYS[d.getDay()];
  const month = MONTHS[d.getMonth()];
  return `${weekday} · ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

const MAX_CHIPS_PER_CELL = 3;
const MAX_DETAIL_ROWS = 20;

export function CalendarPage({ root, onBack, clients = [] }: CalendarPageProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selected, setSelected] = useState<Date>(today);

  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [opsRows, setOpsRows] = useState<Record<string, OpsClientRow>>({});
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** event-id → client-slug, derived from opsRows for fast detail lookup. */
  const eventClientMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [slug, row] of Object.entries(opsRows)) {
      if (row.nextCallEventId) m.set(row.nextCallEventId, slug);
    }
    return m;
  }, [opsRows]);

  const refreshOpsRows = useCallback(async () => {
    if (!root) {
      setOpsRows({});
      return;
    }
    try {
      const file = await api.readOpsClients(root);
      if (!mountedRef.current) return;
      setOpsRows(file.rows ?? {});
    } catch {
      if (mountedRef.current) setOpsRows({});
    }
  }, [root]);

  useEffect(() => {
    void refreshOpsRows();
  }, [refreshOpsRows]);

  /** Assign (or unassign) a calendar event to a client by writing
   *  `nextCall` + `nextCallEventId` on the corresponding ops row. Clearing
   *  prior owners keeps the event-id → slug map 1:1. */
  const assignEventToClient = useCallback(
    async (event: GCalEvent, clientSlug: string | null) => {
      if (!root) return;
      try {
        const file = await api.readOpsClients(root);
        const rows = { ...file.rows };

        // Remove this event-id from any other client that previously owned it.
        for (const [slug, row] of Object.entries(rows)) {
          if (slug === clientSlug) continue;
          if (row.nextCallEventId === event.id) {
            rows[slug] = {
              ...row,
              nextCall: null,
              nextCallEventId: null,
            };
          }
        }

        if (clientSlug) {
          const prev = rows[clientSlug] ?? {};
          rows[clientSlug] = {
            ...prev,
            nextCall: eventYMD(event.start),
            nextCallEventId: event.id,
          };
        }

        await api.writeOpsClients(root, { rows });
        if (mountedRef.current) setOpsRows(rows);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("assign event to client failed", err);
      }
    },
    [root],
  );

  const loadAll = useCallback(async () => {
    if (!root) {
      setConnection(null);
      setEvents([]);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const state = await api.readDashboardState(root);
      if (!mountedRef.current) return;
      const conn = state.calendar ?? null;
      setConnection(conn);
      if (!conn) {
        setEvents([]);
        setFetchError(null);
        return;
      }
      try {
        const evts = await fetchCalendarEvents(conn, 365);
        if (!mountedRef.current) return;
        setEvents(evts);
        setFetchError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        setEvents([]);
        setFetchError(err instanceof Error ? err.message : String(err));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [root]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshOauthStatus = useCallback(async () => {
    try {
      const ok = await api.googleCalendarIsConnected();
      if (mountedRef.current) setOauthConnected(ok);
    } catch {
      if (mountedRef.current) setOauthConnected(false);
    }
  }, []);

  useEffect(() => {
    void refreshOauthStatus();
  }, [refreshOauthStatus]);

  const handleConnectOAuth = useCallback(async () => {
    if (oauthBusy) return;
    setOauthBusy(true);
    setFetchError(null);
    try {
      await api.googleCalendarConnect();
      await refreshOauthStatus();
    } catch (err) {
      setFetchError(
        `Google sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (mountedRef.current) setOauthBusy(false);
    }
  }, [oauthBusy, refreshOauthStatus]);

  const handleDisconnectOAuth = useCallback(async () => {
    if (oauthBusy) return;
    setOauthBusy(true);
    try {
      await api.googleCalendarDisconnect();
      await refreshOauthStatus();
    } finally {
      if (mountedRef.current) setOauthBusy(false);
    }
  }, [oauthBusy, refreshOauthStatus]);

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, GCalEvent[]>();
    for (const cell of cells) {
      const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
      const dayEvents = eventsOn(events, cell.date);
      // Sort: all-day first, then by start time
      dayEvents.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return a.start.getTime() - b.start.getTime();
      });
      map.set(key, dayEvents);
    }
    return map;
  }, [cells, events]);

  const selectedEvents = useMemo(() => {
    const list = eventsOn(events, selected);
    list.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.start.getTime() - b.start.getTime();
    });
    return list;
  }, [events, selected]);

  const monthLabel = `${MONTHS[cursor.month]} ${cursor.year}`;

  const goPrev = () => {
    setCursor((c) => {
      const m = c.month - 1;
      if (m < 0) return { year: c.year - 1, month: 11 };
      return { year: c.year, month: m };
    });
  };
  const goNext = () => {
    setCursor((c) => {
      const m = c.month + 1;
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
  };
  const goToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(startOfDay(now));
  };

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace
          </div>
          <h1 className="hml-page-title">Calendar</h1>
          <div className="hml-page-subtitle">
            {connection?.label ?? "Google Calendar"} — read-only view of your schedule.
          </div>
        </div>
        <div className="hml-page-header-actions">
          {!connection && (
            <button type="button" className="hml-btn" onClick={onBack}>
              Connect calendar →
            </button>
          )}
          {oauthConnected ? (
            <>
              <button
                type="button"
                className="hml-btn"
                onClick={() => setCreateOpen(true)}
              >
                + New block
              </button>
              <button
                type="button"
                className="hml-btn"
                onClick={handleDisconnectOAuth}
                disabled={oauthBusy}
                title="Sign out of Google Calendar write access"
                style={{ opacity: 0.7 }}
              >
                {oauthBusy ? "…" : "Sign out"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="hml-btn"
              onClick={handleConnectOAuth}
              disabled={oauthBusy}
              title="Authorize Hauck Marketing Lab to create events on your calendar"
            >
              {oauthBusy ? "Opening browser…" : "Sign in with Google"}
            </button>
          )}
        </div>
      </section>

      <div className="md-cal-page">

      {fetchError ? (
        <div className="md-cal-page-error">
          Calendar fetch failed — {fetchError}
        </div>
      ) : null}

      {!loaded ? (
        <div className="md-cal-page-empty">Loading calendar…</div>
      ) : !connection ? (
        <div className="md-cal-page-empty">
          <div className="md-cal-page-empty-card">
            <div className="md-cal-page-empty-eyebrow">▸ Not Connected</div>
            <div className="md-cal-page-empty-title">No calendar connected</div>
            <div className="md-cal-page-empty-help">
              Head back to the dashboard to connect a Google Calendar.
            </div>
          </div>
        </div>
      ) : (
        <div className="md-cal-page-body">
          <section className="md-cal-page-grid-wrap">
            <header className="md-cal-page-toolbar">
              <div className="md-cal-page-nav">
                <button
                  type="button"
                  className="md-cal-page-nav-btn"
                  onClick={goPrev}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="md-cal-page-month">{monthLabel}</span>
                <button
                  type="button"
                  className="md-cal-page-nav-btn"
                  onClick={goNext}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
              <div className="md-cal-page-tools">
                <button
                  type="button"
                  className="md-cal-page-tool-btn"
                  onClick={goToday}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="md-cal-page-tool-btn"
                  onClick={() => void loadAll()}
                  disabled={loading}
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </header>

            <div className="md-cal-page-grid">
              {DAY_LABELS.map((l, i) => (
                <div key={`lbl-${i}`} className="md-cal-page-day-label">
                  {l}
                </div>
              ))}
              {cells.map((cell, i) => {
                const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
                const dayEvents = eventsByDay.get(key) ?? [];
                const isSelected = sameDay(cell.date, selected);
                const cls = [
                  "md-cal-page-cell",
                  cell.dim ? "md-dim" : "",
                  cell.today ? "md-today" : "",
                  isSelected ? "md-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const visible = dayEvents.slice(0, MAX_CHIPS_PER_CELL);
                const overflow = dayEvents.length - visible.length;
                return (
                  <button
                    type="button"
                    key={`c-${i}`}
                    className={cls}
                    onClick={() => setSelected(cell.date)}
                  >
                    <span className="md-cal-page-cell-num">{cell.day}</span>
                    <div className="md-cal-page-cell-events">
                      {visible.map((e) => (
                        <div
                          key={e.id}
                          className={
                            "md-cal-page-chip" +
                            (e.allDay
                              ? " md-cal-page-chip-allday"
                              : " md-cal-page-chip-timed")
                          }
                          title={e.title}
                        >
                          {e.allDay ? (
                            <span className="md-cal-page-chip-text">
                              {e.title}
                            </span>
                          ) : (
                            <>
                              <span className="md-cal-page-chip-time">
                                {formatTime(e.start)}
                              </span>
                              <span className="md-cal-page-chip-text">
                                {e.title}
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                      {overflow > 0 ? (
                        <div className="md-cal-page-chip md-cal-page-chip-more">
                          +{overflow} more
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="md-cal-page-detail">
            <header className="md-cal-page-detail-head">
              <span className="md-cal-page-detail-eyebrow">▸ Selected</span>
              <div className="md-cal-page-detail-date">
                {formatFullDate(selected)}
              </div>
            </header>
            <div className="md-cal-page-detail-body">
              {selectedEvents.length === 0 ? (
                <div className="md-cal-page-detail-empty">No events.</div>
              ) : (
                <>
                  {selectedEvents.slice(0, MAX_DETAIL_ROWS).map((e) => {
                    const assignedSlug = eventClientMap.get(e.id) ?? "";
                    return (
                      <div key={e.id} className="md-cal-page-detail-row">
                        <div className="md-cal-page-detail-time">
                          {e.allDay
                            ? "All day"
                            : `${formatTime(e.start)} – ${formatTime(e.end)}`}
                        </div>
                        <div className="md-cal-page-detail-title">
                          {e.title}
                          {assignedSlug && (
                            <span
                              className="md-cal-page-detail-tag"
                              title="Assigned as next call"
                            >
                              →{" "}
                              {clients.find((c) => c.slug === assignedSlug)
                                ?.name ?? assignedSlug}
                            </span>
                          )}
                        </div>
                        {e.location ? (
                          <div className="md-cal-page-detail-loc">
                            {e.location}
                          </div>
                        ) : null}
                        {clients.length > 0 && (
                          <div className="md-cal-page-detail-assign">
                            <label className="md-cal-page-detail-assign-label">
                              Next call for
                            </label>
                            <select
                              className="md-cal-page-detail-assign-select"
                              value={assignedSlug}
                              onChange={(ev) =>
                                void assignEventToClient(
                                  e,
                                  ev.target.value || null,
                                )
                              }
                            >
                              <option value="">— Unassigned —</option>
                              {clients.map((c) => (
                                <option key={c.slug} value={c.slug}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedEvents.length > MAX_DETAIL_ROWS ? (
                    <div className="md-cal-page-detail-more">
                      +{selectedEvents.length - MAX_DETAIL_ROWS} more
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      </div>

      <CreateEventModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultDate={selected}
        onCreated={() => {
          void loadAll();
        }}
      />
    </div>
  );
}
