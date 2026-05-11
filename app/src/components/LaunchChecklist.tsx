import type { ChecklistItem, ChecklistStatus } from "../lib/types";

type Props = {
  items: ChecklistItem[];
  onItemStatusChange: (id: string, next: ChecklistStatus) => void;
  busy?: boolean;
};

const ORDER: ChecklistStatus[] = ["stop", "hold", "go"];

export function LaunchChecklist({ items, onItemStatusChange, busy }: Props) {
  const cleared = items.filter((i) => i.status === "go").length;
  const total = items.length;

  return (
    <div className="launch-check">
      <div className="launch-check-head">
        <span className="launch-check-eye">
          LAUNCH READINESS · {total} CHECK{total === 1 ? "" : "S"}
        </span>
        <span className="launch-check-count">
          {cleared} / {total} CLEARED
        </span>
      </div>

      <ul className="launch-check-list">
        {items.map((item) => (
          <li key={item.id} className="launch-row">
            <div className="launch-row-main">
              <span className={`launch-dot ${item.status}`} />
              <span className="launch-label">{item.label}</span>
              <div className="launch-seg" role="group" aria-label="status">
                {ORDER.map((s) => {
                  const active = item.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`launch-seg-btn ${s} ${active ? "active" : ""}`}
                      disabled={busy}
                      aria-pressed={active}
                      onClick={() => {
                        if (!active) onItemStatusChange(item.id, s);
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            {item.note && <div className="launch-note">{item.note}</div>}
          </li>
        ))}
      </ul>

      <div className="launch-check-foot">Click a check to update its status.</div>
    </div>
  );
}
