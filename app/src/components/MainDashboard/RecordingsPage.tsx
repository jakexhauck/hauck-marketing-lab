import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type { FathomRecording } from "../../lib/types";

const RECORDINGS_KEY = "hml.recordings.v1";
const FATHOM_SHARE_RE =
  /^https?:\/\/(?:[\w-]+\.)?fathom\.video\/(?:share|calls)\/([\w-]+)/i;

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

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`.toUpperCase();
}

function parseFathomUrl(input: string): { url: string; embedUrl: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(FATHOM_SHARE_RE);
  if (!match) return null;
  const id = match[1];
  return {
    url: trimmed,
    embedUrl: `https://fathom.video/share/${id}`,
  };
}

interface RecordingsPageProps {
  root: string | null;
}

export function RecordingsPage({ root }: RecordingsPageProps) {
  const [recordings, setRecordings] = useState<FathomRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);
  const saveTimer = useRef<number | null>(null);
  const needsMigration = useRef(false);

  const [recUrl, setRecUrl] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recError, setRecError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoading(true);

    const run = async () => {
      if (root) {
        try {
          const state = await api.readDashboardState(root);
          if (cancelled) return;
          const folderRecs = Array.isArray(state.recordings) ? state.recordings : [];
          const lsRecs = loadJSON<FathomRecording[]>(RECORDINGS_KEY, []);
          if (folderRecs.length === 0 && lsRecs.length > 0) {
            needsMigration.current = true;
            setRecordings(lsRecs);
          } else {
            needsMigration.current = false;
            setRecordings(folderRecs);
          }
        } catch (err) {
          console.warn("Failed to read dashboard state for recordings:", err);
          if (!cancelled)
            setRecordings(loadJSON<FathomRecording[]>(RECORDINGS_KEY, []));
        }
      } else {
        if (!cancelled)
          setRecordings(loadJSON<FathomRecording[]>(RECORDINGS_KEY, []));
      }
      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [root]);

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
              notes: Array.isArray(current.notes) ? current.notes : [],
              calendar: current.calendar ?? null,
              recordings,
            });
            if (needsMigration.current) {
              try {
                localStorage.removeItem(RECORDINGS_KEY);
              } catch {
                /* ignore */
              }
              needsMigration.current = false;
            }
          } catch (err) {
            console.warn("Failed to write recordings to dashboard state:", err);
          }
        } else {
          try {
            localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings));
          } catch (err) {
            console.warn("Failed to write recordings to localStorage:", err);
          }
        }
      };
      void persist();
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [recordings, root, loading]);

  const sortedRecordings = useMemo(
    () => [...recordings].sort((a, b) => b.createdAt - a.createdAt),
    [recordings],
  );

  const recUrlValid = !recUrl.trim() || parseFathomUrl(recUrl) !== null;

  const addRecording = () => {
    const parsed = parseFathomUrl(recUrl);
    if (!parsed) {
      setRecError("Paste a fathom.video share link.");
      return;
    }
    const title = recTitle.trim();
    if (!title) {
      setRecError("Add a title before saving.");
      return;
    }
    const description = recDescription.trim();
    const rec: FathomRecording = {
      id: uid(),
      url: parsed.url,
      title,
      description: description || undefined,
      createdAt: Date.now(),
    };
    setRecordings((prev) => [rec, ...prev]);
    setRecUrl("");
    setRecTitle("");
    setRecDescription("");
    setRecError(null);
  };

  const removeRecording = (id: string) => {
    const rec = recordings.find((r) => r.id === id);
    const label = rec?.title || "this recording";
    if (!window.confirm(`Delete "${label}"?`)) return;
    setRecordings((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRecordingTitle = (id: string, title: string) => {
    setRecordings((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  };

  const updateRecordingDescription = (id: string, description: string) => {
    setRecordings((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, description: description || undefined } : r,
      ),
    );
  };

  return (
    <div className="hml-content">
      <style>{recordingsPageCSS}</style>

      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace
          </div>
          <h1 className="hml-page-title">Fathom Recordings</h1>
          <div className="hml-page-subtitle">
            Saved share links from Fathom — paste the URL, give it a title, watch inline.
          </div>
        </div>
      </section>

      <div className="md-recordings-page">

      <div className="md-panel md-recordings-panel">
        <div className="md-panel-head">
          <span className="md-panel-title">▸ New Recording</span>
          <span className="md-panel-meta">{recordings.length} SAVED</span>
        </div>

        <div className="md-rec-form">
          <input
            className={`md-rec-input ${recUrl && !recUrlValid ? "is-invalid" : ""}`}
            type="url"
            placeholder="Paste fathom.video link…"
            value={recUrl}
            onChange={(e) => {
              setRecUrl(e.target.value);
              if (recError) setRecError(null);
            }}
          />
          <input
            className="md-rec-input"
            type="text"
            placeholder="Title"
            value={recTitle}
            onChange={(e) => {
              setRecTitle(e.target.value);
              if (recError) setRecError(null);
            }}
          />
          <textarea
            className="md-rec-description"
            placeholder="Description (optional)"
            value={recDescription}
            onChange={(e) => setRecDescription(e.target.value)}
            rows={2}
          />
          <div className="md-rec-form-actions">
            {recError ? <span className="md-rec-error">{recError}</span> : <span />}
            <button
              type="button"
              className="md-rec-add"
              onClick={addRecording}
              disabled={!recUrl.trim() || !recTitle.trim()}
            >
              Save recording
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="md-rec-empty">Loading…</div>
      ) : sortedRecordings.length === 0 ? (
        <div className="md-rec-empty">No recordings yet, Sir.</div>
      ) : (
        <ul className="md-rec-list">
          {sortedRecordings.map((r) => {
            const parsed = parseFathomUrl(r.url);
            return (
              <li key={r.id} className="md-rec-item md-panel">
                <div className="md-rec-embed">
                  {parsed ? (
                    <iframe
                      src={parsed.embedUrl}
                      title={r.title}
                      allow="autoplay; fullscreen; clipboard-write"
                      allowFullScreen
                    />
                  ) : (
                    <div className="md-rec-embed-fallback">
                      Invalid Fathom URL — open externally:{" "}
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                    </div>
                  )}
                </div>
                <div className="md-rec-body">
                  <input
                    className="md-rec-title-input"
                    type="text"
                    value={r.title}
                    onChange={(e) => updateRecordingTitle(r.id, e.target.value)}
                    placeholder="Title"
                  />
                  <textarea
                    className="md-rec-description-input"
                    value={r.description ?? ""}
                    onChange={(e) =>
                      updateRecordingDescription(r.id, e.target.value)
                    }
                    placeholder="Description (optional)"
                    rows={2}
                  />
                  <div className="md-rec-meta-row">
                    <a
                      className="md-rec-link"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Fathom ↗
                    </a>
                    <span className="md-panel-meta">{formatStamp(r.createdAt)}</span>
                    <button
                      type="button"
                      className="md-rec-delete"
                      onClick={() => removeRecording(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}

const recordingsPageCSS = `
.md-recordings-page {
  padding: 0;
  max-width: none;
}
.md-recordings-head {
  margin-bottom: 22px;
}
.md-recordings-head h1 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.md-recordings-panel {
  padding: 22px 26px 18px;
  margin-bottom: 22px;
}
.md-rec-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.md-rec-input {
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
.md-rec-input:focus {
  border-color: var(--copper);
}
.md-rec-input::placeholder {
  color: var(--text-faint);
}
.md-rec-input.is-invalid {
  border-color: #b85a3a;
}
.md-rec-description {
  width: 100%;
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  min-height: 56px;
  transition: border-color 120ms ease;
}
.md-rec-description:focus {
  border-color: var(--copper);
}
.md-rec-description::placeholder {
  color: var(--text-faint);
}
.md-rec-form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.md-rec-error {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #d07a55;
}
.md-rec-add {
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
.md-rec-add:hover:not(:disabled) {
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.md-rec-add:disabled {
  color: var(--text-faint);
  cursor: not-allowed;
  opacity: 0.6;
}
.md-rec-empty {
  padding: 60px 8px;
  text-align: center;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
  border: 1px solid var(--border);
  background: var(--bg-surface);
}
.md-rec-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.md-rec-item {
  display: grid;
  grid-template-columns: minmax(280px, 420px) 1fr;
  gap: 18px;
  padding: 14px;
}
.md-rec-embed {
  position: relative;
  width: 100%;
  padding-top: 56.25%;
  background: #000;
  border: 1px solid var(--border);
  overflow: hidden;
}
.md-rec-embed iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.md-rec-embed-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  text-align: center;
  font-family: var(--sans);
  font-size: 12px;
  color: var(--text-muted);
}
.md-rec-embed-fallback a {
  color: var(--copper);
  margin-left: 6px;
  word-break: break-all;
}
.md-rec-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.md-rec-title-input {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  padding: 4px 6px;
  margin: -4px -6px;
  outline: none;
  transition: border-color 120ms ease, background 120ms ease;
}
.md-rec-title-input:hover {
  border-color: var(--border);
}
.md-rec-title-input:focus {
  border-color: var(--copper);
  background: var(--bg-void);
}
.md-rec-description-input {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.55;
  padding: 6px;
  margin: -6px;
  resize: vertical;
  outline: none;
  min-height: 42px;
  transition: border-color 120ms ease, background 120ms ease;
}
.md-rec-description-input:hover {
  border-color: var(--border);
}
.md-rec-description-input:focus {
  border-color: var(--copper);
  background: var(--bg-void);
  color: var(--text);
}
.md-rec-description-input::placeholder {
  color: var(--text-faint);
}
.md-rec-meta-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.md-rec-link {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--copper);
  text-decoration: none;
  margin-right: auto;
}
.md-rec-link:hover {
  text-decoration: underline;
}
.md-rec-delete {
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
.md-rec-delete:hover {
  border-color: var(--copper);
  color: var(--copper);
}

@media (max-width: 860px) {
  .md-rec-item {
    grid-template-columns: 1fr;
  }
}
`;
