import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconGrip, IconPlus } from "../icons";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

const HABITS_KEY = "hml-habits-v1";
const LOG_KEY = "hml-habits-log-v1";
const HEATMAP_DAYS = 84; // 12 weeks

interface Habit {
  id: string;
  name: string;
  createdAt: string; // YYYY-MM-DD
}

type Log = Record<string, string[]>; // dateKey -> habitId[]

function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDay(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return todayKey(dt);
}

function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    return raw ? (JSON.parse(raw) as Habit[]) : [];
  } catch {
    return [];
  }
}

function loadLog(): Log {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as Log) : {};
  } catch {
    return {};
  }
}

function saveHabits(h: Habit[]) {
  try {
    localStorage.setItem(HABITS_KEY, JSON.stringify(h));
  } catch {
    // ignore quota
  }
}

function saveLog(l: Log) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(l));
  } catch {
    // ignore quota
  }
}

function currentStreak(log: Log, habitId: string, today: string): number {
  let streak = 0;
  let cursor = today;
  // If today not yet done, start counting from yesterday so streak isn't penalised
  // until the day ends. But if today done, count it.
  if (!log[cursor]?.includes(habitId)) {
    cursor = shiftDay(cursor, -1);
  }
  while (log[cursor]?.includes(habitId)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

function longestStreak(log: Log, habitId: string, today: string): number {
  let best = 0;
  let run = 0;
  // Walk back up to 365 days
  for (let i = 0; i < 365; i += 1) {
    const k = shiftDay(today, -i);
    if (log[k]?.includes(habitId)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function consistencyPct(log: Log, habitId: string, today: string, days = 30): number {
  let hits = 0;
  for (let i = 0; i < days; i += 1) {
    const k = shiftDay(today, -i);
    if (log[k]?.includes(habitId)) hits += 1;
  }
  return Math.round((hits / days) * 100);
}

interface HeatCell {
  date: string;
  done: number;
  total: number;
}

function buildHeatmap(log: Log, habits: Habit[], today: string): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i -= 1) {
    const date = shiftDay(today, -i);
    const completed = log[date] ?? [];
    const eligible = habits.filter((h) => h.createdAt <= date).length;
    cells.push({
      date,
      done: completed.length,
      total: Math.max(eligible, 0),
    });
  }
  return cells;
}

function heatLevel(cell: HeatCell): number {
  if (cell.total === 0) return 0;
  const ratio = cell.done / cell.total;
  if (ratio <= 0) return 0;
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>(() => loadHabits());
  const [log, setLog] = useState<Log>(() => loadLog());
  const [now, setNow] = useState<string>(() => todayKey());
  const [newName, setNewName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reorderHabit = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setHabits((prev) => {
      const fromIdx = prev.findIndex((h) => h.id === fromId);
      const toIdx = prev.findIndex((h) => h.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      saveHabits(next);
      return next;
    });
  }, []);

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);

  // Daily refresh — re-checks the clock every 60s so the page rolls over at
  // midnight without a reload, and refreshes today's view.
  useEffect(() => {
    const id = window.setInterval(() => {
      const k = todayKey();
      setNow((prev) => (prev === k ? prev : k));
    }, 60 * 1000);
    const onFocus = () => setNow(todayKey());
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const addHabit = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const habit: Habit = {
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: todayKey(),
    };
    setHabits((prev) => {
      const next = [...prev, habit];
      saveHabits(next);
      return next;
    });
    setNewName("");
    inputRef.current?.focus();
  }, [newName]);

  const removeHabit = useCallback((id: string) => {
    setHabits((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveHabits(next);
      return next;
    });
    setLog((prev) => {
      const next: Log = {};
      for (const [date, ids] of Object.entries(prev)) {
        const filtered = ids.filter((x) => x !== id);
        if (filtered.length > 0) next[date] = filtered;
      }
      saveLog(next);
      return next;
    });
    setPendingDeleteId(null);
  }, []);

  const renameHabit = useCallback((id: string, name: string) => {
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, name } : h));
      saveHabits(next);
      return next;
    });
  }, []);

  const toggleToday = useCallback(
    (habitId: string) => {
      setLog((prev) => {
        const dayList = prev[now] ?? [];
        const isDone = dayList.includes(habitId);
        const nextList = isDone
          ? dayList.filter((x) => x !== habitId)
          : [...dayList, habitId];
        const next: Log = { ...prev };
        if (nextList.length > 0) {
          next[now] = nextList;
        } else {
          delete next[now];
        }
        saveLog(next);
        return next;
      });
    },
    [now],
  );

  const todayList = log[now] ?? [];
  const todayPct = habits.length
    ? Math.round((todayList.filter((id) => habits.some((h) => h.id === id)).length / habits.length) * 100)
    : 0;
  const heatCells = useMemo(() => buildHeatmap(log, habits, now), [log, habits, now]);

  // Momentum stats (across all habits)
  const overall30Day = useMemo(() => {
    if (habits.length === 0) return 0;
    let total = 0;
    for (const h of habits) total += consistencyPct(log, h.id, now, 30);
    return Math.round(total / habits.length);
  }, [log, habits, now]);

  const overallStreak = useMemo(() => {
    // Longest current "perfect day" streak — days where every eligible habit was done.
    if (habits.length === 0) return 0;
    let streak = 0;
    let cursor = now;
    // If today isn't a perfect day yet, start counting from yesterday so we
    // don't reset the streak mid-day.
    const eligibleOn = (date: string) => habits.filter((h) => h.createdAt <= date).length;
    const perfect = (date: string) => {
      const elig = eligibleOn(date);
      if (elig === 0) return false;
      return (log[date]?.length ?? 0) >= elig;
    };
    if (!perfect(cursor)) cursor = shiftDay(cursor, -1);
    while (perfect(cursor)) {
      streak += 1;
      cursor = shiftDay(cursor, -1);
    }
    return streak;
  }, [log, habits, now]);

  // Pretty date label
  const nowDate = new Date(now);
  const prettyDate = nowDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Bucket heatmap into weeks (column-major, oldest on the left).
  const weeks = useMemo(() => {
    const cols: HeatCell[][] = [];
    for (let i = 0; i < heatCells.length; i += 7) {
      cols.push(heatCells.slice(i, i + 7));
    }
    return cols;
  }, [heatCells]);

  return (
    <div className="hml-content">
      <style>{habitsCSS}</style>

      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace
          </div>
          <h1 className="hml-page-title">Habits</h1>
          <div className="hml-page-subtitle">
            {prettyDate} · {todayList.length}/{habits.length} done today ·{" "}
            {habits.length === 0 ? "Add your first habit below." : `${todayPct}% complete`}
          </div>
        </div>
      </section>

      {/* Momentum row ─────────────────────────────────── */}
      <section className="hml-stat-row" style={{ marginBottom: 20 }}>
        <div className="hml-stat-card">
          <div className="hml-stat-label">Perfect-day streak</div>
          <div className="hml-stat-value">
            {overallStreak}
            <span className="hml-stat-delta hml-flat">
              {overallStreak === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">30-day consistency</div>
          <div className="hml-stat-value">
            {overall30Day}%
            <span className="hml-stat-delta hml-flat">across all habits</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">Tracking</div>
          <div className="hml-stat-value">
            {habits.length}
            <span className="hml-stat-delta hml-flat">
              habit{habits.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </section>

      {/* Today's checklist ─────────────────────────────── */}
      <section className="hml-panel hb-panel">
        <div className="hml-panel-header">
          <div className="hml-panel-title">
            <span className="hml-dot" />
            Today
          </div>
          <span className="hml-panel-action">{prettyDate}</span>
        </div>
        <div className="hml-panel-body hb-body">
          {habits.length === 0 ? (
            <div className="hml-empty">
              <div className="hml-empty-title">No habits yet</div>
              <div className="hml-empty-sub">
                Add a habit below — "Morning walk", "No phone before 9am", whatever you're
                building.
              </div>
            </div>
          ) : (
            <ul className="hb-list">
              {habits.map((h) => {
                const done = todayList.includes(h.id);
                const streak = currentStreak(log, h.id, now);
                const best = longestStreak(log, h.id, now);
                const pct = consistencyPct(log, h.id, now, 30);
                return (
                  <li
                    key={h.id}
                    className={`hb-row${done ? " hb-done" : ""}${
                      dragId === h.id ? " hb-row-dragging" : ""
                    }${
                      dragOverId === h.id && dragId && dragId !== h.id
                        ? " hb-row-drop-target"
                        : ""
                    }`}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      if (dragOverId !== h.id) setDragOverId(h.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId && dragId !== h.id) reorderHabit(dragId, h.id);
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === h.id) setDragOverId(null);
                    }}
                  >
                    <span
                      className="hb-grip"
                      draggable
                      title="Drag to reorder"
                      onDragStart={(e) => {
                        setDragId(h.id);
                        e.dataTransfer.effectAllowed = "move";
                        try {
                          e.dataTransfer.setData("text/plain", h.id);
                        } catch {
                          /* some browsers throw on read-only dataTransfer */
                        }
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                    >
                      <IconGrip size={12} />
                    </span>
                    <button
                      type="button"
                      className={`hb-check${done ? " hb-check-on" : ""}`}
                      onClick={() => toggleToday(h.id)}
                      title={done ? "Uncheck today" : "Mark done today"}
                    >
                      {done && <IconCheck size={12} />}
                    </button>
                    <input
                      type="text"
                      className="hb-name-input"
                      value={h.name}
                      onChange={(e) => renameHabit(h.id, e.target.value)}
                      onBlur={(e) => {
                        const trimmed = e.target.value.trim();
                        if (trimmed && trimmed !== h.name) renameHabit(h.id, trimmed);
                      }}
                      spellCheck={false}
                    />
                    <div className="hb-stats">
                      <span className="hb-stat" title="Current streak">
                        🔥 {streak}
                      </span>
                      <span className="hb-stat hb-stat-dim" title="Longest streak">
                        best {best}
                      </span>
                      <span className="hb-stat hb-stat-dim" title="30-day consistency">
                        {pct}%
                      </span>
                    </div>
                    <button
                      type="button"
                      className="hb-remove"
                      onClick={() => requestDelete(h.id)}
                      title="Remove habit"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="hb-add"
            onSubmit={(e) => {
              e.preventDefault();
              addHabit();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="hb-input"
              placeholder="Add a habit…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="hml-btn hb-add-btn" disabled={!newName.trim()}>
              <IconPlus size={12} />
              Add
            </button>
          </form>
        </div>
      </section>

      {/* Momentum heatmap ──────────────────────────────── */}
      <section className="hml-panel hb-panel">
        <div className="hml-panel-header">
          <div className="hml-panel-title">
            <span className="hml-dot" style={{ background: "var(--hml-blue, #6aa9ff)" }} />
            Momentum · last 12 weeks
          </div>
          <span className="hml-panel-action">
            {heatCells.filter((c) => c.done > 0).length} active days
          </span>
        </div>
        <div className="hml-panel-body">
          {habits.length === 0 ? (
            <div className="hml-empty">
              <div className="hml-empty-title">Heatmap waits for habits</div>
              <div className="hml-empty-sub">
                Once you add a habit and start checking days off, momentum fills the grid.
              </div>
            </div>
          ) : (
            <>
              <div className="hb-heatmap" role="img" aria-label="Habit completion heatmap">
                {weeks.map((week, wi) => (
                  <div className="hb-heat-col" key={wi}>
                    {week.map((cell) => (
                      <div
                        key={cell.date}
                        className={`hb-heat-cell hb-heat-l${heatLevel(cell)}`}
                        title={`${cell.date} — ${cell.done}/${cell.total || 0}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="hb-heat-legend">
                <span>Less</span>
                <div className="hb-heat-cell hb-heat-l0" />
                <div className="hb-heat-cell hb-heat-l1" />
                <div className="hb-heat-cell hb-heat-l2" />
                <div className="hb-heat-cell hb-heat-l3" />
                <div className="hb-heat-cell hb-heat-l4" />
                <span>More</span>
              </div>
            </>
          )}
        </div>
      </section>

      <ConfirmDeleteModal
        open={pendingDeleteId !== null}
        itemKind="habit"
        itemLabel={
          habits.find((h) => h.id === pendingDeleteId)?.name ?? ""
        }
        onConfirm={() => {
          if (pendingDeleteId) removeHabit(pendingDeleteId);
        }}
        onCancel={cancelDelete}
      />
    </div>
  );
}

const habitsCSS = `
.hb-panel { margin-bottom: 20px; }
.hb-body { padding-bottom: 14px; }

.hb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hb-row {
  display: grid;
  grid-template-columns: 18px 22px 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  transition: background 120ms ease, box-shadow 120ms ease;
}
.hb-row:hover { background: var(--hml-row-hover, rgba(255,255,255,0.025)); }
.hb-row:hover .hb-grip { color: var(--hml-text-mid, #9a9a9c); }
.hb-done .hb-name-input { color: var(--hml-text-faint, #888); text-decoration: line-through; opacity: 0.75; }

.hb-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 22px;
  color: transparent;
  cursor: grab;
  user-select: none;
  transition: color 120ms ease;
}
.hb-grip:hover { color: var(--hml-text, #e7e7e8) !important; }
.hb-grip:active { cursor: grabbing; }
.hb-row-dragging { opacity: 0.4; }
.hb-row-drop-target { box-shadow: inset 0 2px 0 0 var(--hml-accent, #6aa9ff); }

.hb-name-input {
  font-size: 13.5px;
  color: var(--hml-text, #e7e7e8);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 3px 6px;
  margin: 0 -6px;
  font-family: inherit;
  outline: none;
  width: 100%;
  min-width: 0;
  transition: border-color 120ms ease, background 120ms ease;
}
.hb-name-input:hover { border-color: var(--hml-border, rgba(255,255,255,0.10)); }
.hb-name-input:focus {
  border-color: var(--hml-accent, #6aa9ff);
  background: var(--hml-input-bg, rgba(255,255,255,0.03));
}

.hb-check {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.4px solid var(--hml-border, rgba(255,255,255,0.18));
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  color: #fff;
}
.hb-check:hover { border-color: var(--hml-accent, #6aa9ff); }
.hb-check:active { transform: scale(0.92); }
.hb-check-on {
  background: var(--hml-green, #3ec28a);
  border-color: var(--hml-green, #3ec28a);
}

.hb-name {
  font-size: 13.5px;
  color: var(--hml-text, #e7e7e8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hb-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--hml-text-mid, #9a9a9c);
  font-variant-numeric: tabular-nums;
}
.hb-stat-dim { color: var(--hml-text-faint, #6a6a6c); }

.hb-remove {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--hml-text-faint, #6a6a6c);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  font-family: inherit;
}
.hb-remove:hover { background: var(--hml-row-hover, rgba(255,255,255,0.05)); color: var(--hml-red, #d77b7b); }

.hb-add {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 0 12px;
}
.hb-input {
  flex: 1;
  background: var(--hml-input-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.12));
  border-radius: 7px;
  padding: 8px 11px;
  color: var(--hml-text, #e7e7e8);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 120ms ease;
}
.hb-input:focus { border-color: var(--hml-accent, #6aa9ff); }
.hb-add-btn { white-space: nowrap; }

.hb-heatmap {
  display: flex;
  gap: 3px;
  padding: 4px 0 14px;
  overflow-x: auto;
}
.hb-heat-col { display: flex; flex-direction: column; gap: 3px; }
.hb-heat-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--hml-heat-0, rgba(255,255,255,0.04));
}
.hb-heat-l0 { background: var(--hml-heat-0, rgba(255,255,255,0.05)); }
.hb-heat-l1 { background: rgba(62, 194, 138, 0.22); }
.hb-heat-l2 { background: rgba(62, 194, 138, 0.42); }
.hb-heat-l3 { background: rgba(62, 194, 138, 0.65); }
.hb-heat-l4 { background: rgba(62, 194, 138, 0.92); }

.hb-heat-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--hml-text-faint, #6a6a6c);
  padding: 0 2px;
}
.hb-heat-legend .hb-heat-cell { width: 10px; height: 10px; }
.hb-heat-legend span { padding: 0 4px; }
`;
