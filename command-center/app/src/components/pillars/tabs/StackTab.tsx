import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Pillar } from "../../../lib/pillars";
import { STACK_CATEGORIES, STACK_TOOLS, type StackTool } from "../../../lib/stackData";

// Tab contents only (the parent pillar page provides the page wrapper, header,
// and pk-root). The software inventory from lib/stackData, grouped by category,
// with a filter by who runs each tool. Reuses the AdminStack rendering idiom but
// as tab content with no page header. Scoped styles are prefixed .stk2-.

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

export default function StackTab({ pillar }: { pillar: Pillar }) {
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
    <div className="stk2-root" data-pillar={pillar.id}>
      <Stk2Style />

      <div className="stk2-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`stk2-pill${filter === f.key ? " is-on" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="stk2-empty">No tools match that filter.</div>
      ) : (
        groups.map(({ cat, tools }) => (
          <section className="pk-section" key={cat}>
            <div className="pk-section-h">
              {cat} ({tools.length})
            </div>
            <div className="stk2-cat">
              {tools.map((t) => (
                <div className="stk2-row" key={t.name}>
                  <div className="stk2-l">
                    <span className="stk2-name">{t.name}</span>
                    <span className="stk2-what">{t.what}</span>
                  </div>
                  <div className="stk2-r">
                    <span className="stk2-chips">
                      {t.used_by.map((u) => (
                        <span className="stk2-chip" key={u}>{USED_BY_LABEL[u]}</span>
                      ))}
                    </span>
                    {t.url && (
                      <a
                        className="stk2-open"
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
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Stk2Style() {
  return (
    <style>{`
      .stk2-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .stk2-pill { padding: 8px 16px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .16s, color .16s, border-color .16s; }
      .stk2-pill:hover { color: var(--text); }
      .stk2-pill.is-on { background: var(--brand); color: var(--brand-fg); border-color: var(--brand); }
      .stk2-cat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
      .stk2-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; border-bottom: 1px solid var(--divider); transition: background .16s; }
      .stk2-row:last-child { border-bottom: none; }
      .stk2-row:hover { background: var(--surface-2); }
      .stk2-l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .stk2-name { font-family: var(--font-display); font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: var(--text); }
      .stk2-what { color: var(--text-muted); font-size: 13px; line-height: 1.45; }
      .stk2-r { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .stk2-chips { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .stk2-chip { font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; color: var(--brand-text); background: var(--brand-tint); }
      .stk2-open { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: var(--text-faint); border: 1px solid var(--border); background: var(--surface); transition: color .16s, border-color .16s; flex-shrink: 0; }
      .stk2-open:hover { color: var(--brand-text); border-color: var(--brand); }
      .stk2-empty { text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 14px; }
    `}</style>
  );
}
