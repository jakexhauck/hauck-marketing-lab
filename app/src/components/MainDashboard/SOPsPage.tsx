import React, { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type { DashboardState, SopFile, SopRun, SopSummary } from "../../lib/types";

type Mode = "read" | "edit" | "run";

interface SOPsPageProps {
  root: string | null;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Stable hash of a step's textual content, used as run.checks key.
 *  Normalises whitespace + case so reformatting doesn't blow away run state. */
function hashStep(text: string): string {
  const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const CHECKBOX_RE = /^(\s*)-\s*\[([ xX])\]\s+(.+)$/;

function parseCheckboxLine(
  line: string,
): { ok: boolean; text: string; defaultDone: boolean } {
  const m = line.match(CHECKBOX_RE);
  if (!m) return { ok: false, text: "", defaultDone: false };
  return { ok: true, text: m[3], defaultDone: m[2].toLowerCase() === "x" };
}

function extractStepHashes(body: string): string[] {
  return body
    .split("\n")
    .map(parseCheckboxLine)
    .filter((cb) => cb.ok)
    .map((cb) => hashStep(cb.text));
}

function runProgress(run: SopRun, body: string): { done: number; total: number } {
  const hashes = extractStepHashes(body);
  const total = hashes.length;
  const done = hashes.filter((h) => run.checks[h]).length;
  return { done, total };
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`.toUpperCase();
}

// ---------- tiny markdown renderer ----------
// Only what SOPs need: H1/H2/H3, paragraphs, `- ` bullets, checkbox steps, **bold**, *italic*, `code`.

function renderInline(text: string, prefix: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  let buf = "";
  let i = 0;
  let key = 0;
  const flush = () => {
    if (buf) {
      out.push(<span key={`${prefix}-t${key++}`}>{buf}</span>);
      buf = "";
    }
  };
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push(<strong key={`${prefix}-b${key++}`}>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push(<code key={`${prefix}-c${key++}`}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && text[i + 1] !== "*") {
        flush();
        out.push(<em key={`${prefix}-i${key++}`}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}

interface MarkdownProps {
  body: string;
  run?: SopRun | null;
  onToggle?: (stepKey: string, next: boolean) => void;
}

function MarkdownView({ body, run, onToggle }: MarkdownProps) {
  const lines = body.split("\n");
  const nodes: React.ReactElement[] = [];
  let para: string[] = [];
  let bullets: React.ReactElement[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const txt = para.join(" ").trim();
    if (txt) {
      nodes.push(<p key={`p${key++}`}>{renderInline(txt, `p${key}`)}</p>);
    }
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`u${key++}`} className="sop-bullets">
        {bullets}
      </ul>,
    );
    bullets = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushPara();
      flushBullets();
      continue;
    }

    const cb = parseCheckboxLine(line);
    if (cb.ok) {
      flushPara();
      flushBullets();
      const h = hashStep(cb.text);
      const checked = run ? !!run.checks[h] : cb.defaultDone;
      const interactive = !!run && !!onToggle;
      nodes.push(
        <label
          key={`s${key++}`}
          className={`sop-step${checked ? " sop-step-done" : ""}${
            interactive ? "" : " sop-step-static"
          }`}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={!interactive}
            onChange={(e) => onToggle?.(h, e.target.checked)}
          />
          <span>{renderInline(cb.text, `s${key}`)}</span>
        </label>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushPara();
      flushBullets();
      nodes.push(<h3 key={`h${key++}`}>{renderInline(line.slice(4), `h${key}`)}</h3>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      flushBullets();
      nodes.push(<h2 key={`h${key++}`}>{renderInline(line.slice(3), `h${key}`)}</h2>);
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      flushBullets();
      nodes.push(<h1 key={`h${key++}`}>{renderInline(line.slice(2), `h${key}`)}</h1>);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      bullets.push(
        <li key={`l${key++}`}>{renderInline(line.slice(2), `l${key}`)}</li>,
      );
      continue;
    }

    flushBullets();
    para.push(line);
  }
  flushPara();
  flushBullets();

  return <div className="sop-md">{nodes}</div>;
}

// ---------- main page ----------

export function SOPsPage({ root }: SOPsPageProps) {
  const [sops, setSops] = useState<SopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<SopFile | null>(null);
  const [mode, setMode] = useState<Mode>("read");

  // Edit-mode draft
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Run-mode state
  const [runs, setRuns] = useState<SopRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const runSaveTimer = useRef<number | null>(null);

  // ---------- load SOPs list ----------
  const refreshList = useCallback(async () => {
    if (!root) {
      setSops([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.listSops(root);
      setSops(list);
      setListError(null);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [root, selectedId]);

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  // ---------- load selected SOP body ----------
  useEffect(() => {
    if (!root || !selectedId) {
      setCurrent(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sop = await api.readSop(root, selectedId);
        if (cancelled) return;
        setCurrent(sop);
        setDraftTitle(sop.title);
        setDraftSummary(sop.summary ?? "");
        setDraftBody(sop.body);
        setDraftTags(sop.tags.join(", "));
        setEditError(null);
        setMode("read");
        setActiveRunId(null);
      } catch (err) {
        if (!cancelled) {
          setEditError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, selectedId]);

  // ---------- load runs from dashboard state ----------
  const loadRuns = useCallback(async () => {
    if (!root) {
      setRuns([]);
      return;
    }
    try {
      const state = await api.readDashboardState(root);
      setRuns(Array.isArray(state.sopRuns) ? state.sopRuns : []);
    } catch (err) {
      console.warn("Failed to read dashboard state for SOP runs:", err);
    }
  }, [root]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Persist run changes (debounced 350ms)
  const persistRuns = useCallback(
    (next: SopRun[]) => {
      if (!root) return;
      if (runSaveTimer.current) window.clearTimeout(runSaveTimer.current);
      runSaveTimer.current = window.setTimeout(async () => {
        try {
          const state = await api.readDashboardState(root);
          const merged: DashboardState = {
            tasks: Array.isArray(state.tasks) ? state.tasks : [],
            notes: Array.isArray(state.notes) ? state.notes : [],
            calendar: state.calendar ?? null,
            recordings: Array.isArray(state.recordings) ? state.recordings : [],
            sopRuns: next,
          };
          await api.writeDashboardState(root, merged);
        } catch (err) {
          console.warn("Failed to persist SOP runs:", err);
        }
      }, 350);
    },
    [root],
  );

  useEffect(() => {
    return () => {
      if (runSaveTimer.current) window.clearTimeout(runSaveTimer.current);
    };
  }, []);

  // ---------- derived ----------
  const runsForSop = useMemo(
    () =>
      [...runs]
        .filter((r) => r.sopId === selectedId)
        .sort((a, b) => {
          // active first, then most recent
          const aActive = a.completedAt == null ? 0 : 1;
          const bActive = b.completedAt == null ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return b.startedAt - a.startedAt;
        }),
    [runs, selectedId],
  );

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeRunId) ?? null,
    [runs, activeRunId],
  );

  const runCountBySopId = useMemo(() => {
    const m: Record<string, { active: number; total: number }> = {};
    for (const r of runs) {
      const cur = m[r.sopId] ?? { active: 0, total: 0 };
      cur.total++;
      if (r.completedAt == null) cur.active++;
      m[r.sopId] = cur;
    }
    return m;
  }, [runs]);

  // ---------- actions ----------
  const handleNewSop = async () => {
    if (!root) return;
    const title = window.prompt("Title for the new SOP:")?.trim();
    if (!title) return;
    try {
      const sop = await api.createSop(root, title);
      await refreshList();
      setSelectedId(sop.id);
      setMode("edit");
    } catch (err) {
      window.alert(`Failed to create SOP: ${err}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!root || !current) return;
    if (!draftTitle.trim()) {
      setEditError("Title cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const tags = draftTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const updated = await api.writeSop(root, current.id, {
        title: draftTitle.trim(),
        summary: draftSummary.trim() || null,
        tags,
        body: draftBody,
      });
      setCurrent(updated);
      setMode("read");
      setEditError(null);
      await refreshList();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!current) return;
    setDraftTitle(current.title);
    setDraftSummary(current.summary ?? "");
    setDraftBody(current.body);
    setDraftTags(current.tags.join(", "));
    setEditError(null);
    setMode("read");
  };

  const handleDeleteSop = async () => {
    if (!root || !current) return;
    if (!window.confirm(`Delete "${current.title}"? This removes the .md file from the vault.`)) {
      return;
    }
    try {
      await api.deleteSop(root, current.id);
      // also drop any runs for this SOP
      const next = runs.filter((r) => r.sopId !== current.id);
      setRuns(next);
      persistRuns(next);
      setSelectedId(null);
      setCurrent(null);
      await refreshList();
    } catch (err) {
      window.alert(`Failed to delete SOP: ${err}`);
    }
  };

  const handleInsertStep = () => {
    const ta = bodyRef.current;
    if (!ta) return;
    const insertion = ta.selectionStart > 0 && draftBody[ta.selectionStart - 1] !== "\n" ? "\n- [ ] " : "- [ ] ";
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = draftBody.slice(0, start) + insertion + draftBody.slice(end);
    setDraftBody(next);
    requestAnimationFrame(() => {
      const pos = start + insertion.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleStartRun = () => {
    if (!current) return;
    const label = window.prompt("Optional label for this run (e.g. client name, date). Leave empty to skip:")?.trim();
    const newRun: SopRun = {
      id: uid(),
      sopId: current.id,
      label: label || null,
      startedAt: Date.now(),
      completedAt: null,
      checks: {},
    };
    const next = [newRun, ...runs];
    setRuns(next);
    setActiveRunId(newRun.id);
    setMode("run");
    persistRuns(next);
  };

  const handleToggleStep = (stepKey: string, value: boolean) => {
    if (!activeRunId) return;
    const next = runs.map((r) => {
      if (r.id !== activeRunId) return r;
      const checks = { ...r.checks, [stepKey]: value };
      if (!value) delete checks[stepKey];
      return { ...r, checks };
    });
    setRuns(next);
    persistRuns(next);
  };

  const handleCompleteRun = () => {
    if (!activeRunId) return;
    const next = runs.map((r) =>
      r.id === activeRunId ? { ...r, completedAt: Date.now() } : r,
    );
    setRuns(next);
    persistRuns(next);
  };

  const handleReopenRun = () => {
    if (!activeRunId) return;
    const next = runs.map((r) =>
      r.id === activeRunId ? { ...r, completedAt: null } : r,
    );
    setRuns(next);
    persistRuns(next);
  };

  const handleDeleteRun = (id: string) => {
    const target = runs.find((r) => r.id === id);
    const label = target?.label || formatStamp(target?.startedAt ?? Date.now());
    if (!window.confirm(`Delete run "${label}"?`)) return;
    const next = runs.filter((r) => r.id !== id);
    setRuns(next);
    if (activeRunId === id) setActiveRunId(null);
    persistRuns(next);
  };

  // ---------- render ----------
  return (
    <div className="md-sops-page">
      <style>{sopsPageCSS}</style>

      <div className="sops-head">
        <span className="md-page-head-eyebrow">▸ Workspace</span>
        <h1>
          Standard <span className="md-copper-text">Operating Procedures</span>
        </h1>
        <p className="sops-subtitle">
          Living playbooks. Edit here, render in Obsidian, run them as checklists.
        </p>
      </div>

      <div className="sops-shell">
        {/* Left rail */}
        <aside className="sops-rail">
          <div className="sops-rail-head">
            <span>{sops.length} SOPs</span>
            <button type="button" className="sops-new" onClick={handleNewSop} disabled={!root}>
              + New SOP
            </button>
          </div>

          {loading ? (
            <div className="sops-empty">Loading…</div>
          ) : listError ? (
            <div className="sops-empty sops-err">{listError}</div>
          ) : sops.length === 0 ? (
            <div className="sops-empty">
              No SOPs yet, Sir. Click <strong>+ New SOP</strong> to write the first.
            </div>
          ) : (
            <ul className="sops-list">
              {sops.map((s) => {
                const isActive = s.id === selectedId;
                const counts = runCountBySopId[s.id];
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`sops-list-item${isActive ? " is-active" : ""}`}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <span className="sops-list-id">{s.id}</span>
                      <span className="sops-list-title">{s.title}</span>
                      <span className="sops-list-meta">
                        {s.stepCount} step{s.stepCount === 1 ? "" : "s"}
                        {counts && counts.active > 0 ? ` · ${counts.active} live` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right pane */}
        <section className="sops-pane">
          {!current ? (
            <div className="sops-pane-empty">
              {root
                ? sops.length === 0
                  ? "Pick + New SOP to begin."
                  : "Select an SOP from the left."
                : "Pick a media-buying folder first to load SOPs."}
            </div>
          ) : (
            <>
              <div className="sops-pane-head">
                <div className="sops-pane-head-left">
                  <span className="sops-id-chip">{current.id}</span>
                  <h2>{current.title}</h2>
                  {current.summary && <p className="sops-summary">{current.summary}</p>}
                </div>
                <div className="sops-mode-tabs">
                  <button
                    type="button"
                    className={`sops-tab${mode === "read" ? " is-active" : ""}`}
                    onClick={() => setMode("read")}
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    className={`sops-tab${mode === "edit" ? " is-active" : ""}`}
                    onClick={() => setMode("edit")}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`sops-tab${mode === "run" ? " is-active" : ""}`}
                    onClick={() => setMode("run")}
                  >
                    Run
                  </button>
                </div>
              </div>

              {mode === "read" && (
                <div className="sops-body">
                  <MarkdownView body={current.body} />
                  <div className="sops-pane-foot">
                    <button type="button" className="sops-btn-danger" onClick={handleDeleteSop}>
                      Delete SOP
                    </button>
                  </div>
                </div>
              )}

              {mode === "edit" && (
                <div className="sops-body">
                  <div className="sops-edit-row">
                    <label>
                      <span>Title</span>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="sops-edit-row">
                    <label>
                      <span>Summary</span>
                      <input
                        type="text"
                        value={draftSummary}
                        placeholder="One-line description (optional)"
                        onChange={(e) => setDraftSummary(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="sops-edit-row">
                    <label>
                      <span>Tags</span>
                      <input
                        type="text"
                        value={draftTags}
                        placeholder="comma, separated, tags"
                        onChange={(e) => setDraftTags(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="sops-edit-row sops-edit-body">
                    <div className="sops-edit-body-head">
                      <span>Body (Markdown)</span>
                      <button type="button" className="sops-mini-btn" onClick={handleInsertStep}>
                        + Step
                      </button>
                    </div>
                    <textarea
                      ref={bodyRef}
                      value={draftBody}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                        setDraftBody(e.target.value)
                      }
                      rows={24}
                      spellCheck={false}
                    />
                  </div>
                  {editError && <div className="sops-edit-error">{editError}</div>}
                  <div className="sops-pane-foot">
                    <button
                      type="button"
                      className="sops-btn-ghost"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="sops-btn-primary"
                      onClick={handleSaveEdit}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save to vault"}
                    </button>
                  </div>
                </div>
              )}

              {mode === "run" && (
                <div className="sops-body">
                  <div className="sops-runs-head">
                    <button
                      type="button"
                      className="sops-btn-primary"
                      onClick={handleStartRun}
                    >
                      Start new run
                    </button>
                    <span className="sops-runs-count">
                      {runsForSop.length} run{runsForSop.length === 1 ? "" : "s"} on file
                    </span>
                  </div>

                  {runsForSop.length === 0 ? (
                    <div className="sops-empty">
                      No runs yet. Click <strong>Start new run</strong> to walk through it.
                    </div>
                  ) : (
                    <ul className="sops-runs">
                      {runsForSop.map((r) => {
                        const { done, total } = runProgress(r, current.body);
                        const isActive = r.id === activeRunId;
                        const isComplete = r.completedAt != null;
                        return (
                          <li
                            key={r.id}
                            className={`sops-run${isActive ? " is-active" : ""}${
                              isComplete ? " is-complete" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="sops-run-pick"
                              onClick={() => setActiveRunId(isActive ? null : r.id)}
                            >
                              <span className="sops-run-label">
                                {r.label || "(unlabelled)"}
                              </span>
                              <span className="sops-run-meta">
                                {isComplete ? "DONE" : "LIVE"} · {done}/{total}
                              </span>
                              <span className="sops-run-stamp">{formatStamp(r.startedAt)}</span>
                            </button>
                            <button
                              type="button"
                              className="sops-run-delete"
                              onClick={() => handleDeleteRun(r.id)}
                              title="Delete this run"
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {activeRun && (
                    <div className="sops-run-body">
                      <div className="sops-run-body-head">
                        <span>Running: {activeRun.label || "(unlabelled)"}</span>
                        {activeRun.completedAt == null ? (
                          <button
                            type="button"
                            className="sops-mini-btn"
                            onClick={handleCompleteRun}
                          >
                            Mark complete
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sops-mini-btn"
                            onClick={handleReopenRun}
                          >
                            Re-open
                          </button>
                        )}
                      </div>
                      <MarkdownView
                        body={current.body}
                        run={activeRun}
                        onToggle={handleToggleStep}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const sopsPageCSS = `
.md-sops-page {
  padding: 32px 0 80px;
  max-width: 1280px;
}
.sops-head {
  margin-bottom: 22px;
}
.sops-head h1 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.sops-subtitle {
  margin: 8px 0 0;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--text-muted);
}
.sops-shell {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 22px;
  align-items: start;
}
.sops-rail {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 14px;
  position: sticky;
  top: 16px;
}
.sops-rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.sops-new {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--copper);
  padding: 4px 10px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.sops-new:hover:not(:disabled) {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.sops-new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sops-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sops-list-item {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  text-align: left;
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
  padding: 8px 10px;
  cursor: pointer;
  color: var(--text);
  transition: background 120ms ease, border-color 120ms ease;
}
.sops-list-item:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: var(--border);
}
.sops-list-item.is-active {
  background: rgba(184, 115, 51, 0.08);
  border-color: var(--copper);
}
.sops-list-id {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--copper);
}
.sops-list-title {
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
}
.sops-list-meta {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-empty {
  padding: 24px 12px;
  text-align: center;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-empty strong {
  color: var(--copper);
  font-weight: 600;
}
.sops-empty.sops-err {
  color: #d07a55;
}
.sops-pane {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 22px 26px;
  min-height: 480px;
}
.sops-pane-empty {
  padding: 80px 12px;
  text-align: center;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-pane-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
  margin-bottom: 18px;
}
.sops-pane-head-left {
  flex: 1;
  min-width: 0;
}
.sops-pane-head h2 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
}
.sops-id-chip {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--copper);
}
.sops-summary {
  margin: 8px 0 0;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--text-muted);
}
.sops-mode-tabs {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.sops-tab {
  background: var(--bg-void);
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  padding: 8px 16px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
}
.sops-tab:last-child {
  border-right: none;
}
.sops-tab:hover {
  color: var(--text);
}
.sops-tab.is-active {
  color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.sops-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sops-md h1 {
  font-family: var(--sans);
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
  margin: 14px 0 6px;
}
.sops-md h2 {
  font-family: var(--sans);
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  margin: 18px 0 6px;
}
.sops-md h3 {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 14px 0 4px;
  letter-spacing: 0.02em;
}
.sops-md p {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.62;
  color: var(--text-muted);
  margin: 0 0 10px;
}
.sops-md p em {
  color: var(--text-faint);
}
.sops-md code {
  font-family: var(--mono);
  font-size: 12.5px;
  background: var(--bg-void);
  padding: 1px 6px;
  border: 1px solid var(--border);
  color: var(--copper);
}
.sops-bullets {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
}
.sops-bullets li {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
  padding: 2px 0 2px 18px;
  position: relative;
}
.sops-bullets li::before {
  content: "›";
  position: absolute;
  left: 0;
  color: var(--copper);
}
.sop-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  margin: 2px 0;
  border: 1px solid transparent;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}
.sop-step:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: var(--border);
}
.sop-step input[type="checkbox"] {
  margin-top: 3px;
  accent-color: var(--copper);
  cursor: pointer;
}
.sop-step.sop-step-static {
  cursor: default;
}
.sop-step.sop-step-static:hover {
  background: transparent;
  border-color: transparent;
}
.sop-step.sop-step-static input[type="checkbox"] {
  cursor: default;
  opacity: 0.55;
}
.sop-step-done > span {
  color: var(--text-faint);
  text-decoration: line-through;
}
.sops-edit-row label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sops-edit-row label > span {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.sops-edit-row input {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 9px 11px;
  font-family: var(--sans);
  font-size: 14px;
  outline: none;
  transition: border-color 120ms ease;
}
.sops-edit-row input:focus {
  border-color: var(--copper);
}
.sops-edit-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sops-edit-body-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sops-edit-body-head > span {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.sops-edit-body textarea {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 12px 14px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.55;
  outline: none;
  resize: vertical;
  min-height: 320px;
  transition: border-color 120ms ease;
}
.sops-edit-body textarea:focus {
  border-color: var(--copper);
}
.sops-mini-btn {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--copper);
  padding: 4px 12px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.sops-mini-btn:hover {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.sops-edit-error {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #d07a55;
}
.sops-pane-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  margin-top: 8px;
}
.sops-btn-primary,
.sops-btn-ghost,
.sops-btn-danger {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--copper);
  padding: 0 18px;
  height: 38px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.sops-btn-primary:hover:not(:disabled) {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.sops-btn-ghost {
  color: var(--text-muted);
}
.sops-btn-ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--text-muted);
}
.sops-btn-danger {
  color: #d07a55;
  margin-right: auto;
}
.sops-btn-danger:hover {
  border-color: #d07a55;
  background: rgba(208, 122, 85, 0.08);
}
.sops-btn-primary:disabled,
.sops-btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sops-runs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sops-runs-count {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sops-run {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border);
  background: var(--bg-void);
  transition: border-color 120ms ease;
}
.sops-run:hover {
  border-color: var(--text-muted);
}
.sops-run.is-active {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.06);
}
.sops-run.is-complete .sops-run-label {
  color: var(--text-faint);
}
.sops-run-pick {
  flex: 1;
  background: transparent;
  border: none;
  text-align: left;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  cursor: pointer;
  color: var(--text);
}
.sops-run-label {
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 500;
}
.sops-run-meta {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--copper);
}
.sops-run.is-complete .sops-run-meta {
  color: var(--text-faint);
}
.sops-run-stamp {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-run-delete {
  background: transparent;
  border: none;
  border-left: 1px solid var(--border);
  color: var(--text-faint);
  width: 36px;
  font-size: 18px;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
}
.sops-run-delete:hover {
  color: #d07a55;
  background: rgba(208, 122, 85, 0.06);
}
.sops-run-body {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  background: var(--bg-void);
}
.sops-run-body-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

@media (max-width: 980px) {
  .sops-shell {
    grid-template-columns: 1fr;
  }
  .sops-rail {
    position: static;
  }
}
`;
