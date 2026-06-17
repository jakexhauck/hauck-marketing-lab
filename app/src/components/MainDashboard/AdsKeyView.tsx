/**
 * AdsKeyView — reference cards Jake wants accessible from every client's Ads
 * Manager. Loads notes from vault/Knowledge/Ads Key/ and renders each as a
 * markdown card. Supports add / edit / delete in-app; writes flow back to
 * vault notes so the same set syncs across machines via the existing git-backed
 * vault.
 *
 * The "key" is global (same on every client), but mounted inside each client's
 * Ads section because that's where Jake reaches for it.
 */

import { Children, cloneElement, isValidElement, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../lib/tauri";
import type { NoteFront, VaultNote } from "../../lib/types";
import { IconChevronRight } from "../icons";

const ADS_KEY_PREFIX = "Knowledge/Ads Key/";

interface AdsKeyViewProps {
  root: string | null;
  onBack: () => void;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function noteOrder(n: VaultNote): number {
  const o = n.front.order;
  return typeof o === "number" ? o : 9999;
}

function noteTitle(n: VaultNote): string {
  if (typeof n.front.title === "string" && n.front.title.trim()) {
    return n.front.title;
  }
  const stem = n.rel_path.split("/").pop() ?? n.rel_path;
  return stem.replace(/\.md$/, "");
}

export function AdsKeyView({ root, onBack }: AdsKeyViewProps) {
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [vaultDir, setVaultDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!root) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const [all, dir] = await Promise.all([
        api.listVaultNotes(root),
        api.vaultRootPath(root),
      ]);
      setVaultDir(dir);
      const filtered = all.filter((n) =>
        n.rel_path.replace(/\\/g, "/").startsWith(ADS_KEY_PREFIX),
      );
      filtered.sort((a, b) => {
        const oa = noteOrder(a);
        const ob = noteOrder(b);
        if (oa !== ob) return oa - ob;
        return noteTitle(a).localeCompare(noteTitle(b));
      });
      setNotes(filtered);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const cards = useMemo(() => notes, [notes]);

  const handleStartCreate = () => {
    setCreating(true);
    setEditingPath(null);
    setDraftTitle("");
    setDraftBody("");
  };

  const handleStartEdit = (n: VaultNote) => {
    setCreating(false);
    setEditingPath(n.path);
    setDraftTitle(noteTitle(n));
    setDraftBody(n.body);
  };

  const handleCancel = () => {
    setCreating(false);
    setEditingPath(null);
    setDraftTitle("");
    setDraftBody("");
  };

  const handleSave = async () => {
    if (!root || !vaultDir) return;
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if (!title) {
      setErr("Title is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (editingPath) {
        const existing = notes.find((n) => n.path === editingPath);
        if (!existing) throw new Error("Note vanished");
        const front: NoteFront = {
          ...existing.front,
          title,
          type: existing.front.type ?? "ads-key",
        };
        await api.writeVaultNote(root, existing.path, front, body);
      } else {
        const slug = slugify(title);
        const path = `${vaultDir.replace(/\\/g, "/")}/Knowledge/Ads Key/${slug}.md`;
        const maxOrder = notes.reduce((m, n) => Math.max(m, noteOrder(n)), 0);
        const front: NoteFront = {
          title,
          type: "ads-key",
          tags: ["ads-key"],
          order: Math.max(50, maxOrder + 10),
        };
        await api.writeVaultNote(root, path, front, body);
      }
      handleCancel();
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (n: VaultNote) => {
    if (!root) return;
    if (!confirm(`Delete "${noteTitle(n)}"? This cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteVaultNote(root, n.path);
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const editing = creating || editingPath !== null;

  return (
    <div className="hml-content hml-ads-key">
      <style>{ADS_KEY_CSS}</style>

      <section className="hml-ads-key-header">
        <button type="button" className="hml-ads-key-back" onClick={onBack}>
          <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
            <IconChevronRight size={12} />
          </span>
          Back to Ads Manager
        </button>
        <div className="hml-ads-key-title-row">
          <div>
            <div className="hml-ads-key-eyebrow">Reference · Ads</div>
            <h1 className="hml-ads-key-title">Key</h1>
          </div>
          {!editing && (
            <button
              type="button"
              className="hml-ads-key-add"
              onClick={handleStartCreate}
              disabled={!root}
            >
              + Add new
            </button>
          )}
        </div>
      </section>

      {err && <div className="hml-ads-key-err" onClick={() => setErr(null)}>{err}</div>}

      {editing && (
        <section className="hml-ads-key-editor">
          <div className="hml-ads-key-editor-eyebrow">
            {creating ? "New entry" : "Editing"}
          </div>
          <input
            className="hml-ads-key-input"
            placeholder="Title (e.g. Audience targeting cheat sheet)"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            disabled={busy}
          />
          <textarea
            className="hml-ads-key-textarea"
            placeholder={"Markdown body. Tables, lists, bold, callouts (> [!tip]) all work.\n\nExample:\n\n| Term | Means |\n| --- | --- |\n| CPM | Cost per 1000 views |"}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={14}
            disabled={busy}
          />
          <div className="hml-ads-key-editor-actions">
            <button
              type="button"
              className="hml-ads-key-btn hml-ads-key-btn-ghost"
              onClick={handleCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hml-ads-key-btn hml-ads-key-btn-primary"
              onClick={() => void handleSave()}
              disabled={busy || draftTitle.trim().length === 0}
            >
              {busy ? "Saving…" : creating ? "Add entry" : "Save"}
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="hml-ads-key-loading">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="hml-ads-key-empty">
          <div className="hml-ads-key-empty-title">No entries yet</div>
          <div className="hml-ads-key-empty-sub">
            Click "Add new" to create your first reference card.
          </div>
        </div>
      ) : (
        <section className="hml-ads-key-grid">
          {cards.map((n) => (
            <KeyCard
              key={n.path}
              note={n}
              onEdit={() => handleStartEdit(n)}
              onDelete={() => void handleDelete(n)}
              disabled={busy}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function KeyCard({
  note,
  onEdit,
  onDelete,
  disabled,
}: {
  note: VaultNote;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <article className="hml-ads-key-card">
      <header className="hml-ads-key-card-head">
        <h2 className="hml-ads-key-card-title">{noteTitle(note)}</h2>
        <div className="hml-ads-key-card-actions">
          <button
            type="button"
            className="hml-ads-key-card-btn"
            onClick={onEdit}
            disabled={disabled}
            title="Edit"
          >
            Edit
          </button>
          <button
            type="button"
            className="hml-ads-key-card-btn hml-ads-key-card-btn-danger"
            onClick={onDelete}
            disabled={disabled}
            title="Delete"
          >
            Delete
          </button>
        </div>
      </header>
      <div className="hml-ads-key-card-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            blockquote: ({ children, ...props }) => (
              <BlockquoteCallout {...props}>{children}</BlockquoteCallout>
            ),
          }}
        >
          {note.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}

/**
 * Render `> [!type] Title` callouts (Obsidian-style) with severity color.
 * Falls back to a plain blockquote when no `[!type]` tag is present.
 */
function BlockquoteCallout({ children }: { children?: ReactNode }) {
  const flat = flattenChildren(children);
  const match = /^\s*\[!(\w+)\]\s*([^\n]*)/.exec(flat);
  if (!match) {
    return <blockquote className="hml-ads-key-quote">{children}</blockquote>;
  }
  const kind = match[1].toLowerCase();
  const heading = match[2].trim();
  const cls = ((): string => {
    if (kind === "danger" || kind === "error" || kind === "fail") return "hml-cal-red";
    if (kind === "warning" || kind === "warn" || kind === "caution") return "hml-cal-amber";
    if (kind === "tip" || kind === "success" || kind === "note") return "hml-cal-green";
    return "hml-cal-neutral";
  })();
  const [stripped] = stripCalloutHeader(children);
  return (
    <div className={`hml-ads-key-callout ${cls}`}>
      {heading && <div className="hml-ads-key-callout-head">{heading}</div>}
      <div className="hml-ads-key-callout-body">{stripped}</div>
    </div>
  );
}

function flattenChildren(node: ReactNode): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return flattenChildren(props?.children);
  }
  return "";
}

const CALLOUT_RE = /^\s*\[!\w+\][^\n]*\n?/;

/**
 * Remove the `[!type] Title` prefix from the first text node of the children
 * tree so the callout body doesn't repeat it. Returns the (possibly cloned)
 * tree along with whether anything was stripped.
 */
function stripCalloutHeader(node: ReactNode): [ReactNode, boolean] {
  if (Array.isArray(node)) {
    const out: ReactNode[] = [];
    let stripped = false;
    for (const child of node) {
      if (stripped) {
        out.push(child);
        continue;
      }
      const [next, didStrip] = stripCalloutHeader(child);
      out.push(next);
      if (didStrip) stripped = true;
    }
    return [out, stripped];
  }
  if (typeof node === "string") {
    if (CALLOUT_RE.test(node)) {
      return [node.replace(CALLOUT_RE, ""), true];
    }
    return [node, false];
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    const inner = el.props.children;
    if (inner === undefined) return [node, false];
    const childArr = Children.toArray(inner);
    const [nextChildren, didStrip] = stripCalloutHeader(childArr);
    if (!didStrip) return [node, false];
    return [cloneElement(el, undefined, nextChildren as ReactNode), true];
  }
  return [node, false];
}

const ADS_KEY_CSS = `
.hml-ads-key { padding-bottom: 48px; }
.hml-ads-key-header { margin-bottom: 22px; }
.hml-ads-key-back {
  background: transparent;
  border: 0;
  color: var(--hml-text-tertiary, var(--c-faint));
  font-family: inherit;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  padding: 0;
  margin-bottom: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.hml-ads-key-back:hover { color: var(--hml-text-primary, var(--c-text)); }
.hml-ads-key-title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.hml-ads-key-eyebrow {
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary, var(--c-faint));
  margin-bottom: 6px;
}
.hml-ads-key-title {
  font-family: var(--hml-font-sans);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--hml-text-primary, var(--c-text));
}
.hml-ads-key-add {
  background: color-mix(in srgb, var(--brand) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand) 45%, transparent);
  color: var(--brand-bright);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 12.5px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.hml-ads-key-add:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand) 28%, transparent);
}
.hml-ads-key-add:disabled { opacity: 0.4; cursor: not-allowed; }

.hml-ads-key-err {
  padding: 10px 14px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  border-radius: 8px;
  color: var(--danger);
  font-size: 12px;
  margin-bottom: 14px;
  cursor: pointer;
}
.hml-ads-key-loading,
.hml-ads-key-empty {
  padding: 40px 24px;
  text-align: center;
  color: var(--hml-text-tertiary);
  background: var(--hml-bg-elev-1, var(--surface));
  border: 1px dashed var(--hml-border, var(--c-border));
  border-radius: 10px;
}
.hml-ads-key-empty-title { font-size: 14px; color: var(--hml-text-primary); margin-bottom: 4px; }
.hml-ads-key-empty-sub { font-size: 12px; }

.hml-ads-key-editor {
  background: var(--hml-bg-elev-1, var(--surface));
  border: 1px solid var(--hml-border, var(--c-border));
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hml-ads-key-editor-eyebrow {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
}
.hml-ads-key-input,
.hml-ads-key-textarea {
  background: var(--hml-bg-elev-2, var(--surface-2));
  border: 1px solid var(--hml-border, var(--c-border));
  color: var(--hml-text-primary);
  font-family: inherit;
  font-size: 13px;
  border-radius: 6px;
  padding: 9px 11px;
  outline: none;
}
.hml-ads-key-input:focus,
.hml-ads-key-textarea:focus {
  border-color: color-mix(in srgb, var(--brand) 45%, transparent);
}
.hml-ads-key-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  min-height: 180px;
  resize: vertical;
}
.hml-ads-key-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.hml-ads-key-btn {
  border-radius: 6px;
  padding: 7px 14px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}
.hml-ads-key-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.hml-ads-key-btn-ghost {
  background: transparent;
  border-color: var(--hml-border, var(--c-border));
  color: var(--hml-text-secondary);
}
.hml-ads-key-btn-ghost:hover:not(:disabled) {
  background: var(--hml-bg-elev-2, var(--surface-2));
  color: var(--hml-text-primary);
}
.hml-ads-key-btn-primary {
  background: color-mix(in srgb, var(--brand) 22%, transparent);
  border-color: color-mix(in srgb, var(--brand) 50%, transparent);
  color: var(--brand-bright);
}
.hml-ads-key-btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand) 32%, transparent);
}

.hml-ads-key-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 14px;
}
.hml-ads-key-card {
  background: var(--hml-bg-elev-1, var(--surface));
  border: 1px solid var(--hml-border, var(--c-border));
  border-radius: 10px;
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hml-ads-key-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--hml-border-subtle, var(--c-divider));
  padding-bottom: 10px;
}
.hml-ads-key-card-title {
  font-family: var(--hml-font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--hml-text-primary);
  margin: 0;
  letter-spacing: -0.005em;
}
.hml-ads-key-card-actions { display: inline-flex; gap: 6px; flex-shrink: 0; }
.hml-ads-key-card-btn {
  background: transparent;
  border: 1px solid var(--hml-border, var(--c-border));
  color: var(--hml-text-tertiary);
  border-radius: 5px;
  padding: 3px 9px;
  font-family: inherit;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.hml-ads-key-card-btn:hover:not(:disabled) {
  background: var(--hml-bg-elev-2, var(--surface-2));
  color: var(--hml-text-primary);
}
.hml-ads-key-card-btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  color: var(--danger);
}
.hml-ads-key-card-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.hml-ads-key-card-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--hml-text-secondary, var(--c-muted));
}
.hml-ads-key-card-body h1,
.hml-ads-key-card-body h2,
.hml-ads-key-card-body h3,
.hml-ads-key-card-body h4 {
  font-family: var(--hml-font-sans);
  color: var(--hml-text-primary);
  margin: 14px 0 6px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.hml-ads-key-card-body h3 { font-size: 13.5px; color: var(--brand); }
.hml-ads-key-card-body h4 { font-size: 12.5px; color: var(--brand); }
.hml-ads-key-card-body p { margin: 6px 0; }
.hml-ads-key-card-body ul,
.hml-ads-key-card-body ol { margin: 6px 0; padding-left: 20px; }
.hml-ads-key-card-body li { margin: 3px 0; }
.hml-ads-key-card-body strong { color: var(--hml-text-primary); font-weight: 600; }
.hml-ads-key-card-body em { color: var(--hml-text-tertiary); font-style: normal; opacity: 0.85; }
.hml-ads-key-card-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  background: var(--hml-bg-elev-2, var(--surface-2));
  padding: 1px 5px;
  border-radius: 3px;
}
.hml-ads-key-card-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12.5px;
}
.hml-ads-key-card-body th,
.hml-ads-key-card-body td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--hml-border-subtle, var(--c-divider));
  vertical-align: top;
}
.hml-ads-key-card-body th {
  color: var(--brand);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 500;
  border-bottom-color: color-mix(in srgb, var(--brand) 25%, transparent);
}
.hml-ads-key-card-body td:first-child {
  font-weight: 500;
  color: var(--hml-text-primary);
  white-space: nowrap;
}
.hml-ads-key-card-body ol {
  counter-reset: kc;
  list-style: none;
  padding-left: 0;
}
.hml-ads-key-card-body ol > li {
  counter-increment: kc;
  position: relative;
  padding: 10px 12px 10px 42px;
  margin: 6px 0;
  background: var(--hml-bg-elev-2, var(--surface-2));
  border: 1px solid var(--hml-border-subtle, var(--c-divider));
  border-left: 3px solid color-mix(in srgb, var(--brand) 55%, transparent);
  border-radius: 6px;
}
.hml-ads-key-card-body ol > li::before {
  content: counter(kc);
  position: absolute;
  left: 12px;
  top: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  border-radius: 999px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.hml-ads-key-quote {
  border-left: 3px solid var(--hml-border, var(--c-border-strong));
  padding: 4px 12px;
  margin: 8px 0;
  color: var(--hml-text-tertiary);
  font-style: italic;
}

.hml-ads-key-callout {
  margin: 8px 0;
  padding: 10px 14px;
  border-radius: 7px;
  border: 1px solid;
  background: var(--hml-bg-elev-2, var(--surface-2));
  position: relative;
}
.hml-ads-key-callout::before {
  content: "";
  position: absolute;
  left: 14px;
  top: 17px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.hml-ads-key-callout-head {
  font-weight: 600;
  color: var(--hml-text-primary);
  font-size: 12.5px;
  padding-left: 16px;
  margin-bottom: 4px;
}
.hml-ads-key-callout-body { padding-left: 16px; font-size: 12.5px; }
.hml-ads-key-callout-body p { margin: 3px 0; }
.hml-ads-key-callout.hml-cal-red {
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border-color: color-mix(in srgb, var(--danger) 32%, transparent);
}
.hml-ads-key-callout.hml-cal-red::before { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent); }
.hml-ads-key-callout.hml-cal-amber {
  background: color-mix(in srgb, var(--warning) 6%, transparent);
  border-color: color-mix(in srgb, var(--warning) 32%, transparent);
}
.hml-ads-key-callout.hml-cal-amber::before { background: var(--warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 18%, transparent); }
.hml-ads-key-callout.hml-cal-green {
  background: color-mix(in srgb, var(--positive) 6%, transparent);
  border-color: color-mix(in srgb, var(--positive) 32%, transparent);
}
.hml-ads-key-callout.hml-cal-green::before { background: var(--positive); box-shadow: 0 0 0 3px color-mix(in srgb, var(--positive) 18%, transparent); }
.hml-ads-key-callout.hml-cal-neutral {
  background: var(--hml-bg-elev-2, var(--surface-2));
  border-color: var(--hml-border, var(--c-border));
}
.hml-ads-key-callout.hml-cal-neutral::before { background: var(--hml-text-tertiary); }
`;
