import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { BenchmarkSummary, ClientEntry } from "../lib/types";

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
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [benchmarkSets, setBenchmarkSets] = useState<BenchmarkSummary[]>([]);
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
    setBusy(true);
    setError(null);
    try {
      // Pass an empty slug so the backend slugifies + de-collides.
      await api.addClient(root, "", name);
      setNewName("");
      setAdding(false);
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

  return (
    <main className="main" style={{ position: "relative" }}>
      <section className="clients-page reveal reveal-1">
        <header className="clients-page-head">
          <div>
            <div className="clients-page-eye">CLIENT REGISTRY</div>
            <h1 className="clients-page-title">Manage clients</h1>
            <p className="clients-page-sub">
              Each client gets its own <code>data/&lt;slug&gt;/</code> folder. Switch the active
              client from the status bar pill.
            </p>
          </div>
          <button className="panel-edit" onClick={onClose}>
            ← BACK
          </button>
        </header>

        {error && <div className="clients-page-err">{error}</div>}

        <div className="clients-page-toolbar">
          {!adding ? (
            <button className="action primary" onClick={() => setAdding(true)}>
              + Add client
            </button>
          ) : (
            <div className="clients-add-row">
              <input
                ref={newInputRef}
                className="kpi-form-input"
                placeholder="Client name (e.g. Bright Smile Dental)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                    setError(null);
                  }
                }}
                disabled={busy}
              />
              <button
                className="kpi-form-btn primary"
                onClick={handleAdd}
                disabled={busy || !newName.trim()}
              >
                {busy ? "Adding…" : "Create"}
              </button>
              <button
                className="kpi-form-btn"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <ul className="clients-list">
          {clients.map((c) => {
            const isActive = c.slug === activeSlug;
            const renaming = renamingSlug === c.slug;
            return (
              <li key={c.slug} className={`clients-row${isActive ? " active" : ""}`}>
                <div className="clients-row-main">
                  {renaming ? (
                    <input
                      autoFocus
                      className="kpi-form-input"
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
                    <div className="clients-row-name">
                      {c.name}
                      {isActive && <span className="clients-row-tag">ACTIVE</span>}
                    </div>
                  )}
                  <div className="clients-row-slug">data/{c.slug}/</div>
                  <div className="clients-row-bench">
                    <label className="clients-row-bench-label">BENCHMARKS</label>
                    <select
                      className="clients-row-bench-select"
                      value={c.benchmarks ?? ""}
                      onChange={(e) => handleBenchmarksChange(c.slug, e.target.value)}
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
                </div>
                <div className="clients-row-actions">
                  {renaming ? (
                    <>
                      <button
                        className="kpi-form-btn primary"
                        onClick={() => handleRename(c.slug)}
                        disabled={busy}
                      >
                        Save
                      </button>
                      <button
                        className="kpi-form-btn"
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
                          className="kpi-form-btn"
                          onClick={() => onSelectClient(c.slug)}
                          disabled={busy}
                        >
                          Switch to
                        </button>
                      )}
                      <button
                        className="kpi-form-btn"
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
                        className="kpi-form-btn danger"
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
      </section>
    </main>
  );
}
