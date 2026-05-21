import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type { GeneratorOutput, GeneratorKind } from "../../lib/types";

type Props = {
  root: string;
  clientSlug: string;
  kind: GeneratorKind;
  /** Bump this number whenever the parent saves a new output to force a reload. */
  refreshKey?: number;
  /** Path of the currently-displayed output (so it can be highlighted). */
  activePath?: string | null;
  onSelect: (output: GeneratorOutput) => void;
  /** Fired after a row is deleted. Parent can use this to clear the active
   *  output if it was the one removed. */
  onDelete?: (path: string) => void;
  /** Fired after a row is renamed. Parent can sync its active output title. */
  onRename?: (path: string, newTitle: string) => void;
  /** Override the panel title; defaults to "PAST RESULTS". */
  title?: string;
  limit?: number;
};

function formatStamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PastResults({
  root,
  clientSlug,
  kind,
  refreshKey = 0,
  activePath,
  onSelect,
  onDelete,
  onRename,
  title = "PAST RESULTS",
  limit = 20,
}: Props) {
  const [items, setItems] = useState<GeneratorOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const beginRename = useCallback((output: GeneratorOutput) => {
    setRenamingPath(output.path);
    setRenameDraft(output.title || "");
  }, []);

  const cancelRename = useCallback(() => {
    if (renameSaving) return;
    setRenamingPath(null);
    setRenameDraft("");
  }, [renameSaving]);

  const commitRename = useCallback(
    async (output: GeneratorOutput) => {
      const next = renameDraft.trim();
      if (!next || next === output.title) {
        setRenamingPath(null);
        return;
      }
      setRenameSaving(true);
      try {
        await api.renameGeneratorOutput(root, output.path, next);
        setItems((prev) =>
          prev.map((it) => (it.path === output.path ? { ...it, title: next } : it)),
        );
        onRename?.(output.path, next);
        setRenamingPath(null);
        setRenameDraft("");
      } catch (e) {
        setErr(String(e));
      } finally {
        setRenameSaving(false);
      }
    },
    [renameDraft, root, onRename],
  );

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  const handleDelete = useCallback(
    async (output: GeneratorOutput) => {
      const label = output.title?.trim() || "this result";
      const ok = window.confirm(`Delete "${label}"? This cannot be undone.`);
      if (!ok) return;
      setDeleting(output.path);
      try {
        await api.deleteGeneratorOutput(root, output.path);
        setItems((prev) => prev.filter((it) => it.path !== output.path));
        onDelete?.(output.path);
      } catch (e) {
        setErr(String(e));
      } finally {
        setDeleting(null);
      }
    },
    [root, onDelete],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list =
        kind === "html"
          ? await api.listPitchDecks(root, clientSlug, limit)
          : await api.listGeneratorOutputs(root, clientSlug, kind, limit);
      setItems(list);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [root, clientSlug, kind, limit]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  if (!loading && items.length === 0 && !err) return null;

  return (
    <section className="panel reveal reveal-4" style={{ marginBottom: 32 }}>
      <div className="panel-head">
        <span className="panel-title">▸ {title}</span>
        <span className="panel-meta">
          {loading ? "loading…" : `${items.length} saved`}
        </span>
      </div>
      {err && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--signal-stop)",
            marginBottom: 8,
          }}
        >
          {err}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((it) => {
          const isActive = activePath && it.path === activePath;
          const isDeleting = deleting === it.path;
          const isRenaming = renamingPath === it.path;
          return (
            <div
              key={it.path}
              role={isRenaming ? undefined : "button"}
              tabIndex={isRenaming ? undefined : 0}
              onClick={isRenaming ? undefined : () => onSelect(it)}
              onKeyDown={(e) => {
                if (isRenaming) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(it);
                }
              }}
              className="past-result-row"
              style={{
                textAlign: "left",
                background: isActive
                  ? "rgba(95, 230, 153, 0.06)"
                  : "var(--surface-1, rgba(255,255,255,0.02))",
                border: `1px solid ${
                  isActive ? "rgba(95, 230, 153, 0.35)" : "var(--border, rgba(255,255,255,0.08))"
                }`,
                borderRadius: 6,
                padding: "10px 12px",
                cursor: isRenaming ? "default" : "pointer",
                color: "inherit",
                display: "grid",
                gap: 4,
                opacity: isDeleting ? 0.5 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameDraft}
                    disabled={renameSaving}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename(it);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => {
                      if (!renameSaving) void commitRename(it);
                    }}
                    style={{
                      flex: 1,
                      fontWeight: 600,
                      fontSize: 14,
                      background: "var(--surface-2, rgba(255,255,255,0.04))",
                      border: "1px solid var(--accent, rgba(95, 230, 153, 0.5))",
                      borderRadius: 4,
                      color: "inherit",
                      padding: "4px 8px",
                      outline: "none",
                    }}
                  />
                ) : (
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {it.title || "Untitled"}
                  </span>
                )}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {!isRenaming && (
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-faint)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatStamp(it.created_at)}
                    </span>
                  )}
                  {!isRenaming && (
                    <button
                      type="button"
                      aria-label="Rename this result"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginRename(it);
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border, rgba(255,255,255,0.08))",
                        borderRadius: 4,
                        color: "var(--text-faint)",
                        cursor: "pointer",
                        fontSize: 12,
                        lineHeight: 1,
                        padding: "3px 7px",
                      }}
                    >
                      Rename
                    </button>
                  )}
                  {!isRenaming && (
                    <button
                      type="button"
                      aria-label="Delete this result"
                      title="Delete this result"
                      disabled={isDeleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(it);
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border, rgba(255,255,255,0.08))",
                        borderRadius: 4,
                        color: "var(--text-faint)",
                        cursor: isDeleting ? "wait" : "pointer",
                        fontSize: 14,
                        lineHeight: 1,
                        padding: "2px 7px",
                      }}
                    >
                      {isDeleting ? "…" : "×"}
                    </button>
                  )}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  color: "var(--text-faint)",
                }}
              >
                {it.path.split(/[\\/]/).slice(-2).join("/")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
