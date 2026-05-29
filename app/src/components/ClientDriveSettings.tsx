import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/tauri";
import type {
  ClientEntry,
  DocFolderDefaults,
  DocFolderTarget,
  DocKind,
  DriveSubfolder,
  SequenceFolderDefaults,
} from "../lib/types";
import { IconFolder } from "./icons";

interface Props {
  client: ClientEntry;
  root: string | null;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; folders: DriveSubfolder[] }
  | { kind: "error"; message: string };

const DOC_KINDS: DocKind[] = ["ad-copy", "brief", "notes", "report", "other"];
const DOC_KIND_LABEL: Record<DocKind, string> = {
  "ad-copy": "Ad Copy",
  brief: "Brief",
  notes: "Notes",
  report: "Report",
  other: "Other",
};

type SequenceStepId =
  | "audience-research"
  | "creative-brief"
  | "ad-copy"
  | "ad-creative"
  | "structure";
const SEQUENCE_STEPS: { id: SequenceStepId; label: string }[] = [
  { id: "audience-research", label: "Audience research" },
  { id: "creative-brief", label: "Creative brief" },
  { id: "ad-copy", label: "Ad copy" },
  { id: "ad-creative", label: "Ad creative" },
  { id: "structure", label: "Campaign structure" },
];

/** Per-client Drive folder editor. Reads the agency Drive folder from
 *  AppConfig, lists its immediate subfolders, and lets the operator pick one
 *  for this client. After a change it auto-refreshes the drive index and
 *  surfaces the default-folder picker for docs + sequence steps. */
export function ClientDriveSettings({ client, root }: Props) {
  const [agencyUrl, setAgencyUrl] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [currentUrl, setCurrentUrl] = useState<string | null>(
    client.drive_folder_url ?? null,
  );
  const [pasteDraft, setPasteDraft] = useState<string>(client.drive_folder_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sub-state for the per-client default-folder picker (docs + sequence).
  const [clientSubfolders, setClientSubfolders] = useState<DriveSubfolder[] | null>(null);
  const [clientSubLoad, setClientSubLoad] = useState<LoadState>({ kind: "idle" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [docDefaults, setDocDefaults] = useState<DocFolderDefaults>(
    client.doc_folder_defaults ?? {},
  );
  const [sequenceDefaults, setSequenceDefaults] = useState<SequenceFolderDefaults>(
    client.sequence_folder_defaults ?? {},
  );
  const [defaultsBusyKey, setDefaultsBusyKey] = useState<string | null>(null);

  // Resync when the parent swaps clients.
  useEffect(() => {
    setCurrentUrl(client.drive_folder_url ?? null);
    setPasteDraft(client.drive_folder_url ?? "");
    setError(null);
    setSavedAt(null);
    setRefreshMsg(null);
    setDocDefaults(client.doc_folder_defaults ?? {});
    setSequenceDefaults(client.sequence_folder_defaults ?? {});
  }, [
    client.slug,
    client.drive_folder_url,
    client.doc_folder_defaults,
    client.sequence_folder_defaults,
  ]);

  const loadFolders = useCallback(async (url: string) => {
    setLoad({ kind: "loading" });
    try {
      const folders = await api.listDriveSubfolders(url);
      setLoad({ kind: "ready", folders });
    } catch (e) {
      setLoad({ kind: "error", message: String(e) });
    }
  }, []);

  const loadClientSubfolders = useCallback(async (url: string) => {
    setClientSubLoad({ kind: "loading" });
    try {
      const folders = await api.listDriveSubfolders(url);
      setClientSubfolders(folders);
      setClientSubLoad({ kind: "ready", folders });
    } catch (e) {
      setClientSubLoad({ kind: "error", message: String(e) });
      setClientSubfolders(null);
    }
  }, []);

  // Load agency dropdown + (when client has a folder) the client subfolders.
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.loadConfig();
        const url = cfg.agency_drive_folder_url ?? null;
        setAgencyUrl(url);
        if (url) await loadFolders(url);
        else setLoad({ kind: "idle" });
      } catch (e) {
        setLoad({ kind: "error", message: String(e) });
      }
    })();
  }, [loadFolders]);

  useEffect(() => {
    if (currentUrl) void loadClientSubfolders(currentUrl);
    else {
      setClientSubfolders(null);
      setClientSubLoad({ kind: "idle" });
    }
  }, [currentUrl, loadClientSubfolders]);

  // After persisting a new Drive folder, auto-refresh the local drive index
  // (the JSON tree consumed by the client's Drive tab) so it doesn't show
  // stale subfolders from the old URL.
  const autoRefreshIndex = async () => {
    if (!root) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await api.refreshDriveIndex(root, client.slug);
      setRefreshMsg("Drive index refreshed. The Drive tab will show this folder's contents now.");
    } catch (e) {
      setRefreshMsg(`Refresh failed: ${String(e)}`);
    } finally {
      setRefreshing(false);
    }
  };

  const persist = async (url: string | null, opts: { autoRefresh?: boolean } = {}) => {
    if (!root) {
      setError("Pick a media-buying folder first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setClientDriveFolder(root, client.slug, url);
      setCurrentUrl(url);
      setPasteDraft(url ?? "");
      setSavedAt(Date.now());
      if (opts.autoRefresh && url) {
        // Clear stale defaults — they pointed at folders inside the old root.
        setDocDefaults({});
        setSequenceDefaults({});
        // Kick off the refresh + reload subfolders for the picker UI.
        await Promise.all([autoRefreshIndex(), loadClientSubfolders(url)]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePickFolder = async (folder: DriveSubfolder) => {
    await persist(folder.webViewLink, { autoRefresh: true });
  };

  const handleClear = () => {
    if (!currentUrl) return;
    void persist(null);
  };

  const handleOpenCurrent = async () => {
    if (!currentUrl) return;
    try {
      await openUrl(currentUrl);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSavePaste = () => {
    const trimmed = pasteDraft.trim();
    const changed = trimmed !== (currentUrl ?? "").trim();
    void persist(trimmed || null, { autoRefresh: changed && Boolean(trimmed) });
  };

  const handleRefresh = () => {
    if (agencyUrl) void loadFolders(agencyUrl);
  };

  const handleManualReindex = () => {
    if (currentUrl) void autoRefreshIndex();
  };

  const handleDocDefaultChange = async (kind: DocKind, folder: DriveSubfolder | null) => {
    if (!root) return;
    const key = `doc:${kind}`;
    setDefaultsBusyKey(key);
    try {
      const target: DocFolderTarget | null = folder
        ? { id: folder.id, name: folder.name }
        : null;
      await api.setClientDocFolderDefault(root, client.slug, kind, target);
      setDocDefaults((prev) => {
        const next = { ...prev };
        if (target) next[kind] = target;
        else delete next[kind];
        return next;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setDefaultsBusyKey(null);
    }
  };

  const handleSequenceDefaultChange = async (
    stepId: SequenceStepId,
    folder: DriveSubfolder | null,
  ) => {
    if (!root) return;
    const key = `seq:${stepId}`;
    setDefaultsBusyKey(key);
    try {
      const target: DocFolderTarget | null = folder
        ? { id: folder.id, name: folder.name }
        : null;
      await api.setClientSequenceFolderDefault(root, client.slug, stepId, target);
      setSequenceDefaults((prev) => {
        const next = { ...prev };
        if (target) next[stepId] = target;
        else delete next[stepId];
        return next;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setDefaultsBusyKey(null);
    }
  };

  const currentFolderId = currentUrl ? extractFolderId(currentUrl) : null;
  const showDefaultsBlock = Boolean(currentUrl);

  return (
    <section className="hml-panel cds-panel">
      <style>{driveSettingsCSS}</style>
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
          Google Drive folder
        </div>
        <span className="hml-panel-action">
          Where {client.name}'s docs, briefs, and reports get saved
        </span>
      </div>

      <div className="hml-panel-body cds-body">
        {currentUrl ? (
          <div className="cds-current">
            <IconFolder size={14} />
            <a
              className="cds-current-link"
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void handleOpenCurrent();
              }}
              title={currentUrl}
            >
              {currentUrl}
            </a>
          </div>
        ) : (
          <p className="cds-empty">No Drive folder linked yet.</p>
        )}

        {!agencyUrl && (
          <div className="cds-banner">
            <strong>Set your Agency Drive folder first.</strong> Open{" "}
            <em>main Settings → Agency Drive folder</em> and paste the URL of
            your top-level Drive folder. After that, every client gets a
            one-click dropdown of the subfolders inside it.
          </div>
        )}

        {agencyUrl && load.kind === "loading" && (
          <div className="cds-loading">
            <span className="cds-spinner" /> Loading subfolders from your agency
            Drive…
          </div>
        )}

        {agencyUrl && load.kind === "error" && (
          <div className="cds-error">⚠ {load.message}</div>
        )}

        {agencyUrl && load.kind === "ready" && load.folders.length === 0 && (
          <div className="cds-banner">
            Your agency folder is empty (no subfolders found). Add a subfolder
            for this client in Drive, then hit Refresh.
          </div>
        )}

        {agencyUrl && load.kind === "ready" && load.folders.length > 0 && (
          <div className="cds-picker">
            <div className="cds-picker-head">
              <span>
                Pick a subfolder from your agency Drive ({load.folders.length}{" "}
                folders)
              </span>
              <button
                type="button"
                className="cds-link-btn"
                onClick={handleRefresh}
                disabled={saving || load.kind !== "ready"}
              >
                ↻ Refresh
              </button>
            </div>
            <ul className="cds-folder-list">
              {load.folders.map((f) => {
                const isCurrent = currentFolderId === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={`cds-folder-row${isCurrent ? " is-current" : ""}`}
                      onClick={() => void handlePickFolder(f)}
                      disabled={saving || isCurrent}
                      title={f.webViewLink}
                    >
                      <span className="cds-folder-icon">📁</span>
                      <span className="cds-folder-name">{f.name}</span>
                      {isCurrent ? (
                        <span className="cds-folder-tag is-current-tag">
                          ✓ Linked
                        </span>
                      ) : (
                        <span className="cds-folder-tag">Use this →</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {refreshing && (
          <div className="cds-loading">
            <span className="cds-spinner" /> Indexing the new Drive folder…
          </div>
        )}
        {refreshMsg && !refreshing && (
          <div
            className={
              refreshMsg.startsWith("Refresh failed") ? "cds-error" : "cds-saved"
            }
          >
            {refreshMsg.startsWith("Refresh failed") ? "⚠ " : "✓ "}
            {refreshMsg}
          </div>
        )}

        {currentUrl && (
          <div className="cds-actions">
            <button
              type="button"
              className="hml-btn hml-ghost"
              onClick={handleClear}
              disabled={saving}
              title="Unlink this client's Drive folder"
            >
              Clear link
            </button>
            <button
              type="button"
              className="hml-btn"
              onClick={() => void handleOpenCurrent()}
              disabled={saving}
            >
              Open in Drive ↗
            </button>
            <button
              type="button"
              className="hml-btn"
              onClick={handleManualReindex}
              disabled={saving || refreshing}
              title="Re-read the folder tree so the Drive tab shows the latest contents"
            >
              ↻ Re-index Drive
            </button>
          </div>
        )}

        {showDefaultsBlock && (
          <div className="cds-defaults">
            <div className="cds-defaults-head">
              <div>
                <div className="cds-defaults-title">Default folders for this client</div>
                <div className="cds-defaults-sub">
                  Where each doc kind and Ads Sequence step gets pushed by
                  default. Pick once per row; the form output autopilots from
                  here on.
                </div>
              </div>
            </div>

            {clientSubLoad.kind === "loading" && (
              <div className="cds-loading">
                <span className="cds-spinner" /> Reading subfolders from this
                client's Drive folder…
              </div>
            )}
            {clientSubLoad.kind === "error" && (
              <div className="cds-error">⚠ {clientSubLoad.message}</div>
            )}
            {clientSubLoad.kind === "ready" && clientSubfolders && (
              <>
                {clientSubfolders.length === 0 ? (
                  <div className="cds-banner">
                    This Drive folder has no subfolders yet. Add some in Drive
                    (e.g. <code>Ad Copy</code>, <code>Briefs</code>,{" "}
                    <code>Reports</code>) and hit <strong>↻ Re-index Drive</strong> to
                    populate the dropdowns below.
                  </div>
                ) : (
                  <>
                    <div className="cds-defaults-section">Documents</div>
                    <div className="cds-defaults-grid">
                      {DOC_KINDS.map((kind) => {
                        const sel = docDefaults[kind] ?? null;
                        const busy = defaultsBusyKey === `doc:${kind}`;
                        return (
                          <div key={kind} className="cds-defaults-row">
                            <label className="cds-defaults-label">
                              {DOC_KIND_LABEL[kind]}
                            </label>
                            <FolderSelect
                              folders={clientSubfolders}
                              selectedId={sel?.id ?? null}
                              disabled={busy}
                              onChange={(f) => void handleDocDefaultChange(kind, f)}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="cds-defaults-section">Ads Sequence steps</div>
                    <div className="cds-defaults-grid">
                      {SEQUENCE_STEPS.map(({ id, label }) => {
                        const sel = sequenceDefaults[id] ?? null;
                        const busy = defaultsBusyKey === `seq:${id}`;
                        return (
                          <div key={id} className="cds-defaults-row">
                            <label className="cds-defaults-label">{label}</label>
                            <FolderSelect
                              folders={clientSubfolders}
                              selectedId={sel?.id ?? null}
                              disabled={busy}
                              onChange={(f) => void handleSequenceDefaultChange(id, f)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <details className="cds-advanced">
          <summary>Or paste a URL manually</summary>
          <div className="cds-paste-row">
            <input
              type="text"
              className="cds-input"
              placeholder="https://drive.google.com/drive/folders/…"
              value={pasteDraft}
              onChange={(e) => setPasteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) {
                  e.preventDefault();
                  handleSavePaste();
                }
              }}
              disabled={saving}
            />
            <button
              type="button"
              className="hml-btn hml-accent"
              onClick={handleSavePaste}
              disabled={
                saving || pasteDraft.trim() === (currentUrl ?? "").trim()
              }
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </details>

        {error && <div className="cds-error">⚠ {error}</div>}
        {savedAt && !error && (
          <div className="cds-saved" role="status">
            ✓ Saved at {new Date(savedAt).toLocaleTimeString()}. Drive folder
            updated.
          </div>
        )}
      </div>
    </section>
  );
}

interface FolderSelectProps {
  folders: DriveSubfolder[];
  selectedId: string | null;
  disabled?: boolean;
  onChange: (folder: DriveSubfolder | null) => void;
}

function FolderSelect({ folders, selectedId, disabled, onChange }: FolderSelectProps) {
  return (
    <select
      className="cds-select"
      value={selectedId ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        if (!id) onChange(null);
        else {
          const f = folders.find((x) => x.id === id);
          if (f) onChange(f);
        }
      }}
      disabled={disabled}
    >
      <option value="">(Not set)</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

const driveSettingsCSS = `
.cds-panel { margin-bottom: 16px; }
.cds-body { padding: 14px 18px 16px; }

.cds-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  margin-bottom: 14px;
  min-width: 0;
}
.cds-current-link {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-secondary);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
  cursor: pointer;
}
.cds-current-link:hover { color: var(--hml-accent); }

.cds-empty {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--hml-text-tertiary);
}

.cds-banner {
  padding: 11px 14px;
  border-radius: 8px;
  border: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-2);
  color: var(--hml-text-secondary);
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 12px;
}
.cds-banner strong { color: var(--hml-text-primary); }
.cds-banner em { font-style: normal; color: var(--hml-accent); }

.cds-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px dashed var(--hml-border);
  color: var(--hml-text-tertiary);
  font-size: 13px;
  margin-bottom: 12px;
}
.cds-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--hml-border);
  border-top-color: var(--hml-accent);
  animation: cds-spin 0.8s linear infinite;
}
@keyframes cds-spin { to { transform: rotate(360deg); } }

.cds-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.cds-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cds-link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--hml-accent);
  cursor: pointer;
}
.cds-link-btn:hover { text-decoration: underline; }
.cds-link-btn:disabled { color: var(--hml-text-quaternary); cursor: default; }

.cds-folder-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}
.cds-folder-row {
  width: 100%;
  display: grid;
  grid-template-columns: 22px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  color: var(--hml-text-primary);
  font: inherit;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.cds-folder-row:hover:not(:disabled) {
  background: var(--hml-bg-elev-3);
  border-color: var(--hml-accent-border);
}
.cds-folder-row:disabled { cursor: default; }
.cds-folder-row.is-current {
  border-color: var(--hml-accent);
  background: var(--hml-accent-dim);
}
.cds-folder-icon { font-size: 14px; text-align: center; }
.cds-folder-name {
  font-size: 13px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cds-folder-tag {
  font-size: 11px;
  font-family: var(--hml-font-mono);
  color: var(--hml-accent);
  white-space: nowrap;
}
.cds-folder-tag.is-current-tag {
  color: var(--hml-accent);
  font-weight: 600;
}

.cds-actions {
  display: flex;
  gap: 8px;
  margin: 14px 0 4px;
  flex-wrap: wrap;
}

.cds-defaults {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--hml-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cds-defaults-head { margin-bottom: 4px; }
.cds-defaults-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--hml-text-primary);
}
.cds-defaults-sub {
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
  margin-top: 2px;
  line-height: 1.5;
}
.cds-defaults-section {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 8px;
}
.cds-defaults-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}
.cds-defaults-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 11px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
}
.cds-defaults-label {
  font-size: 12.5px;
  color: var(--hml-text-secondary);
  font-weight: 500;
}
.cds-select {
  width: 100%;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--hml-text-primary);
  background: var(--hml-bg-elev-3);
  border: 1px solid var(--hml-border);
  border-radius: 6px;
  padding: 6px 9px;
}
.cds-select:focus {
  outline: none;
  border-color: var(--hml-accent-border);
}

.cds-advanced {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--hml-border-subtle);
}
.cds-advanced > summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--hml-text-tertiary);
  margin-bottom: 8px;
  user-select: none;
}
.cds-advanced > summary:hover { color: var(--hml-text-secondary); }
.cds-paste-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.cds-input {
  flex: 1;
  min-width: 0;
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 8px 11px;
}
.cds-input:focus {
  outline: none;
  border-color: var(--hml-accent-border);
}

.cds-error {
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 6px;
  border: 1px solid var(--hml-red-border);
  background: var(--hml-red-bg);
  color: var(--hml-red);
  font-size: 12.5px;
}
.cds-saved {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--hml-green-border, rgba(120, 200, 140, 0.4));
  background: var(--hml-green-bg, rgba(120, 200, 140, 0.10));
  color: var(--hml-green, #79c88c);
  font-size: 13px;
  font-weight: 500;
}
`;
