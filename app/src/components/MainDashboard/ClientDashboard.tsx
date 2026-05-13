/**
 * ClientDashboard — per-client surface with sub-nav (Profile/Memory/Drive/
 * Media Buying/Website).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientEntry, DashboardState, FathomRecording, VaultNote } from "../../lib/types";
import type { ClientSection } from "../../lib/navigation";
import type { FormSurfaceId } from "../../lib/formConfigs";
import { api } from "../../lib/tauri";
import { parseDriveFolders, type DriveFolder } from "../../lib/driveIndex";
import { ClientMediaBuying } from "./ClientMediaBuying";
import { WebDesignerPage } from "./WebDesignerPage";
import { recordingsPageCSS } from "./RecordingsPage";
import {
  IconBarChart,
  IconFolder,
  IconGlobe,
  IconMore,
  IconPen,
  IconRecordings,
  IconUser,
} from "../icons";

interface ClientDashboardProps {
  client: ClientEntry;
  section: ClientSection;
  root: string | null;
  onSelectSection: (section: ClientSection) => void;
  onOpenForm: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
  onOpenDrive?: () => void;
}

const TABS: ReadonlyArray<{
  id: ClientSection;
  label: string;
  Icon: typeof IconUser;
}> = [
  { id: "profile", label: "Profile", Icon: IconUser },
  { id: "memory", label: "Memory", Icon: IconPen },
  { id: "drive", label: "Drive", Icon: IconFolder },
  { id: "media-buying", label: "Media Buying", Icon: IconBarChart },
  { id: "website", label: "Website", Icon: IconGlobe },
  { id: "recordings", label: "Recordings", Icon: IconRecordings },
];

function clientPill(status: ClientEntry["status"]) {
  switch (status) {
    case "live":
      return { className: "hml-green", label: "Live" };
    case "pre-launch":
      return { className: "hml-amber", label: "Pre-launch" };
    case "paused":
      return { className: "hml-neutral", label: "Paused" };
  }
}

function avatarChar(name: string): string {
  return name?.charAt(0)?.toUpperCase() ?? "•";
}

export function ClientDashboard({
  client,
  section,
  root,
  onSelectSection,
  onOpenForm,
  onOpenDrive,
}: ClientDashboardProps) {
  const pill = clientPill(client.status);

  return (
    <div className="hml-content">
      <section className="hml-client-header">
        <div className="hml-client-header-top">
          <div className="hml-client-avatar">{avatarChar(client.name)}</div>
          <div className="hml-client-name-block">
            <h1 className="hml-client-name">{client.name}</h1>
            <span className={`hml-pill ${pill.className}`}>
              <span className="hml-pill-dot" />
              {pill.label}
            </span>
          </div>
          <div className="hml-client-actions">
            {client.drive_folder_url && onOpenDrive && (
              <button type="button" className="hml-btn" onClick={onOpenDrive}>
                <IconFolder size={13} />
                Open Drive
              </button>
            )}
            <button type="button" className="hml-icon-btn" aria-label="More">
              <IconMore size={14} />
            </button>
          </div>
        </div>
        <div className="hml-client-meta-row">
          {client.created_at && (
            <>
              <div className="hml-item">
                <span className="hml-label">Started</span>
                <span className="hml-v">
                  {new Date(client.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <span className="hml-sep">·</span>
            </>
          )}
          <div className="hml-item">
            <span className="hml-label">Slug</span>
            <span className="hml-v">{client.slug}</span>
          </div>
          {client.benchmarks && (
            <>
              <span className="hml-sep">·</span>
              <div className="hml-item">
                <span className="hml-label">Benchmarks</span>
                <span className="hml-v">{client.benchmarks}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <nav className="hml-subnav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`hml-subnav-item${section === id ? " hml-active" : ""}`}
            onClick={() => onSelectSection(id)}
          >
            <Icon className="hml-nav-icon" />
            {label}
          </button>
        ))}
      </nav>

      <div>
        {section === "profile" && (
          <ClientNoteView root={root} clientSlug={client.slug} match="profile" emptyLabel="No Profile.md found yet." />
        )}
        {section === "memory" && (
          <ClientNoteView root={root} clientSlug={client.slug} match="memory" emptyLabel="No Memory.md found yet." />
        )}
        {section === "drive" && (
          <ClientDriveView root={root} clientSlug={client.slug} driveUrl={client.drive_folder_url ?? null} />
        )}
        {section === "media-buying" && (
          <ClientMediaBuying
            clientName={client.name}
            onOpenForm={(id) => onOpenForm(id, client.slug, client.name)}
          />
        )}
        {section === "website" && (
          <WebDesignerPage
            root={root}
            clientSlug={client.slug}
            clientName={client.name}
          />
        )}
        {section === "recordings" && (
          <ClientRecordingsView root={root} clientSlug={client.slug} clientName={client.name} />
        )}
      </div>
    </div>
  );
}

/** Lightweight vault-note display for the Profile/Memory tabs. Renders
 *  pre-wrapped markdown for now — a richer renderer can replace this. */
function ClientNoteView({
  root,
  clientSlug,
  match,
  emptyLabel,
}: {
  root: string | null;
  clientSlug: string;
  match: "profile" | "memory";
  emptyLabel: string;
}) {
  const [notes, setNotes] = useState<VaultNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotes(null);
    setError(null);
    api
      .readClientNotes(root, clientSlug)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (notes === null) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading…</div></div>;
  }

  const note = notes.find((n) => {
    const lower = n.path.toLowerCase();
    return lower.endsWith(`/${match}.md`) || lower.endsWith(`\\${match}.md`);
  });

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load notes</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">{emptyLabel}</div>
        <div className="hml-empty-sub">
          Create it at vault/Clients/{clientSlug}/{match.charAt(0).toUpperCase() + match.slice(1)}.md.
        </div>
      </div>
    );
  }

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          {match === "profile" ? "Profile" : "Memory"}
        </div>
        <span className="hml-panel-action">
          {note.path.split(/[/\\]/).slice(-3).join(" / ")}
        </span>
      </div>
      <pre
        style={{
          padding: "18px 22px",
          margin: 0,
          fontFamily: "var(--hml-font-sans)",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--hml-text-secondary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {note.body}
      </pre>
    </div>
  );
}

const CLIENT_RECORDINGS_KEY_PREFIX = "hml.recordings.client.";
const FATHOM_SHARE_RE_CLIENT =
  /^https?:\/\/(?:[\w-]+\.)?fathom\.video\/(?:share|calls)\/([\w-]+)/i;

function recUid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseFathomUrl(input: string): { url: string; embedUrl: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(FATHOM_SHARE_RE_CLIENT);
  if (!match) return null;
  return { url: trimmed, embedUrl: `https://fathom.video/share/${match[1]}` };
}

function formatRecStamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`.toUpperCase();
}

function ClientRecordingsView({
  root,
  clientSlug,
  clientName,
}: {
  root: string | null;
  clientSlug: string;
  clientName: string;
}) {
  const [recordings, setRecordings] = useState<FathomRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);
  const saveTimer = useRef<number | null>(null);

  const [recUrl, setRecUrl] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recError, setRecError] = useState<string | null>(null);

  const lsKey = `${CLIENT_RECORDINGS_KEY_PREFIX}${clientSlug}`;

  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoading(true);

    const run = async () => {
      if (root) {
        try {
          const state = await api.readDashboardState(root);
          if (cancelled) return;
          const all = Array.isArray(state.recordings) ? state.recordings : [];
          setRecordings(all.filter((r) => r.clientSlug === clientSlug));
        } catch (err) {
          console.warn("Failed to read dashboard state for client recordings:", err);
          if (!cancelled) {
            try {
              const raw = localStorage.getItem(lsKey);
              setRecordings(raw ? JSON.parse(raw) : []);
            } catch {
              setRecordings([]);
            }
          }
        }
      } else {
        try {
          const raw = localStorage.getItem(lsKey);
          if (!cancelled) setRecordings(raw ? JSON.parse(raw) : []);
        } catch {
          if (!cancelled) setRecordings([]);
        }
      }
      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug, lsKey]);

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
            const others = (current.recordings ?? []).filter(
              (r) => r.clientSlug !== clientSlug,
            );
            const next: DashboardState = {
              tasks: Array.isArray(current.tasks) ? current.tasks : [],
              notes: Array.isArray(current.notes) ? current.notes : [],
              calendar: current.calendar ?? null,
              recordings: [...others, ...recordings],
            };
            await api.writeDashboardState(root, next);
          } catch (err) {
            console.warn("Failed to write client recordings:", err);
          }
        } else {
          try {
            localStorage.setItem(lsKey, JSON.stringify(recordings));
          } catch (err) {
            console.warn("Failed to write client recordings to localStorage:", err);
          }
        }
      };
      void persist();
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [recordings, root, loading, clientSlug, lsKey]);

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
      id: recUid(),
      url: parsed.url,
      title,
      description: description || undefined,
      createdAt: Date.now(),
      clientSlug,
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
    <div className="md-recordings-page">
      <style>{recordingsPageCSS}</style>

      <div className="md-panel md-recordings-panel">
        <div className="md-panel-head">
          <span className="md-panel-title">▸ New Recording — {clientName}</span>
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
        <div className="md-rec-empty">No recordings for {clientName} yet, Sir.</div>
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
                    <span className="md-panel-meta">{formatRecStamp(r.createdAt)}</span>
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
  );
}

function ClientDriveView({
  root,
  clientSlug,
  driveUrl,
}: {
  root: string | null;
  clientSlug: string;
  driveUrl: string | null;
}) {
  const [folders, setFolders] = useState<DriveFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    setFolders(null);
    setError(null);
    api
      .readDriveIndex(root, clientSlug)
      .then((idx) => {
        if (cancelled) return;
        if (!idx) {
          setFolders([]);
          return;
        }
        setFolders(parseDriveFolders(idx.body));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (folders === null) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading Drive index…</div></div>;
  }

  if (!driveUrl && (!folders || folders.length === 0)) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">No Drive folder linked</div>
        <div className="hml-empty-sub">
          Link a Drive folder from Settings, then refresh the index here.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load Drive index</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
          Drive folders
        </div>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noreferrer"
            className="hml-panel-action"
          >
            Open root ↗
          </a>
        )}
      </div>
      <div className="hml-panel-body">
        {folders.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-sub">
              No folders indexed yet. Run the Drive index refresh from Settings.
            </div>
          </div>
        ) : (
          folders.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="hml-activity"
              style={{ textDecoration: "none" }}
            >
              <div className="hml-activity-icon hml-blue">
                <IconFolder size={13} />
              </div>
              <div className="hml-activity-body">
                <div className="hml-activity-title">
                  <span className="hml-em">{f.name}</span>
                </div>
                <div className="hml-activity-meta">
                  <span>{f.url.replace(/^https?:\/\/(www\.)?drive\.google\.com/, "drive.google.com")}</span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
