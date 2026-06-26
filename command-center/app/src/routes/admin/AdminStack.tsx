import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { STACK_CATEGORIES, STACK_TOOLS, type StackTool } from "../../lib/stackData";

// Software inventory page inside the admin console. Self-contained: a scoped
// <style> block under .stk-root reads the shared admin theme tokens, so it
// follows the neutral light/dark theme with green as an accent, matching the
// SOP Hub. Data is the static seed in lib/stackData.ts. A filter row narrows the
// list by who runs each tool (agency / jake / hermes).

type Filter = "all" | "agency" | "jake" | "hermes";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "agency", label: "Agency" },
  { key: "jake", label: "Jake" },
  { key: "hermes", label: "Hermes" },
];

const USED_BY_LABEL: Record<StackTool["used_by"][number], string> = {
  agency: "Agency",
  jake: "Jake",
  hermes: "Hermes",
};

export default function AdminStack() {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () =>
      filter === "all"
        ? STACK_TOOLS
        : STACK_TOOLS.filter((t) => t.used_by.includes(filter)),
    [filter],
  );

  const groups = useMemo(
    () =>
      STACK_CATEGORIES.map((cat) => ({
        cat,
        tools: visible.filter((t) => t.category === cat),
      })).filter((g) => g.tools.length > 0),
    [visible],
  );

  return (
    <div className="stk-root">
      <StkStyle />
      <header className="stk-head">
        <div>
          <h1 className="stk-title">Stack</h1>
          <p className="stk-sub">Every piece of software the agency, Jake, and Hermes run.</p>
        </div>
        <div className="stk-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`stk-pill${filter === f.key ? " is-on" : ""}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="stk-empty">No tools match that filter.</div>
      ) : (
        groups.map(({ cat, tools }) => (
          <section className="stk-cat" key={cat}>
            <div className="stk-cat-head">
              <h2>{cat}</h2>
              <span className="stk-count">{tools.length} tool{tools.length === 1 ? "" : "s"}</span>
            </div>
            {tools.map((t) => (
              <div className="stk-row" key={t.name}>
                <div className="stk-l">
                  <span className="stk-name">{t.name}</span>
                  <span className="stk-what">{t.what}</span>
                </div>
                <div className="stk-r">
                  <span className="stk-chips">
                    {t.used_by.map((u) => (
                      <span className="stk-chip" key={u}>{USED_BY_LABEL[u]}</span>
                    ))}
                  </span>
                  {t.url && (
                    <a
                      className="stk-open"
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open ${t.name}`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

// Scoped style for the Stack page. Reads the shared admin theme tokens so the
// page follows the neutral light/dark theme with green as an accent, matching
// the rest of the console. Each category renders as a calm surface card.
function StkStyle() {
  return (
    <style>{`
      .stk-root {
        color: var(--text); font-family: var(--font-body);
        padding: 28px 36px 60px; min-height: 100%;
        max-width: 1280px; margin: 0 auto;
      }
      .stk-root *, .stk-root *::before, .stk-root *::after { box-sizing: border-box; }
      .stk-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 6px; }
      .stk-title { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.03em; }
      .stk-sub { color: var(--text-muted); font-size: 14px; margin-top: 6px; }
      .stk-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .stk-pill { padding: 8px 16px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .16s, color .16s, border-color .16s; }
      .stk-pill:hover { color: var(--text); }
      .stk-pill.is-on { background: var(--brand); color: var(--brand-fg); border-color: var(--brand); }
      .stk-cat { margin-top: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
      .stk-cat-head { display: flex; align-items: center; gap: 11px; padding: 16px 22px; border-bottom: 1px solid var(--divider); }
      .stk-cat-head h2 { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
      .stk-count { margin-left: auto; color: var(--text-muted); font-size: 12px; font-weight: 600; background: var(--surface-2); border-radius: 999px; padding: 3px 10px; }
      .stk-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 22px; border-bottom: 1px solid var(--divider); transition: background .16s; }
      .stk-row:last-child { border-bottom: none; }
      .stk-row:hover { background: var(--surface-2); }
      .stk-l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .stk-name { font-family: var(--font-display); font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: var(--text); }
      .stk-what { color: var(--text-muted); font-size: 13px; line-height: 1.45; }
      .stk-r { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .stk-chips { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .stk-chip { font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; color: var(--brand-text); background: var(--brand-tint); }
      .stk-open { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: var(--text-faint); border: 1px solid var(--border); background: var(--surface); transition: color .16s, border-color .16s; flex-shrink: 0; }
      .stk-open:hover { color: var(--brand-text); border-color: var(--brand); }
      .stk-empty { text-align: center; color: var(--text-muted); padding: 60px 0; font-size: 14px; }
    `}</style>
  );
}
