import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type { Task, Note } from "../../lib/types";

type Tab = "tasks" | "notes";

const TASKS_KEY = "hml.tasks.v1";
const NOTES_KEY = "hml.notes.v1";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function deriveTitle(body: string): string {
  const firstLine = body.split("\n").find((l) => l.trim().length > 0);
  return (firstLine ?? "").trim().slice(0, 80) || "Untitled note";
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`.toUpperCase();
}

interface TasksNotesProps {
  root: string | null;
}

export function TasksNotes({ root }: TasksNotesProps) {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div className="hml-content">
      <style>{tasksNotesCSS}</style>

      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" style={{ background: "var(--hml-accent)" }} />
            Workspace
          </div>
          <h1 className="hml-page-title">Tasks &amp; Notes</h1>
          <div className="hml-page-subtitle">
            Quick-capture for what you're juggling. Local-only. Never leaves your machine.
          </div>
        </div>
      </section>

      <nav className="hml-subnav" style={{ marginBottom: 22 }}>
        <button
          type="button"
          className={`hml-subnav-item${tab === "tasks" ? " hml-active" : ""}`}
          onClick={() => setTab("tasks")}
        >
          Tasks
        </button>
        <button
          type="button"
          className={`hml-subnav-item${tab === "notes" ? " hml-active" : ""}`}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
      </nav>

      <div className="md-tasks-page">
        {tab === "tasks" ? <TasksPane root={root} /> : <NotesPane root={root} />}
      </div>
    </div>
  );
}

function TasksPane({ root }: { root: string | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);
  const saveTimer = useRef<number | null>(null);
  const needsMigration = useRef(false);

  // Load on mount / when root changes
  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoading(true);

    const run = async () => {
      if (root) {
        try {
          const state = await api.readDashboardState(root);
          if (cancelled) return;
          const folderTasks = Array.isArray(state.tasks) ? state.tasks : [];
          const lsTasks = loadJSON<Task[]>(TASKS_KEY, []);
          if (folderTasks.length === 0 && lsTasks.length > 0) {
            needsMigration.current = true;
            setTasks(lsTasks);
          } else {
            needsMigration.current = false;
            setTasks(folderTasks);
          }
        } catch (err) {
          console.warn("Failed to read dashboard state for tasks:", err);
          if (!cancelled) setTasks(loadJSON<Task[]>(TASKS_KEY, []));
        }
      } else {
        if (!cancelled) setTasks(loadJSON<Task[]>(TASKS_KEY, []));
      }
      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [root]);

  // Save (debounced)
  useEffect(() => {
    if (loading) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const persist = async () => {
        if (root) {
          try {
            const current = await api.readDashboardState(root);
            await api.writeDashboardState(root, {
              tasks,
              notes: Array.isArray(current.notes) ? current.notes : [],
              calendar: current.calendar ?? null,
              recordings: Array.isArray(current.recordings) ? current.recordings : [],
            });
            if (needsMigration.current) {
              try {
                localStorage.removeItem(TASKS_KEY);
              } catch {
                /* ignore */
              }
              needsMigration.current = false;
            }
          } catch (err) {
            console.warn("Failed to write tasks to dashboard state:", err);
          }
        } else {
          try {
            localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
          } catch (err) {
            console.warn("Failed to write tasks to localStorage:", err);
          }
        }
      };
      void persist();
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [tasks, root, loading]);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    const t: Task = { id: uid(), title, done: false, createdAt: Date.now() };
    setTasks((prev) => [t, ...prev]);
    setDraft("");
  };

  const toggle = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const remove = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <div className="md-panel md-tasks-panel">
      <div className="md-panel-head">
        <span className="md-panel-title">▸ Tasks</span>
        <span className="md-panel-meta">
          {remaining} OPEN · {tasks.length} TOTAL
        </span>
      </div>

      <div className="md-tasks-input-row">
        <input
          className="md-tasks-input"
          type="text"
          placeholder="Add a task…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="md-tasks-add"
          onClick={add}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="md-tasks-empty">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="md-tasks-empty">No tasks yet, Sir.</div>
      ) : (
        <ul className="md-tasks-list">
          {sorted.map((t) => (
            <li key={t.id} className={`md-tasks-row ${t.done ? "is-done" : ""}`}>
              <label className="md-tasks-check">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggle(t.id)}
                />
                <span className="md-tasks-box" aria-hidden="true" />
              </label>
              <span className="md-tasks-title">{t.title}</span>
              <button
                type="button"
                className="md-tasks-delete"
                aria-label="Delete task"
                onClick={() => remove(t.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPane({ root }: { root: string | null }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);
  const saveTimer = useRef<number | null>(null);
  const needsMigration = useRef(false);

  // Load on mount / when root changes
  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoading(true);

    const run = async () => {
      if (root) {
        try {
          const state = await api.readDashboardState(root);
          if (cancelled) return;
          const folderNotes = Array.isArray(state.notes) ? state.notes : [];
          const lsNotes = loadJSON<Note[]>(NOTES_KEY, []);
          let next: Note[];
          if (folderNotes.length === 0 && lsNotes.length > 0) {
            needsMigration.current = true;
            next = lsNotes;
          } else {
            needsMigration.current = false;
            next = folderNotes;
          }
          setNotes(next);
          if (next.length > 0) {
            setActiveId((prev) => prev ?? next[0].id);
          }
        } catch (err) {
          console.warn("Failed to read dashboard state for notes:", err);
          if (!cancelled) {
            const fallback = loadJSON<Note[]>(NOTES_KEY, []);
            setNotes(fallback);
            if (fallback.length > 0) setActiveId((prev) => prev ?? fallback[0].id);
          }
        }
      } else {
        const fallback = loadJSON<Note[]>(NOTES_KEY, []);
        if (!cancelled) {
          setNotes(fallback);
          if (fallback.length > 0) setActiveId((prev) => prev ?? fallback[0].id);
        }
      }
      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [root]);

  // Save (debounced)
  useEffect(() => {
    if (loading) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const persist = async () => {
        if (root) {
          try {
            const current = await api.readDashboardState(root);
            await api.writeDashboardState(root, {
              tasks: Array.isArray(current.tasks) ? current.tasks : [],
              notes,
              calendar: current.calendar ?? null,
              recordings: Array.isArray(current.recordings) ? current.recordings : [],
            });
            if (needsMigration.current) {
              try {
                localStorage.removeItem(NOTES_KEY);
              } catch {
                /* ignore */
              }
              needsMigration.current = false;
            }
          } catch (err) {
            console.warn("Failed to write notes to dashboard state:", err);
          }
        } else {
          try {
            localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
          } catch (err) {
            console.warn("Failed to write notes to localStorage:", err);
          }
        }
      };
      void persist();
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [notes, root, loading]);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes],
  );
  const active = useMemo(
    () => notes.find((n) => n.id === activeId) ?? null,
    [notes, activeId],
  );

  const create = () => {
    const n: Note = {
      id: uid(),
      title: "",
      body: "",
      updatedAt: Date.now(),
    };
    setNotes((prev) => [n, ...prev]);
    setActiveId(n.id);
  };

  const updateBody = (id: string, body: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, body, updatedAt: Date.now() } : n)),
    );
  };

  const updateTitle = (id: string, title: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, title, updatedAt: Date.now() } : n)),
    );
  };

  const remove = (id: string) => {
    const n = notes.find((x) => x.id === id);
    const label = n?.title?.trim() || deriveTitle(n?.body ?? "");
    if (!window.confirm(`Delete "${label}"?`)) return;
    setNotes((prev) => prev.filter((x) => x.id !== id));
    if (activeId === id) setActiveId(null);
    if (renamingId === id) setRenamingId(null);
  };

  const titleOf = (n: Note) => n.title.trim() || deriveTitle(n.body);
  const previewOf = (n: Note) => {
    const lines = n.body.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = n.title.trim();
    const preview = title ? lines[0] : lines[1];
    return (preview ?? "").slice(0, 90) || "Empty note";
  };

  return (
    <div className="md-notes-wrap">
      <aside className="md-notes-list-wrap md-panel">
        <div className="md-panel-head">
          <span className="md-panel-title">▸ Notes</span>
          <button type="button" className="md-notes-new" onClick={create}>
            + New note
          </button>
        </div>

        {loading ? (
          <div className="md-tasks-empty">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="md-tasks-empty">No notes yet.</div>
        ) : (
          <ul className="md-notes-list">
            {sorted.map((n) => {
              const isActive = n.id === activeId;
              return (
                <li
                  key={n.id}
                  className={`md-notes-item ${isActive ? "is-active" : ""}`}
                  onClick={() => setActiveId(n.id)}
                >
                  <div className="md-notes-item-title">{titleOf(n)}</div>
                  <div className="md-notes-item-preview">{previewOf(n)}</div>
                  <div className="md-notes-item-meta">{formatStamp(n.updatedAt)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="md-notes-editor md-panel">
        {loading ? (
          <div className="md-tasks-empty md-notes-empty">Loading…</div>
        ) : !active ? (
          <div className="md-tasks-empty md-notes-empty">
            Select a note, or create a new one.
          </div>
        ) : (
          <>
            <div className="md-notes-editor-head">
              {renamingId === active.id ? (
                <input
                  className="md-notes-title-input"
                  autoFocus
                  value={active.title}
                  onChange={(e) => updateTitle(active.id, e.target.value)}
                  onBlur={() => setRenamingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      e.preventDefault();
                      setRenamingId(null);
                    }
                  }}
                  placeholder="Note title"
                />
              ) : (
                <button
                  type="button"
                  className="md-notes-title-btn"
                  onClick={() => setRenamingId(active.id)}
                  title="Rename"
                >
                  {titleOf(active)}
                </button>
              )}
              <div className="md-notes-editor-actions">
                <span className="md-panel-meta">
                  {formatStamp(active.updatedAt)}
                </span>
                <button
                  type="button"
                  className="md-notes-delete"
                  onClick={() => remove(active.id)}
                >
                  Delete
                </button>
              </div>
            </div>
            <textarea
              className="md-notes-textarea"
              value={active.body}
              onChange={(e) => updateBody(active.id, e.target.value)}
              placeholder="Start writing…"
            />
          </>
        )}
      </section>
    </div>
  );
}

const tasksNotesCSS = `
.md-tasks-page {
  padding: 0;
  max-width: none;
}
.md-tasks-head {
  margin-bottom: 22px;
}
.md-tasks-head h1 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.md-tasks-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.md-tasks-tab {
  background: none;
  border: none;
  padding: 10px 18px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-faint);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 120ms ease, border-color 120ms ease;
}
.md-tasks-tab:hover {
  color: var(--text-muted);
}
.md-tasks-tab.is-active {
  color: var(--copper);
  border-bottom-color: var(--copper);
}

.md-tasks-panel {
  padding: 22px 26px 18px;
}
.md-tasks-input-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.md-tasks-input {
  flex: 1;
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  font-family: var(--sans);
  font-size: 14px;
  outline: none;
  transition: border-color 120ms ease;
}
.md-tasks-input:focus {
  border-color: var(--copper);
}
.md-tasks-input::placeholder {
  color: var(--text-faint);
}
.md-tasks-add {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--copper);
  padding: 0 18px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.md-tasks-add:hover:not(:disabled) {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.md-tasks-add:disabled {
  color: var(--text-faint);
  cursor: not-allowed;
  opacity: 0.6;
}

.md-tasks-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.md-tasks-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border);
  position: relative;
}
.md-tasks-row:last-child {
  border-bottom: none;
}
.md-tasks-check {
  position: relative;
  width: 16px;
  height: 16px;
  display: inline-flex;
  cursor: pointer;
  flex-shrink: 0;
}
.md-tasks-check input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.md-tasks-box {
  width: 16px;
  height: 16px;
  border: 1px solid var(--border);
  background: var(--bg-void);
  display: inline-block;
  position: relative;
  transition: border-color 120ms ease, background 120ms ease;
}
.md-tasks-check:hover .md-tasks-box {
  border-color: var(--copper);
}
.md-tasks-check input:checked + .md-tasks-box {
  background: var(--copper);
  border-color: var(--copper);
}
.md-tasks-check input:checked + .md-tasks-box::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border-right: 2px solid var(--bg-void);
  border-bottom: 2px solid var(--bg-void);
  transform: rotate(45deg);
}
.md-tasks-title {
  flex: 1;
  font-family: var(--sans);
  font-size: 14px;
  color: var(--text);
  word-break: break-word;
}
.md-tasks-row.is-done .md-tasks-title {
  color: var(--text-faint);
  text-decoration: line-through;
}
.md-tasks-delete {
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  opacity: 0;
  transition: opacity 120ms ease, color 120ms ease;
}
.md-tasks-row:hover .md-tasks-delete {
  opacity: 1;
}
.md-tasks-delete:hover {
  color: var(--copper);
}
.md-tasks-empty {
  padding: 28px 8px;
  text-align: center;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.md-notes-wrap {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
}
.md-notes-list-wrap {
  padding: 18px 18px 8px;
  background: var(--bg-surface);
}
.md-notes-new {
  background: none;
  border: 1px solid var(--border);
  color: var(--copper);
  padding: 4px 10px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.md-notes-new:hover {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.md-notes-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 560px;
  overflow-y: auto;
}
.md-notes-item {
  padding: 12px 10px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 120ms ease;
}
.md-notes-item:hover {
  background: rgba(184, 115, 51, 0.04);
}
.md-notes-item.is-active {
  background: rgba(184, 115, 51, 0.1);
  border-left: 2px solid var(--copper);
  padding-left: 8px;
}
.md-notes-item-title {
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-notes-item-preview {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.md-notes-item-meta {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--text-faint);
}

.md-notes-editor {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  min-height: 560px;
}
.md-notes-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;
}
.md-notes-title-btn {
  background: none;
  border: none;
  color: var(--text);
  font-family: var(--sans);
  font-size: 18px;
  font-weight: 600;
  text-align: left;
  cursor: text;
  padding: 2px 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-notes-title-btn:hover {
  color: var(--copper);
}
.md-notes-title-input {
  flex: 1;
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 8px;
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  outline: none;
}
.md-notes-title-input:focus {
  border-color: var(--copper);
}
.md-notes-editor-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.md-notes-delete {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 4px 10px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}
.md-notes-delete:hover {
  border-color: var(--copper);
  color: var(--copper);
}
.md-notes-textarea {
  flex: 1;
  width: 100%;
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 14px;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  min-height: 420px;
  transition: border-color 120ms ease;
}
.md-notes-textarea:focus {
  border-color: var(--copper);
}
.md-notes-textarea::placeholder {
  color: var(--text-faint);
}
.md-notes-empty {
  margin: auto;
}

@media (max-width: 860px) {
  .md-notes-wrap {
    grid-template-columns: 1fr;
  }
  .md-notes-list {
    max-height: 240px;
  }
}
`;
