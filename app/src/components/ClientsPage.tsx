import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { openInAppWindow } from "../lib/openInApp";
import type { BenchmarkSummary, ClientEntry } from "../lib/types";
import { ClientProfileForm } from "./ClientProfileForm";

type Props = {
  root: string;
  clients: ClientEntry[];
  activeSlug: string | null;
  onClose: () => void;
  onClientsChanged: (next: ClientEntry[]) => void;
  onSelectClient: (slug: string) => void;
  /** Open the inline add-form on mount (when "Add client…" was clicked from the pill). */
  startInAddMode?: boolean;
};

export function ClientsPage({
  root,
  clients,
  activeSlug,
  onClose,
  onClientsChanged,
  onSelectClient,
  startInAddMode,
}: Props) {
  const [adding, setAdding] = useState(Boolean(startInAddMode));
  const [newName, setNewName] = useState("");
  const [newDriveUrl, setNewDriveUrl] = useState("");
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingDriveSlug, setEditingDriveSlug] = useState<string | null>(null);
  const [driveDraft, setDriveDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [benchmarkSets, setBenchmarkSets] = useState<BenchmarkSummary[]>([]);
  const [profileFor, setProfileFor] = useState<
    { client: ClientEntry; mode: "new" | "edit" } | null
  >(null);
  const newInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding) {
      newInputRef.current?.focus();
    }
  }, [adding]);

  useEffect(() => {
    let cancelled = false;
    api
      .listBenchmarkSets(root)
      .then((sets) => {
        if (!cancelled) setBenchmarkSets(sets);
      })
      .catch(() => {
        if (!cancelled) setBenchmarkSets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  const refresh = async () => {
    try {
      const next = await api.listClients(root);
      onClientsChanged(next);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) {
      setError("Enter a client name.");
      return;
    }
    const driveUrl = newDriveUrl.trim();
    setBusy(true);
    setError(null);
    try {
      // Pass an empty slug so the backend slugifies + de-collides.
      const created = await api.addClient(root, "", name, driveUrl || null);
      setNewName("");
      setNewDriveUrl("");
      setAdding(false);
      await refresh();
      // Immediately open the structured Profile form for the new client.
      setProfileFor({ client: created, mode: "new" });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDrive = async (slug: string) => {
    setBusy(true);
    setError(null);
    try {
      const trimmed = driveDraft.trim();
      await api.setClientDriveFolder(root, slug, trimmed || null);
      setEditingDriveSlug(null);
      setDriveDraft("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (slug: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setError("Name can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.renameClient(root, slug, trimmed);
      setRenamingSlug(null);
      setRenameValue("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleBenchmarksChange = async (slug: string, raw: string) => {
    setBusy(true);
    setError(null);
    try {
      const filename = raw === "" ? null : raw;
      await api.setClientBenchmarks(root, slug, filename);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (slug: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteClient(root, slug);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (profileFor) {
    return (
      <ClientProfileForm
        root={root}
        client={profileFor.client}
        mode={profileFor.mode}
        onClose={() => setProfileFor(null)}
        onSaved={async () => {
          const saved = profileFor;
          setProfileFor(null);
          await refresh();
          if (saved.mode === "new") {
            onSelectClient(saved.client.slug);
          }
        }}
      />
    );
  }

  return (
    <div className="md-root hml-app">
      <style>{clientsCSS}</style>
      <main className="hml-main hml-main-standalone">
        <header className="hml-topbar">
          <div className="hml-breadcrumb">
            <span className="hml-seg">Workspace</span>
            <span className="hml-sep">/</span>
            <span className="hml-current">Manage clients</span>
          </div>
          <div className="hml-topbar-right">
            <button
              type="button"
              className="hml-btn hml-ghost"
              onClick={onClose}
            >
              ← Back
            </button>
          </div>
        </header>

        <div className="hml-content">
          <section className="hml-page-header">
            <div>
              <div className="hml-page-eyebrow">
                <span className="hml-eyebrow-dot" />
                Client registry
              </div>
              <h1 className="hml-page-title">Manage clients</h1>
              <div className="hml-page-subtitle">
                Each client gets its own <code>data/&lt;slug&gt;/</code> folder.
                Switch the active client from the status bar pill.
              </div>
            </div>
            {!adding && (
              <div className="hml-page-header-actions">
                <button
                  type="button"
                  className="hml-btn hml-accent"
                  onClick={() => setAdding(true)}
                >
                  + Add client
                </button>
              </div>
            )}
          </section>

          {error && <div className="hml-error-banner">{error}</div>}

          {adding && (
            <section className="hml-panel cp-add-panel">
              <div className="hml-panel-header">
                <div className="hml-panel-title">
                  <span className="hml-dot" />
                  New client
                </div>
              </div>
              <div className="hml-panel-body cp-add-body">
                <div className="hml-form-field">
                  <label className="hml-form-label">Name</label>
                  <input
                    ref={newInputRef}
                    className="hml-form-input"
                    placeholder="Client name (e.g. Bright Smile Dental)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                      if (e.key === "Escape") {
                        setAdding(false);
                        setNewName("");
                        setNewDriveUrl("");
                        setError(null);
                      }
                    }}
                    disabled={busy}
                  />
                </div>
                <div className="hml-form-field">
                  <label className="hml-form-label">Drive folder (optional)</label>
                  <input
                    className="hml-form-input"
                    placeholder="Google Drive folder URL"
                    value={newDriveUrl}
                    onChange={(e) => setNewDriveUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                      if (e.key === "Escape") {
                        setAdding(false);
                        setNewName("");
                        setNewDriveUrl("");
                        setError(null);
                      }
                    }}
                    disabled={busy}
                  />
                </div>
                <div className="cp-add-actions">
                  <button
                    type="button"
                    className="hml-btn hml-accent"
                    onClick={handleAdd}
                    disabled={busy || !newName.trim()}
                  >
                    {busy ? "Adding…" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="hml-btn hml-ghost"
                    onClick={() => {
                      setAdding(false);
                      setNewName("");
                      setNewDriveUrl("");
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          )}

          <ul className="cp-list">
            {clients.map((c) => {
              const isActive = c.slug === activeSlug;
              const renaming = renamingSlug === c.slug;
              return (
                <li
                  key={c.slug}
                  className={`hml-panel cp-row${isActive ? " cp-active" : ""}`}
                >
                  <div className="cp-row-main">
                    <div className="cp-row-head">
                      {renaming ? (
                        <input
                          autoFocus
                          className="hml-form-input cp-rename-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(c.slug);
                            if (e.key === "Escape") {
                              setRenamingSlug(null);
                              setRenameValue("");
                            }
                          }}
                          disabled={busy}
                        />
                      ) : (
                        <div className="cp-row-name">
                          {c.name}
                          {isActive && (
                            <span className="cp-active-tag">ACTIVE</span>
                          )}
                        </div>
                      )}
                      <code className="cp-row-slug">data/{c.slug}/</code>
                    </div>

                    <div className="cp-row-fields">
                      <div className="cp-field">
                        <label className="hml-form-label">Benchmarks</label>
                        <select
                          className="hml-form-select"
                          value={c.benchmarks ?? ""}
                          onChange={(e) =>
                            handleBenchmarksChange(c.slug, e.target.value)
                          }
                          disabled={busy}
                        >
                          <option value="">— none (use defaults) —</option>
                          {benchmarkSets.map((b) => (
                            <option key={b.filename} value={b.filename}>
                              {b.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="cp-field">
                        <label className="hml-form-label">Drive folder</label>
                        {editingDriveSlug === c.slug ? (
                          <div className="cp-drive-edit">
                            <input
                              autoFocus
                              className="hml-form-input"
                              placeholder="Google Drive folder URL"
                              value={driveDraft}
                              onChange={(e) => setDriveDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleSaveDrive(c.slug);
                                if (e.key === "Escape") {
                                  setEditingDriveSlug(null);
                                  setDriveDraft("");
                                }
                              }}
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className="hml-btn hml-accent"
                              onClick={() => handleSaveDrive(c.slug)}
                              disabled={busy}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="hml-btn hml-ghost"
                              onClick={() => {
                                setEditingDriveSlug(null);
                                setDriveDraft("");
                              }}
                              disabled={busy}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : c.drive_folder_url ? (
                          <div className="cp-drive-row">
                            <a
                              className="cp-drive-link"
                              href={c.drive_folder_url}
                              target="_blank"
                              rel="noreferrer"
                              title={c.drive_folder_url}
                              onClick={(e) => {
                                e.preventDefault();
                                if (c.drive_folder_url) {
                                  openInAppWindow(c.drive_folder_url, `${c.name} — Drive`);
                                }
                              }}
                            >
                              Open Drive ↗
                            </a>
                            <button
                              type="button"
                              className="hml-btn hml-ghost"
                              onClick={() => {
                                setEditingDriveSlug(c.slug);
                                setDriveDraft(c.drive_folder_url ?? "");
                                setError(null);
                              }}
                              disabled={busy}
                            >
                              Edit
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="hml-btn"
                            onClick={() => {
                              setEditingDriveSlug(c.slug);
                              setDriveDraft("");
                              setError(null);
                            }}
                            disabled={busy}
                          >
                            + Add Drive folder
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="cp-row-actions">
                    {renaming ? (
                      <>
                        <button
                          type="button"
                          className="hml-btn hml-accent"
                          onClick={() => handleRename(c.slug)}
                          disabled={busy}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="hml-btn hml-ghost"
                          onClick={() => {
                            setRenamingSlug(null);
                            setRenameValue("");
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {!isActive && (
                          <button
                            type="button"
                            className="hml-btn"
                            onClick={() => onSelectClient(c.slug)}
                            disabled={busy}
                          >
                            Switch to
                          </button>
                        )}
                        <button
                          type="button"
                          className="hml-btn hml-ghost"
                          onClick={() => {
                            setRenamingSlug(c.slug);
                            setRenameValue(c.name);
                            setError(null);
                          }}
                          disabled={busy}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="hml-btn hml-ghost"
                          onClick={() => {
                            setProfileFor({ client: c, mode: "edit" });
                            setError(null);
                          }}
                          disabled={busy}
                        >
                          Edit profile
                        </button>
                        <button
                          type="button"
                          className="hml-btn hml-danger"
                          onClick={() => handleDelete(c.slug)}
                          disabled={busy || clients.length <= 1}
                          title={
                            clients.length <= 1
                              ? "Can't delete the only client."
                              : "Delete (only works if data/<slug>/ is empty)"
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}

const clientsCSS = `
.cp-add-panel { margin-bottom: 22px; }
.cp-add-body { padding: 16px 18px; }

.cp-add-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--hml-border-subtle);
}

.cp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  padding: 16px 18px;
  align-items: flex-start;
}

.cp-row.cp-active {
  border-color: var(--hml-accent-border);
  background:
    linear-gradient(180deg, var(--hml-accent-dim) 0%, var(--hml-bg-elev-1) 60%);
}

.cp-row-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.cp-row-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.01em;
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.cp-active-tag {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.10em;
  color: var(--hml-accent);
  padding: 3px 6px;
  border: 1px solid var(--hml-accent-border);
  background: var(--hml-accent-dim);
  border-radius: 4px;
}

.cp-row-slug {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 4px;
  padding: 2px 7px;
}

.cp-row-fields {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: 16px;
}

.cp-field {
  display: flex;
  flex-direction: column;
}

.cp-drive-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cp-drive-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cp-drive-link {
  font-size: 12.5px;
  color: var(--hml-accent);
  text-decoration: none;
  border-bottom: 1px dashed var(--hml-accent-border);
  padding-bottom: 1px;
}
.cp-drive-link:hover {
  color: var(--hml-accent-bright);
  border-color: var(--hml-accent);
}

.cp-rename-input { font-weight: 500; }

.cp-row-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  min-width: 120px;
}

@media (max-width: 800px) {
  .cp-row { grid-template-columns: 1fr; }
  .cp-row-actions { flex-direction: row; flex-wrap: wrap; }
  .cp-row-fields { grid-template-columns: 1fr; }
}
`;
