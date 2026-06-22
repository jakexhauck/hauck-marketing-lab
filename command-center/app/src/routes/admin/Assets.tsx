import { useEffect, useMemo, useState } from "react";
import {
  Folder,
  FileText,
  Download,
  ExternalLink,
  Trash2,
  Upload,
  FolderPlus,
  ChevronRight,
  Loader2,
  Link2,
  Settings,
  X,
} from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { api, ApiError } from "../../lib/api";

// Admin "Assets" — a Google Drive file browser backed by Composio. Browse client
// folders, preview, download, upload (<=5MB), and manage who sees what. Drive is
// the storage; this is just the window. Admin-only (gated in _middleware.ts).

const UPLOAD_LIMIT = 5 * 1024 * 1024; // Composio upload action caps at 5MB.

interface RootFolder {
  id: string;
  name: string;
  folderId: string;
  webViewLink: string | null;
  tenantId: string | null;
}
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  webViewLink: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  modifiedTime: string | null;
  size: string | null;
}
interface Crumb {
  folderId: string;
  name: string;
}

function fmtSize(bytes: string | null): string {
  if (!bytes) return "";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n === 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export default function Assets() {
  const [connected, setConnected] = useState(false);
  const [fullAccess, setFullAccess] = useState(false);
  const [roots, setRoots] = useState<RootFolder[]>([]);
  const [stack, setStack] = useState<Crumb[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const current = stack[stack.length - 1] ?? null;

  const flash = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), err ? 5000 : 2600);
  };

  const loadRoots = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ connected: boolean; fullAccess: boolean; folders: RootFolder[] }>(
        "/api/admin/assets/folders",
      );
      setConnected(data.connected);
      setFullAccess(data.fullAccess);
      setRoots(data.folders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoots();
  }, []);

  const loadFolder = async (crumb: Crumb) => {
    setBrowsing(true);
    try {
      const data = await api<{ files: DriveFile[] }>(`/api/admin/assets/list?folderId=${encodeURIComponent(crumb.folderId)}`);
      setFiles(data.files ?? []);
    } catch (err) {
      if (err instanceof ApiError && (err.body as { code?: string })?.code === "not_connected") setConnected(false);
      else flash(err instanceof Error ? err.message : "Could not open folder", true);
      setFiles([]);
    } finally {
      setBrowsing(false);
    }
  };

  const openClient = (root: RootFolder) => {
    const next = [{ folderId: root.folderId, name: root.name }];
    setStack(next);
    void loadFolder(next[0]);
  };
  const openSubfolder = (f: DriveFile) => {
    const crumb = { folderId: f.id, name: f.name };
    setStack((s) => [...s, crumb]);
    void loadFolder(crumb);
  };
  const gotoCrumb = (index: number) => {
    if (index < 0) {
      setStack([]);
      return;
    }
    const next = stack.slice(0, index + 1);
    setStack(next);
    void loadFolder(next[next.length - 1]);
  };

  const onConnect = () => {
    // Hand off to the OAuth start route (a top-level navigation so Google's
    // consent screen and our redirect cookie work). The agency account
    // authorizes once; the callback returns to /admin/assets?connected=1.
    setConnecting(true);
    window.location.href = "/api/admin/assets/oauth/start";
  };

  const onNewFolder = async () => {
    if (!current) return;
    const name = window.prompt("New folder name");
    if (!name?.trim()) return;
    try {
      await api("/api/admin/assets/create-folder", {
        method: "POST",
        body: JSON.stringify({ parentId: current.folderId, name: name.trim() }),
      });
      flash("Folder created");
      void loadFolder(current);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not create folder", true);
    }
  };

  const onDelete = async (f: DriveFile) => {
    if (!window.confirm(`Move "${f.name}" to the Drive trash? You can restore it from Google Drive.`)) return;
    try {
      await api("/api/admin/assets/delete", { method: "POST", body: JSON.stringify({ fileId: f.id }) });
      flash(`Moved "${f.name}" to trash`);
      if (current) void loadFolder(current);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not delete", true);
    }
  };

  const onUpload = async (fileList: FileList | null) => {
    if (!fileList || !current) return;
    const picked = Array.from(fileList);
    const tooBig = picked.filter((f) => f.size > UPLOAD_LIMIT);
    const ok = picked.filter((f) => f.size <= UPLOAD_LIMIT);
    if (tooBig.length) flash(`${tooBig.length} file(s) over 5MB skipped. Add large files in Google Drive directly.`, true);
    let done = 0;
    for (const file of ok) {
      const form = new FormData();
      form.append("folderId", current.folderId);
      form.append("file", file);
      try {
        await api("/api/admin/assets/upload", { method: "POST", body: form });
        done++;
      } catch (err) {
        flash(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`, true);
      }
    }
    if (done) {
      flash(`Uploaded ${done} file${done > 1 ? "s" : ""}`);
      void loadFolder(current);
    }
  };

  const subtitle = useMemo(() => {
    if (!connected) return "Google Drive not connected";
    return current ? current.name : `${roots.length} client folder${roots.length === 1 ? "" : "s"}`;
  }, [connected, current, roots.length]);

  return (
    <DesktopPage title="Assets" subtitle={subtitle}>
      {/* Connect banner */}
      {!loading && !connected && (
        <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-brand/30 bg-brand/5 p-4 sm:flex-row sm:items-center">
          <Link2 size={20} className="text-brand" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-text">Connect Google Drive</div>
            <p className="mt-0.5 text-[13px] text-muted">
              {fullAccess
                ? "Authorize the agency Google account once. Files stay in Drive; this is just the window into them."
                : "Ask an agency admin to connect Google Drive, then refresh."}
            </p>
          </div>
          {fullAccess && (
            <Button variant="primary" loading={connecting} onClick={() => void onConnect()}>
              <Link2 size={16} /> Connect Google
            </Button>
          )}
        </div>
      )}

      {/* Breadcrumb + actions */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[14px]">
          <button
            onClick={() => gotoCrumb(-1)}
            className={stack.length ? "font-medium text-muted hover:text-brand" : "font-semibold text-text"}
          >
            Assets
          </button>
          {stack.map((c, i) => (
            <span key={c.folderId} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-faint" />
              <button
                onClick={() => gotoCrumb(i)}
                className={i === stack.length - 1 ? "font-semibold text-text" : "font-medium text-muted hover:text-brand"}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        {connected && current && (
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => void onNewFolder()}>
              <FolderPlus size={16} /> New folder
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] bg-brand px-3 py-2 text-[13px] font-medium text-brand-fg hover:opacity-90">
              <Upload size={16} /> Upload
              <input type="file" multiple className="hidden" onChange={(e) => void onUpload(e.target.files)} />
            </label>
          </div>
        )}
        {connected && !current && fullAccess && (
          <Button variant="ghost" onClick={() => setManageOpen(true)}>
            <Settings size={16} /> Manage
          </Button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
      ) : !connected ? null : !current ? (
        <RootList roots={roots} fullAccess={fullAccess} onOpen={openClient} />
      ) : browsing ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading folder...
        </div>
      ) : files.length === 0 ? (
        <EmptyState label="This folder is empty. Use Upload to add files." />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
          {files.map((f, idx) => (
            <FileRow
              key={f.id}
              file={f}
              last={idx === files.length - 1}
              onOpenFolder={() => openSubfolder(f)}
              onDelete={() => void onDelete(f)}
            />
          ))}
        </div>
      )}

      {manageOpen && <ManageModal onClose={() => setManageOpen(false)} onChanged={() => void loadRoots()} flash={flash} />}

      {toast && (
        <div
          className={[
            "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius)] border px-4 py-2.5 text-[13px] shadow-[var(--shadow-md)]",
            toast.err ? "border-danger/40 bg-surface text-danger" : "border-border bg-surface text-text",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}
    </DesktopPage>
  );
}

function RootList({ roots, fullAccess, onOpen }: { roots: RootFolder[]; fullAccess: boolean; onOpen: (r: RootFolder) => void }) {
  if (roots.length === 0) {
    return (
      <EmptyState
        label={fullAccess ? "No client folders mapped yet. Use Manage to add one." : "No folders are shared with you yet."}
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      {roots.map((r, idx) => (
        <button
          key={r.id}
          onClick={() => onOpen(r)}
          className={[
            "group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2",
            idx === roots.length - 1 ? "" : "border-b border-divider",
          ].join(" ")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-brand/10 text-brand">
            <Folder size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-text">{r.name}</span>
            <span className="block text-[12.5px] text-muted">Client folder</span>
          </span>
          <ChevronRight size={17} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </button>
      ))}
    </div>
  );
}

function FileRow({
  file,
  last,
  onOpenFolder,
  onDelete,
}: {
  file: DriveFile;
  last: boolean;
  onOpenFolder: () => void;
  onDelete: () => void;
}) {
  const meta = [fmtSize(file.size), fmtDate(file.modifiedTime)].filter(Boolean).join(" · ");
  const rowCls = ["group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2", last ? "" : "border-b border-divider"].join(" ");

  if (file.isFolder) {
    return (
      <button onClick={onOpenFolder} className={`${rowCls} w-full text-left`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-brand/10 text-brand">
          <Folder size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-text">{file.name}</span>
          <span className="block text-[12px] text-muted">Folder{meta ? ` · ${fmtDate(file.modifiedTime)}` : ""}</span>
        </span>
        <ChevronRight size={17} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </button>
    );
  }

  const downloadHref = `/api/admin/assets/download?fileId=${encodeURIComponent(file.id)}&mimeType=${encodeURIComponent(file.mimeType)}`;
  return (
    <div className={rowCls}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] bg-surface-2 text-muted">
        {isImage(file.mimeType) && file.thumbnailLink ? (
          <img src={file.thumbnailLink} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <FileText size={17} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] text-text">{file.name}</div>
        <div className="text-[12px] text-muted">{meta || "File"}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noreferrer"
            title="Open in Drive"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-faint hover:bg-surface-2 hover:text-text"
          >
            <ExternalLink size={15} />
          </a>
        )}
        <a
          href={downloadHref}
          title="Download"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-faint hover:bg-surface-2 hover:text-text"
        >
          <Download size={15} />
        </a>
        <button
          onClick={onDelete}
          title="Move to trash"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-faint hover:bg-danger-tint hover:text-danger"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-16 text-center">
      <Folder size={28} className="mx-auto mb-2 text-faint" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage modal (owner only): map clients to folders + assign per-person access.
// ---------------------------------------------------------------------------

interface MapFolder {
  id: string;
  tenant_id: string | null;
  name: string;
  folder_id: string;
}
interface AccessAdmin {
  id: string;
  name: string;
  email: string;
  fullAccess: boolean;
  folderIds: string[];
}

function ManageModal({
  onClose,
  onChanged,
  flash,
}: {
  onClose: () => void;
  onChanged: () => void;
  flash: (msg: string, err?: boolean) => void;
}) {
  const [folders, setFolders] = useState<MapFolder[]>([]);
  const [admins, setAdmins] = useState<AccessAdmin[]>([]);
  const [accessFolders, setAccessFolders] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [f, a] = await Promise.all([
        api<{ folders: MapFolder[] }>("/api/admin/assets/manage/client-folders"),
        api<{ admins: AccessAdmin[]; folders: { id: string; name: string }[] }>("/api/admin/assets/manage/access"),
      ]);
      setFolders(f.folders ?? []);
      setAdmins(a.admins ?? []);
      setAccessFolders(a.folders ?? []);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not load manage panel", true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const addFolder = async () => {
    if (!name.trim() || !url.trim()) {
      flash("Name and folder link are both required", true);
      return;
    }
    try {
      await api("/api/admin/assets/manage/client-folders", {
        method: "POST",
        body: JSON.stringify({ action: "add", name: name.trim(), folderUrl: url.trim() }),
      });
      setName("");
      setUrl("");
      flash("Folder added");
      await load();
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not add folder", true);
    }
  };
  const removeFolder = async (id: string) => {
    if (!window.confirm("Remove this folder from Assets? The files stay in Drive.")) return;
    try {
      await api("/api/admin/assets/manage/client-folders", { method: "POST", body: JSON.stringify({ action: "remove", id }) });
      await load();
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not remove", true);
    }
  };
  const post = async (payload: Record<string, unknown>) => {
    try {
      await api("/api/admin/assets/manage/access", { method: "POST", body: JSON.stringify(payload) });
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not update access", true);
    }
  };

  const inputCls =
    "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[86vh] w-full max-w-xl overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-bg p-6 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-text">Manage assets</h2>
          <button onClick={onClose} className="text-faint hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="mb-5 text-[13px] text-muted">Map a client to its Drive folder, then choose who can see it.</p>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <SectionLabel>Client folders</SectionLabel>
            <div className="mb-3 flex flex-col gap-2">
              {folders.length === 0 && <p className="text-[13px] text-muted">No client folders mapped yet.</p>}
              {folders.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-[var(--radius)] border border-border px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">{f.name}</span>
                  <span className="truncate font-mono text-[11px] text-faint">{f.folder_id}</span>
                  <button onClick={() => void removeFolder(f.id)} className="text-faint hover:text-danger" title="Remove">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row">
              <input className={inputCls} placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={inputCls} placeholder="Drive folder link or ID" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button variant="primary" onClick={() => void addFolder()}>
                <FolderPlus size={16} /> Add
              </Button>
            </div>

            <SectionLabel className="mt-7">Who sees what</SectionLabel>
            <div className="flex flex-col gap-3">
              {admins.length === 0 && <p className="text-[13px] text-muted">No admins found.</p>}
              {admins.map((a) => (
                <div key={a.id} className="rounded-[var(--radius)] border border-border p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-text">{a.name}</div>
                      <div className="truncate text-[12px] text-faint">{a.email}</div>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--brand-primary)]"
                        checked={a.fullAccess}
                        onChange={(e) => void post({ action: "setFull", adminId: a.id, value: e.target.checked })}
                      />
                      Sees everything
                    </label>
                  </div>
                  {!a.fullAccess && accessFolders.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                      {accessFolders.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 text-[13px] text-muted">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--brand-primary)]"
                            checked={a.folderIds.includes(f.id)}
                            onChange={(e) =>
                              void post({ action: e.target.checked ? "grant" : "revoke", adminId: a.id, clientFolderId: f.id })
                            }
                          />
                          {f.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted ${className}`}>{children}</div>
  );
}
