/**
 * AdCopyQCChecklist — manual review checklist that floats on the right
 * edge of the screen whenever ad copy is being generated or reviewed.
 *
 * Five fixed quality checks Jake runs against every batch before picking
 * what goes live. Checkboxes are session-local — they reset each time the
 * form is run again, since the checklist is a per-review tool, not a
 * persisted artifact.
 */

import { useState } from "react";

type Item = {
  num: number;
  title: string;
  hint: string;
};

const ITEMS: Item[] = [
  {
    num: 1,
    title: "Read Aloud",
    hint: "Would you say this to a friend?",
  },
  {
    num: 2,
    title: "Check Hook",
    hint: "First line = scroll stopper?",
  },
  {
    num: 3,
    title: "Kill AI Words",
    hint: "Elevate, transform, seamless → delete",
  },
  {
    num: 4,
    title: "Add Specifics",
    hint: '"$12.99" beats "affordable"',
  },
  {
    num: 5,
    title: "Match Voice",
    hint: "Sound like the brand, not AI",
  },
];

export function AdCopyQCChecklist() {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const toggle = (n: number) =>
    setChecked((c) => ({ ...c, [n]: !c[n] }));
  const reset = () => setChecked({});

  const doneCount = Object.values(checked).filter(Boolean).length;
  const total = ITEMS.length;

  return (
    <aside className={"qc-panel" + (collapsed ? " qc-collapsed" : "")}>
      <div className="qc-head">
        <div className="qc-head-text">
          <div className="qc-title">Copy QC</div>
          <div className="qc-meta">
            {doneCount} of {total} checked
          </div>
        </div>
        <button
          type="button"
          className="qc-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {!collapsed && (
        <>
          <ol className="qc-list">
            {ITEMS.map((it) => {
              const isOn = !!checked[it.num];
              return (
                <li key={it.num} className={"qc-item" + (isOn ? " is-on" : "")}>
                  <label className="qc-row">
                    <input
                      type="checkbox"
                      className="qc-check"
                      checked={isOn}
                      onChange={() => toggle(it.num)}
                    />
                    <span className="qc-num">{it.num}</span>
                    <span className="qc-body">
                      <span className="qc-item-title">{it.title}</span>
                      <span className="qc-item-hint">{it.hint}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
          <div className="qc-foot">
            <button type="button" className="qc-reset" onClick={reset}>
              Reset
            </button>
          </div>
        </>
      )}

      <style>{QC_CSS}</style>
    </aside>
  );
}

const QC_CSS = `
.qc-panel {
  position: fixed;
  top: 96px;
  right: 16px;
  width: 268px;
  z-index: 40;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border);
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(var(--shadow-rgb), 0.4);
  font-family: var(--hml-font-sans);
  color: var(--hml-text-primary);
  overflow: hidden;
}
.qc-panel.qc-collapsed {
  width: auto;
}

.qc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--hml-bg-elev-2);
  border-bottom: 1px solid var(--hml-border-subtle);
}
.qc-collapsed .qc-head {
  border-bottom: 0;
  padding: 8px 12px;
}
.qc-head-text { flex: 1; min-width: 0; }
.qc-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hml-text-primary);
}
.qc-meta {
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  margin-top: 2px;
  font-family: var(--hml-font-mono);
  letter-spacing: 0.04em;
}
.qc-collapsed .qc-meta { display: none; }

.qc-collapse-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--hml-border);
  background: transparent;
  color: var(--hml-text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qc-collapse-btn:hover {
  color: var(--hml-text-primary);
  border-color: var(--hml-border-strong);
}

.qc-list {
  list-style: none;
  margin: 0;
  padding: 6px;
}
.qc-item {
  border-radius: 6px;
  transition: background 120ms ease;
}
.qc-item:hover { background: rgba(var(--ink), 0.03); }
.qc-item.is-on { background: color-mix(in srgb, var(--positive) 6%, transparent); }

.qc-row {
  display: grid;
  grid-template-columns: 16px 20px 1fr;
  gap: 9px;
  align-items: flex-start;
  padding: 9px 8px;
  cursor: pointer;
  user-select: none;
}

.qc-check {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: var(--positive);
  cursor: pointer;
}

.qc-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--hml-font-mono);
}
.qc-item.is-on .qc-num {
  background: color-mix(in srgb, var(--positive) 18%, transparent);
  border-color: color-mix(in srgb, var(--positive) 50%, transparent);
  color: var(--positive);
}

.qc-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qc-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--hml-text-primary);
  line-height: 1.3;
}
.qc-item.is-on .qc-item-title { color: var(--hml-text-primary); }
.qc-item-hint {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.35;
}

.qc-foot {
  padding: 8px 12px 12px;
  display: flex;
  justify-content: flex-end;
}
.qc-reset {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-tertiary);
  border-radius: 4px;
  cursor: pointer;
}
.qc-reset:hover {
  color: var(--hml-text-primary);
  border-color: var(--hml-border-strong);
}
`;
