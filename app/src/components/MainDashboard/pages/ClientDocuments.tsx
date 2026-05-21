/**
 * Per-client Drive tab.
 *
 * Unified surface: browse the client's Drive folder tree on the left, see the
 * contents of the selected folder on the right (subfolders + local docs +
 * Drive-only files), and create / edit local docs inline. Clicking a local
 * doc swaps the right pane for the full-width DocumentEditor.
 */

import { useEffect, useMemo, useState } from "react";
import type { ClientEntry, DocKind, DocSummary } from "../../../lib/types";
import { api } from "../../../lib/tauri";
import {
  driveNodeUrl,
  parseDriveFolders,
  parseDriveTree,
  type DriveFolder,
  type DriveNode,
} from "../../../lib/driveIndex";
import { DocumentEditor } from "../../DocumentEditor";
import {
  IconChevronRight,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconPlus,
  IconRefresh,
} from "../../icons";

interface ClientDocumentsProps {
  client: ClientEntry;
  root: string;
}

const KIND_ORDER: DocKind[] = ["ad-copy", "brief", "notes", "report", "other"];

const KIND_LABEL: Record<DocKind, string> = {
  "ad-copy": "Ad Copy",
  brief: "Brief",
  notes: "Notes",
  report: "Report",
  other: "Other",
};

const ROOT_ID = "__root__";

/** Extract a Google Drive folder ID from either a folder URL or a bare ID. */
function extractFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const slashSplit = trimmed.split("/folders/")[1];
  const candidate = (slashSplit ?? trimmed).split(/[/?#]/)[0];
  if (/^[A-Za-z0-9_-]{20,}$/.test(candidate)) return candidate;
  return null;
}

/** When _drive-index.md only has the flat `## Subfolders` table (the legacy
 *  shape), synthesize a one-level tree so the new browser still works.
 *  Returns null if neither the table nor the client's drive folder URL is
 *  enough to build a root. */
function synthesizeTreeFromFolders(
  body: string,
  driveFolderUrl: string | null | undefined,
  clientName: string,
): DriveNode | null {
  const folders: DriveFolder[] = parseDriveFolders(body);
  const rootId = driveFolderUrl ? extractFolderId(driveFolderUrl) : null;
  if (!rootId && folders.length === 0) return null;

  if (!rootId) {
    // No root URL set, but we have subfolders. Render a synthetic root
    // node anchored on the ROOT_ID sentinel so the user can still drill in.
    return {
      id: ROOT_ID,
      name: `${clientName} - Drive`,
      type: "folder",
      children: folders.map((f) => ({
        id: f.id,
        name: f.name,
        type: "folder" as const,
        url: f.url,
        children: [],
      })),
    };
  }

  return {
    id: rootId,
    name: `${clientName} - Drive`,
    type: "folder",
    url: `https://drive.google.com/drive/folders/${rootId}`,
    children: folders.map((f) => ({
      id: f.id,
      name: f.name,
      type: "folder" as const,
      url: f.url,
      children: [],
    })),
  };
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusPill(doc: DocSummary): { className: string; label: string } {
  if (doc.currentVersion === 0) return { className: "hml-neutral", label: "Unsynced" };
  if (doc.isDirty) return { className: "hml-amber", label: "Dirty" };
  return { className: "hml-green", label: "Synced" };
}

/** Walk the tree to find a folder node by id. Returns the path of folder ids
 *  from root down to the matching node (excluding the synthetic root id). */
function findFolderPath(tree: DriveNode | null, folderId: string): string[] | null {
  if (!tree) return null;
  if (folderId === ROOT_ID) return [];
  const stack: { node: DriveNode; trail: string[] }[] = [{ node: tree, trail: [] }];
  while (stack.length > 0) {
    const { node, trail } = stack.pop()!;
    if (node.id === folderId && node.type === "folder") return trail;
    if (node.children) {
      for (const c of node.children) {
        if (c.type === "folder") {
          stack.push({ node: c, trail: [...trail, c.id] });
        }
      }
    }
  }
  return null;
}

/** Resolve the active folder node from the tree given a stack of folder ids. */
function resolveFolder(tree: DriveNode | null, path: string[]): DriveNode | null {
  if (!tree) return null;
  let cursor: DriveNode | undefined = tree;
  for (const id of path) {
    const next: DriveNode | undefined = cursor?.children?.find(
      (c) => c.id === id && c.type === "folder",
    );
    if (!next) return null;
    cursor = next;
  }
  return cursor ?? null;
}

/** Build a flat set of folder ids present in the tree, for orphan detection. */
function collectFolderIds(tree: DriveNode | null): Set<string> {
  const out = new Set<string>();
  if (!tree) return out;
  const stack: DriveNode[] = [tree];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.type === "folder") {
      out.add(n.id);
      if (n.children) {
        for (const c of n.children) stack.push(c);
      }
    }
  }
  return out;
}

export function ClientDocuments({ client, root }: ClientDocumentsProps) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [tree, setTree] = useState<DriveNode | null>(null);
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([ROOT_ID]),
  );
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [rootDraft, setRootDraft] = useState("");
  const [savingRoot, setSavingRoot] = useState(false);
  const [newKind, setNewKind] = useState<DocKind>("ad-copy");

  const refreshDocs = async () => {
    try {
      const list = await api.listClientDocs(root, client.slug);
      setDocs(list);
      return list;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [] as DocSummary[];
    }
  };

  const loadTree = async () => {
    try {
      const idx = await api.readDriveIndex(root, client.slug);
      if (!idx) {
        setTree(null);
      } else {
        const fromBlock = parseDriveTree(idx.body);
        if (fromBlock) {
          setTree(fromBlock);
        } else {
          // Legacy index shape (only `## Subfolders` table) or partial data.
          // Synthesize a one-level tree so the user isn't blocked behind a
          // slow MCP refresh.
          setTree(
            synthesizeTreeFromFolders(
              idx.body,
              idx.drive_folder_url ?? client.drive_folder_url ?? null,
              client.name,
            ),
          );
        }
      }
    } catch {
      setTree(null);
    } finally {
      setTreeLoaded(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedDocId(null);
    setPath([]);
    setExpandedFolders(new Set([ROOT_ID]));

    (async () => {
      await refreshDocs();
      if (cancelled) return;
      await loadTree();
      if (cancelled) return;
      setLoading(false);

      // Best-effort sweep of docs deleted on Drive.
      try {
        const result = await api.sweepDriveDeletedDocs(root, client.slug);
        if (cancelled) return;
        if (result.removedDocIds.length > 0) {
          await refreshDocs();
          if (cancelled) return;
          setSelectedDocId((prev) =>
            prev && result.removedDocIds.includes(prev) ? null : prev,
          );
        }
      } catch {
        // sweep is best-effort
      }
    })();

    const off = api.onDataChanged((evt) => {
      if (evt.kind !== "client") return;
      if (evt.client_slug && evt.client_slug !== client.slug) return;
      void refreshDocs();
    });

    return () => {
      cancelled = true;
      void off.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, client.slug]);

  const handleSetRoot = async () => {
    const id = extractFolderId(rootDraft);
    if (!id) {
      setError(
        "Couldn't parse a Drive folder ID. Paste either the folder URL or the bare ID.",
      );
      return;
    }
    setSavingRoot(true);
    setError(null);
    const url = `https://drive.google.com/drive/folders/${id}`;
    try {
      await api.setClientDriveFolder(root, client.slug, url);
      // Rebuild the tree locally with just the new root. User can hit Refresh
      // to fan out subfolders via the MCP later, or just create docs here.
      const idx = await api.readDriveIndex(root, client.slug);
      const body = idx?.body ?? "";
      setTree(synthesizeTreeFromFolders(body, url, client.name));
      setTreeLoaded(true);
      setRootDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingRoot(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const idx = await api.refreshDriveIndex(root, client.slug);
      if (!idx) {
        setTree(null);
      } else {
        const fromBlock = parseDriveTree(idx.body);
        setTree(
          fromBlock ??
            synthesizeTreeFromFolders(
              idx.body,
              idx.drive_folder_url ?? client.drive_folder_url ?? null,
              client.name,
            ),
        );
      }
      setTreeLoaded(true);
      await refreshDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  // Derived: currently selected folder node (or null when at synthetic root
  // and the tree has no real root node — e.g. client has no drive folder).
  const currentFolder = useMemo(() => resolveFolder(tree, path), [tree, path]);
  const selectedFolderId = currentFolder?.id ?? null;
  const knownFolderIds = useMemo(() => collectFolderIds(tree), [tree]);

  // Local docs in the currently selected folder. When at root with no real
  // root folder, also include docs that have no driveFolderId at all.
  const docsInFolder = useMemo(() => {
    if (!currentFolder) {
      return docs.filter((d) => !d.driveFolderId);
    }
    return docs.filter((d) => d.driveFolderId === currentFolder.id);
  }, [docs, currentFolder]);

  // Drive-only entries in the selected folder (i.e. files that have no
  // matching local doc by currentDriveFileId).
  const driveOnlyEntries = useMemo(() => {
    if (!currentFolder?.children) return [];
    const localFileIds = new Set(
      docs.map((d) => d.currentDriveFileId).filter((x): x is string => Boolean(x)),
    );
    return currentFolder.children.filter(
      (c) => c.type === "file" && !localFileIds.has(c.id),
    );
  }, [currentFolder, docs]);

  // Folder children of the selected folder, for descent.
  const subfolders = useMemo(() => {
    if (!currentFolder?.children) return [];
    return currentFolder.children.filter((c) => c.type === "folder");
  }, [currentFolder]);

  // Orphaned local docs: their driveFolderId doesn't match any known folder.
  // Only surfaced at root so they remain reachable.
  const orphanDocs = useMemo(() => {
    if (path.length !== 0) return [];
    return docs.filter(
      (d) => d.driveFolderId && !knownFolderIds.has(d.driveFolderId),
    );
  }, [docs, knownFolderIds, path]);

  const breadcrumbTrail = useMemo(() => {
    const rootLabel = tree?.name ?? "Drive root";
    const trail: { id: string; name: string; depth: number }[] = [
      { id: ROOT_ID, name: rootLabel, depth: 0 },
    ];
    if (tree) {
      let cursor: DriveNode | undefined = tree;
      for (let i = 0; i < path.length; i++) {
        const id = path[i];
        const next: DriveNode | undefined = cursor?.children?.find(
          (c) => c.id === id && c.type === "folder",
        );
        if (!next) break;
        trail.push({ id: next.id, name: next.name, depth: i + 1 });
        cursor = next;
      }
    }
    return trail;
  }, [tree, path]);

  const selectFolder = (folderId: string) => {
    if (folderId === ROOT_ID) {
      setPath([]);
      setSelectedDocId(null);
      return;
    }
    const p = findFolderPath(tree, folderId);
    if (p) {
      setPath(p);
      setSelectedDocId(null);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const folderId =
        currentFolder && currentFolder.id !== tree?.id ? currentFolder.id : undefined;
      const folderName =
        currentFolder && currentFolder.id !== tree?.id ? currentFolder.name : undefined;
      // At root: if the client's root folder is in the tree, pin new docs to
      // it so they show up on subsequent visits. Otherwise leave unpinned.
      const useRoot = currentFolder && currentFolder.id === tree?.id;
      const created = await api.createClientDoc(root, client.slug, {
        title,
        kind: newKind,
        body: "",
        driveFolderId: folderId ?? (useRoot ? tree?.id : undefined),
        driveFolderName: folderName ?? (useRoot ? tree?.name : undefined),
      });
      setNewTitle("");
      setShowCreate(false);
      const list = await refreshDocs();
      const match = list.find((d) => d.id === created.id);
      setSelectedDocId(match?.id ?? created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDocDeleted = (docId: string) => {
    setSelectedDocId((prev) => (prev === docId ? null : prev));
    void refreshDocs();
  };

  const selected = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId],
  );

  // ─── Editor view ─────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          className="hml-btn"
          onClick={() => setSelectedDocId(null)}
          style={{ alignSelf: "flex-start", fontSize: 12.5 }}
        >
          ← Back to Drive
        </button>
        <DocumentEditor
          key={selected.id}
          root={root}
          clientSlug={client.slug}
          docId={selected.id}
          onUpdated={() => void refreshDocs()}
          onDeleted={handleDocDeleted}
        />
      </div>
    );
  }

  // ─── Browser view ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div className="hml-error-banner" style={{ fontSize: 12 }}>
          {error}
        </div>
      )}

      <div
        className="hml-panel"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <Breadcrumb
            trail={breadcrumbTrail}
            onJump={(depth) => {
              setPath(path.slice(0, depth));
              setSelectedDocId(null);
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {currentFolder && currentFolder.id && (
            <a
              href={driveNodeUrl(currentFolder)}
              target="_blank"
              rel="noreferrer"
              className="hml-btn"
              style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={(e) => {
                e.preventDefault();
                window.open(driveNodeUrl(currentFolder), "_blank", "noopener,noreferrer");
              }}
            >
              <IconExternalLink size={12} />
              Open in Drive
            </a>
          )}
          <button
            type="button"
            className="hml-btn hml-accent"
            onClick={() => setShowCreate((v) => !v)}
            style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
            disabled={!treeLoaded}
          >
            <IconPlus size={12} />
            New Doc
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="hml-panel" style={{ padding: "12px 14px" }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--hml-text-tertiary)",
              marginBottom: 8,
            }}
          >
            New document in {currentFolder?.name ?? "Drive root"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="hml-form-input"
              placeholder="Document title…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") {
                  setShowCreate(false);
                  setNewTitle("");
                }
              }}
              autoFocus
              style={{ flex: 1, fontSize: 12.5 }}
              disabled={creating}
            />
            <select
              className="hml-form-input"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as DocKind)}
              style={{ width: 100, fontSize: 12 }}
              disabled={creating}
              title="Document kind"
            >
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="hml-btn hml-accent"
              onClick={() => void handleCreate()}
              disabled={creating || !newTitle.trim()}
              style={{ fontSize: 12 }}
            >
              Create
            </button>
            <button
              type="button"
              className="hml-btn"
              onClick={() => {
                setShowCreate(false);
                setNewTitle("");
              }}
              disabled={creating}
              style={{ fontSize: 12 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <aside
          className="hml-panel"
          style={{ position: "sticky", top: 0, alignSelf: "start" }}
        >
          <div
            className="hml-panel-header"
            style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}
          >
            <div className="hml-panel-title">
              <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
              Folders
              <button
                type="button"
                className="hml-panel-action"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: refreshing ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11.5,
                }}
                title="Refresh Drive index"
              >
                <IconRefresh size={11} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div
            className="hml-panel-body"
            style={{ padding: "6px 6px 10px", maxHeight: 560, overflow: "auto" }}
          >
            {loading || !treeLoaded ? (
              <div className="hml-empty" style={{ padding: "16px 8px" }}>
                <div className="hml-empty-sub">Loading…</div>
              </div>
            ) : !tree ? (
              <div className="hml-empty" style={{ padding: "12px 8px" }}>
                <div
                  className="hml-empty-title"
                  style={{ fontSize: 13, marginBottom: 4 }}
                >
                  Set this client's Drive root
                </div>
                <div
                  className="hml-empty-sub"
                  style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 8 }}
                >
                  Paste the folder URL (or just the ID). You can browse and
                  create docs immediately; the slow Refresh button is only
                  needed to populate subfolders later.
                </div>
                <input
                  type="text"
                  className="hml-form-input"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={rootDraft}
                  onChange={(e) => setRootDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !savingRoot && rootDraft.trim()) {
                      e.preventDefault();
                      void handleSetRoot();
                    }
                  }}
                  disabled={savingRoot}
                  style={{ width: "100%", marginBottom: 6, fontSize: 12 }}
                />
                <button
                  type="button"
                  className="hml-btn hml-accent"
                  onClick={() => void handleSetRoot()}
                  disabled={savingRoot || !rootDraft.trim()}
                  style={{ width: "100%", fontSize: 12 }}
                >
                  {savingRoot ? "Saving…" : "Use this folder"}
                </button>
              </div>
            ) : (
              <TreeRow
                node={tree}
                depth={0}
                selectedId={selectedFolderId}
                expanded={expandedFolders}
                onToggle={toggleFolder}
                onSelect={selectFolder}
                rootLabel="Drive root"
              />
            )}
          </div>
        </aside>

        <div className="hml-panel" style={{ minWidth: 0 }}>
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              {currentFolder?.name ?? "Drive root"}
              <span
                className="hml-panel-action"
                style={{ marginLeft: "auto", fontSize: 11 }}
              >
                {subfolders.length + docsInFolder.length + driveOnlyEntries.length} items
              </span>
            </div>
          </div>

          <div className="hml-panel-body" style={{ padding: "4px 6px 10px" }}>
            {loading ? (
              <div className="hml-empty" style={{ padding: "30px 12px" }}>
                <div className="hml-empty-sub">Loading…</div>
              </div>
            ) : !tree && docsInFolder.length === 0 ? (
              <div className="hml-empty" style={{ padding: "30px 12px" }}>
                <div className="hml-empty-title">No Drive root yet</div>
                <div className="hml-empty-sub">
                  Set this client's Drive folder using the input in the left
                  rail. After that you can create docs here straight away.
                </div>
              </div>
            ) : (
              <>
                {subfolders.length > 0 && (
                  <SectionLabel label="Folders" count={subfolders.length} />
                )}
                {subfolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      setPath([...path, folder.id]);
                      setExpandedFolders((prev) => {
                        const next = new Set(prev);
                        next.add(folder.id);
                        return next;
                      });
                    }}
                    className="hml-activity"
                    style={{
                      textDecoration: "none",
                      background: "none",
                      border: 0,
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div className="hml-activity-icon hml-blue">
                      <IconFolder size={13} />
                    </div>
                    <div className="hml-activity-body">
                      <div className="hml-activity-title">
                        <span className="hml-em">{folder.name}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        opacity: 0.5,
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <IconChevronRight size={14} />
                    </div>
                  </button>
                ))}

                {docsInFolder.length > 0 && (
                  <SectionLabel label="Local docs" count={docsInFolder.length} />
                )}
                {docsInFolder.map((doc) => {
                  const pill = statusPill(doc);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setSelectedDocId(doc.id)}
                      className="hml-activity"
                      style={{
                        textDecoration: "none",
                        background: "none",
                        border: 0,
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div className="hml-activity-icon">
                        <IconFile size={13} />
                      </div>
                      <div className="hml-activity-body" style={{ minWidth: 0 }}>
                        <div className="hml-activity-title">{doc.title}</div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            marginTop: 3,
                            fontSize: 11,
                            color: "var(--hml-text-tertiary)",
                          }}
                        >
                          <span className={`hml-pill-mini ${pill.className}`}>
                            {pill.label}
                          </span>
                          <span>· {KIND_LABEL[doc.kind]}</span>
                          <span>· {relativeTime(doc.updatedAt)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {driveOnlyEntries.length > 0 && (
                  <SectionLabel
                    label="Drive only"
                    count={driveOnlyEntries.length}
                  />
                )}
                {driveOnlyEntries.map((node) => {
                  const url = driveNodeUrl(node);
                  return (
                    <a
                      key={node.id}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="hml-activity"
                      style={{ textDecoration: "none" }}
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <div className="hml-activity-icon">
                        <IconFile size={13} />
                      </div>
                      <div className="hml-activity-body">
                        <div className="hml-activity-title">{node.name}</div>
                      </div>
                      <div
                        style={{
                          opacity: 0.5,
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        <IconExternalLink size={13} />
                      </div>
                    </a>
                  );
                })}

                {orphanDocs.length > 0 && (
                  <>
                    <SectionLabel
                      label="Other / unmatched"
                      count={orphanDocs.length}
                    />
                    {orphanDocs.map((doc) => {
                      const pill = statusPill(doc);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setSelectedDocId(doc.id)}
                          className="hml-activity"
                          style={{
                            textDecoration: "none",
                            background: "none",
                            border: 0,
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                          title={
                            doc.driveFolderName
                              ? `Target folder: ${doc.driveFolderName}`
                              : "No matching Drive folder cached"
                          }
                        >
                          <div className="hml-activity-icon">
                            <IconFile size={13} />
                          </div>
                          <div
                            className="hml-activity-body"
                            style={{ minWidth: 0 }}
                          >
                            <div className="hml-activity-title">{doc.title}</div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                                marginTop: 3,
                                fontSize: 11,
                                color: "var(--hml-text-tertiary)",
                              }}
                            >
                              <span className={`hml-pill-mini ${pill.className}`}>
                                {pill.label}
                              </span>
                              <span>· {KIND_LABEL[doc.kind]}</span>
                              {doc.driveFolderName && (
                                <span>· {doc.driveFolderName}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {subfolders.length === 0 &&
                  docsInFolder.length === 0 &&
                  driveOnlyEntries.length === 0 &&
                  orphanDocs.length === 0 && (
                    <div className="hml-empty" style={{ padding: "30px 12px" }}>
                      <div className="hml-empty-sub">
                        This folder is empty. Use New Doc to create a document
                        here.
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--hml-text-tertiary)",
        padding: "10px 10px 4px",
      }}
    >
      {label} ({count})
    </div>
  );
}

interface BreadcrumbProps {
  trail: { id: string; name: string; depth: number }[];
  onJump: (depth: number) => void;
}

function Breadcrumb({ trail, onJump }: BreadcrumbProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
        fontSize: 13,
        color: "var(--hml-text-secondary)",
      }}
    >
      {trail.map((node, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span
            key={node.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {isLast ? (
              <span style={{ color: "var(--hml-text)", fontWeight: 500 }}>
                {node.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onJump(node.depth)}
                className="hml-link"
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--hml-text-secondary)",
                }}
              >
                {node.name}
              </button>
            )}
            {!isLast && (
              <span style={{ opacity: 0.5, display: "inline-flex" }}>
                <IconChevronRight size={12} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

interface TreeRowProps {
  node: DriveNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  rootLabel: string;
}

function TreeRow({
  node,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  rootLabel,
}: TreeRowProps) {
  const isFolder = node.type === "folder";
  if (!isFolder) return null;
  const isExpanded = expanded.has(node.id);
  const isActive = selectedId === node.id;
  const children = (node.children ?? []).filter((c) => c.type === "folder");
  const hasChildren = children.length > 0;
  const displayName = depth === 0 ? node.name || rootLabel : node.name;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 6px",
          paddingLeft: 6 + depth * 12,
          borderRadius: 4,
          background: isActive ? "var(--hml-bg-elev-2)" : "transparent",
          border: isActive
            ? "1px solid var(--hml-border)"
            : "1px solid transparent",
          cursor: "pointer",
          fontSize: 12.5,
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          style={{
            background: "none",
            border: 0,
            padding: 0,
            cursor: hasChildren ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            width: 14,
            color: "var(--hml-text-tertiary)",
            visibility: hasChildren ? "visible" : "hidden",
          }}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          <span
            style={{
              display: "inline-flex",
              transform: isExpanded ? "rotate(90deg)" : "none",
              transition: "transform 80ms ease",
            }}
          >
            <IconChevronRight size={11} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          style={{
            background: "none",
            border: 0,
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            minWidth: 0,
            color: isActive ? "var(--hml-text)" : "var(--hml-text-secondary)",
            fontWeight: isActive ? 500 : 400,
            textAlign: "left",
          }}
        >
          <span
            style={{ display: "inline-flex", color: "var(--hml-blue)" }}
          >
            <IconFolder size={12} />
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
        </button>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              rootLabel={rootLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
