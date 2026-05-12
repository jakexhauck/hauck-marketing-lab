import { useCallback, useEffect, useState } from "react";
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
  title = "PAST RESULTS",
  limit = 20,
}: Props) {
  const [items, setItems] = useState<GeneratorOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await api.listGeneratorOutputs(root, clientSlug, kind, limit);
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
          return (
            <button
              key={it.path}
              type="button"
              onClick={() => onSelect(it)}
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
                cursor: "pointer",
                color: "inherit",
                display: "grid",
                gap: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{it.title || "Untitled"}</span>
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
              </div>
              {it.summary && (
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-mid)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {it.summary}
                </span>
              )}
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  color: "var(--text-faint)",
                }}
              >
                {it.path.split(/[\\/]/).slice(-2).join("/")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
