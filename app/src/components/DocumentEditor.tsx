/**
 * Per-document editor. Used inside ClientDocuments (per-client tab) and
 * later by the global Documents page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ClientDoc, DocKind } from "../lib/types";
import { api } from "../lib/tauri";
import { parseDriveFolders, type DriveFolder } from "../lib/driveIndex";

interface DocumentEditorProps {
  root: string;
  clientSlug: string;
  docId: string;
  /** Fires after every successful save / rename / folder-change. */
  onUpdated?: (doc: ClientDoc) => void;
  /** Fires after a confirmed delete. */
  onDeleted?: (docId: string) => void;
}

type SaveState = "idle" | "saving" | "saved";
type DriveState = "idle" | "pushing" | "pulling";

const KIND_LABEL: Record<DocKind, string> = {
  "ad-copy": "Ad Copy",
  brief: "Brief",
  notes: "Notes",
  report: "Report",
  other: "Other",
};

function statusChip(doc: ClientDoc | null): {
  label: string;
  className: string;
} {
  if (!doc) return { label: "Loading…", className: "hml-neutral" };
  if (doc.currentVersion === 0) return { label: "Unsynced", className: "hml-neutral" };
  if (doc.isDirty) return { label: "Dirty", className: "hml-amber" };
  return { label: "Synced", className: "hml-green" };
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

export function DocumentEditor({
  root,
  clientSlug,
  docId,
  onUpdated,
  onDeleted,
}: DocumentEditorProps) {
  const [doc, setDoc] = useState<ClientDoc | null>(null);
  const [body, setBody] = useState<string>("");
  const [titleDraft, setTitleDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPull, setConfirmPull] = useState(false);
  const [driveState, setDriveState] = useState<DriveState>("idle");

  const saveTimer = useRef<number | null>(null);
  const initialBody = useRef<string>("");

  // Load doc + Drive index when the selection changes.
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setBody("");
    setError(null);
    setSaveState("idle");

    (async () => {
      try {
        const loaded = await api.readClientDoc(root, clientSlug, docId);
        if (cancelled) return;
        setDoc(loaded);
        setBody(loaded.body);
        initialBody.current = loaded.body;
        setTitleDraft(loaded.title);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }

      try {
        const idx = await api.readDriveIndex(root, clientSlug);
        if (cancelled) return;
        setFolders(idx ? parseDriveFolders(idx.body) : []);
      } catch {
        if (!cancelled) setFolders([]);
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [root, clientSlug, docId]);

  // Debounced body save.
  useEffect(() => {
    if (!doc) return;
    if (body === initialBody.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        setSaveState("saving");
        try {
          const updated = await api.updateClientDocBody(
            root,
            clientSlug,
            docId,
            body,
          );
          setDoc(updated);
          initialBody.current = body;
          setSaveState("saved");
          onUpdated?.(updated);
          window.setTimeout(() => setSaveState("idle"), 1200);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setSaveState("idle");
        }
      })();
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [body, doc, root, clientSlug, docId, onUpdated]);

  const commitTitle = async () => {
    if (!doc) return;
    const next = titleDraft.trim();
    if (!next || next === doc.title) {
      setTitleDraft(doc.title);
      return;
    }
    try {
      const updated = await api.renameClientDoc(root, clientSlug, docId, next);
      setDoc(updated);
      setTitleDraft(updated.title);
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTitleDraft(doc.title);
    }
  };

  const commitFolder = async (folderId: string) => {
    if (!doc) return;
    if (!folderId) {
      try {
        const updated = await api.setClientDocTargetFolder(
          root,
          clientSlug,
          docId,
          null,
          null,
        );
        setDoc(updated);
        onUpdated?.(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    const match = folders.find((f) => f.id === folderId);
    if (!match) return;
    try {
      const updated = await api.setClientDocTargetFolder(
        root,
        clientSlug,
        docId,
        match.id,
        match.name,
      );
      setDoc(updated);
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doDelete = async () => {
    try {
      await api.deleteClientDoc(root, clientSlug, docId);
      onDeleted?.(docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmDelete(false);
    }
  };

  const openInDocs = () => {
    if (!doc?.currentDriveUrl) return;
    window.open(doc.currentDriveUrl, "_blank", "noopener,noreferrer");
  };

  // Push: flushes any pending body save first, then converts to a Google Doc.
  const doPush = async () => {
    if (!doc) return;
    setError(null);
    setDriveState("pushing");
    try {
      // Flush pending body changes before we hand off to claude -p.
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (body !== initialBody.current) {
        const flushed = await api.updateClientDocBody(root, clientSlug, docId, body);
        setDoc(flushed);
        initialBody.current = body;
      }
      const summary = await api.pushClientDocToDrive(root, clientSlug, docId);
      // Refresh full doc so the body field stays in sync (sync state changed).
      const refreshed = await api.readClientDoc(root, clientSlug, docId);
      setDoc(refreshed);
      setBody(refreshed.body);
      initialBody.current = refreshed.body;
      onUpdated?.(refreshed);
      void summary;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDriveState("idle");
    }
  };

  const doPull = async () => {
    if (!doc) return;
    setConfirmPull(false);
    setError(null);
    setDriveState("pulling");
    try {
      const refreshed = await api.pullClientDocFromDrive(
        root,
        clientSlug,
        docId,
        true, // always back up the local body before overwriting
      );
      setDoc(refreshed);
      setBody(refreshed.body);
      initialBody.current = refreshed.body;
      onUpdated?.(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDriveState("idle");
    }
  };

  const chip = statusChip(doc);
  const versionLabel = doc && doc.currentVersion > 0 ? `v${doc.currentVersion}` : "v0";
  const syncedLabel = useMemo(() => {
    if (!doc) return null;
    if (!doc.syncedAt) return "never pushed";
    return `synced ${relativeTime(doc.syncedAt)}`;
  }, [doc]);

  if (error && !doc) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't open document</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-sub">Loading document…</div>
      </div>
    );
  }

  return (
    <div className="hml-panel" style={{ display: "flex", flexDirection: "column" }}>
      <div
        className="hml-panel-header"
        style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
          }}
        >
          <input
            className="hml-form-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Document title"
            style={{ flex: 1, fontSize: 15, fontWeight: 600 }}
          />
          <select
            className="hml-form-input"
            value={doc.kind}
            disabled
            title="Kind is read-only in v1"
            style={{ width: 140 }}
          >
            {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <select
            className="hml-form-input"
            value={doc.driveFolderId ?? ""}
            onChange={(e) => void commitFolder(e.target.value)}
            style={{ width: 180 }}
            title={
              folders.length === 0
                ? "No subfolders available; using client root folder."
                : "Drive subfolder for this document"
            }
          >
            <option value="">
              {folders.length === 0 ? "Client root folder" : "Client root folder"}
            </option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12,
            color: "var(--hml-text-secondary)",
          }}
        >
          <span className={`hml-pill ${chip.className}`}>
            <span className="hml-pill-dot" />
            {chip.label}
          </span>
          <span>{versionLabel}</span>
          {syncedLabel && <span>· {syncedLabel}</span>}
          {doc.unsweptOrphanCount > 0 && (
            <span style={{ color: "var(--hml-amber)" }}>
              · {doc.unsweptOrphanCount} orphan{doc.unsweptOrphanCount === 1 ? "" : "s"}
            </span>
          )}
          <span style={{ marginLeft: "auto", minWidth: 60, textAlign: "right" }}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : ""}
          </span>
        </div>
      </div>

      <div
        className="hml-panel-body"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          padding: "12px 16px",
          minHeight: 360,
        }}
      >
        <textarea
          className="hml-form-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your document in Markdown…"
          style={{
            minHeight: 360,
            fontFamily: "var(--hml-font-mono, ui-monospace, monospace)",
            fontSize: 13,
            lineHeight: 1.55,
            resize: "vertical",
          }}
        />
        <div
          className="form-out-md"
          style={{
            minHeight: 360,
            padding: "10px 14px",
            border: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.06))",
            background: "var(--hml-bg-elev-1)",
            overflow: "auto",
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--hml-text)",
          }}
        >
          {body.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          ) : (
            <span style={{ color: "var(--hml-text-tertiary)" }}>
              Preview appears here as you type.
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          className="hml-error-banner"
          style={{ margin: "0 16px 12px", fontSize: 12 }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 16px 14px",
          borderTop: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.06))",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="hml-btn hml-accent"
          onClick={() => void doPush()}
          disabled={driveState !== "idle" || body.trim().length === 0}
          title={
            body.trim().length === 0
              ? "Add some content first."
              : doc.currentVersion === 0
                ? "Create a Google Doc in the chosen Drive folder."
                : "Replace the existing Google Doc with this version."
          }
        >
          {driveState === "pushing" ? "Pushing…" : "Push to Drive"}
        </button>
        <button
          type="button"
          className="hml-btn"
          onClick={openInDocs}
          disabled={!doc.currentDriveUrl}
          title={
            doc.currentDriveUrl
              ? "Open the live Google Doc in a new window"
              : "Push to Drive first to get a Doc URL"
          }
        >
          Open in Docs
        </button>
        <button
          type="button"
          className="hml-btn"
          onClick={() => setConfirmPull(true)}
          disabled={driveState !== "idle" || !doc.currentDriveFileId}
          title={
            doc.currentDriveFileId
              ? "Read the live Doc content back into this editor."
              : "Push to Drive first; nothing to pull yet."
          }
        >
          {driveState === "pulling" ? "Pulling…" : "Pull from Drive"}
        </button>
        <button
          type="button"
          className="hml-btn hml-danger"
          onClick={() => setConfirmDelete(true)}
          style={{ marginLeft: "auto" }}
        >
          Delete
        </button>
      </div>

      {confirmPull && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setConfirmPull(false)}
        >
          <div
            className="hml-panel"
            style={{ minWidth: 360, maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span className="hml-dot" style={{ background: "var(--hml-amber)" }} />
                Pull from Drive?
              </div>
            </div>
            <div className="hml-panel-body" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                This replaces the local body with whatever is currently in the
                Google Doc. Your existing local copy will be saved to
                <code style={{ margin: "0 4px" }}>Docs/.backup/</code>
                before being overwritten. Formatting may simplify on the way back.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="hml-btn"
                  onClick={() => setConfirmPull(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="hml-btn hml-accent"
                  onClick={() => void doPull()}
                >
                  Pull
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="hml-panel"
            style={{ minWidth: 360, maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span className="hml-dot" style={{ background: "var(--hml-amber)" }} />
                Delete document?
              </div>
            </div>
            <div className="hml-panel-body" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                This removes the local file for "{doc.title}". Any Drive copies
                stay where they are.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="hml-btn"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="hml-btn hml-danger"
                  onClick={() => void doDelete()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
